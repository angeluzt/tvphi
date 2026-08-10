import "server-only";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizarMarcosAtlas, reservarMarcoAtlas, TAMANO_ATLAS_SPRITE, BORDE_ATLAS_SPRITE,
  type CursorAtlasSprite, type MarcoAtlasSprite,
} from "./atlas-sprite";

// Guardar los fotogramas de muchas animaciones en pocas imágenes grandes.
//
// EL PROBLEMA QUE RESUELVE. Cada animación guardaba su tira suelta: doce PNG
// pequeños por animación, treinta animaciones por personaje, veinte personajes.
// Son miles de filas con imágenes diminutas, y cada una paga su propia cabecera
// PNG y su propio viaje. El atlas las pega en páginas de 2048×2048: la
// animación deja de guardar su tira (`tira: null`) y en su lugar apunta a
// «página X, recorte (x, y, ancho, alto)» por fotograma.
//
// CÓMO SE REPARTE EL SITIO. `reservarMarcoAtlas` va colocando en filas, de
// izquierda a derecha, bajando cuando no cabe. Es lo más simple que funciona y
// no necesita recolocar nada de lo ya escrito, que es la propiedad importante:
// una página escrita no se reordena nunca.
//
// DÓNDE ESTÁ EL COSTE, Y POR QUÉ IMPORTA DÓNDE SE PAGA. Recortar los N
// fotogramas y recomprimir una página de 2048×2048 son operaciones de CPU de
// cientos de milisegundos. Hacerlas DENTRO de la transacción significaba tener
// cogidos una conexión de Postgres y el lock del usuario todo ese rato. El
// recorte de fotogramas —que es la parte que crece con el número de
// fotogramas— se hace ahora FUERA: solo toca los bytes de esta animación, así
// que no necesita exclusión con nadie. Dentro queda únicamente pegar y
// escribir, que sí toca páginas compartidas y tiene que ser atómico.

/** Una página del atlas ya cargada en memoria, con su hueco libre. */
interface Pagina extends CursorAtlasSprite {
  id: string;
  png: Buffer;
  usados: number;
}

const MARGEN = BORDE_ATLAS_SPRITE;

/**
 * Una página vacía y transparente.
 *
 * Nivel de compresión medio a propósito: una página en blanco comprime igual de
 * bien a 6 que a 9, y el 9 cuesta bastante más CPU.
 */
const paginaVacia = () =>
  sharp({
    create: {
      width: TAMANO_ATLAS_SPRITE, height: TAMANO_ATLAS_SPRITE,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png({ compressionLevel: 6 }).toBuffer();

/**
 * Parte una tira en sus fotogramas.
 *
 * Comprueba primero que la tira mide exactamente lo que dice la fila: si no
 * cuadra, recortar por esas coordenadas daría medio bicho en cada celda sin que
 * nada avisara.
 */
async function cortarFotogramas(tira: Buffer, w: number, h: number, n: number) {
  const m = await sharp(tira).metadata();
  if (m.width !== w * n || m.height !== h) throw new Error("Tira inválida");
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      sharp(tira)
        .extract({ left: i * w, top: 0, width: w, height: h })
        .png({ compressionLevel: 6 })
        .toBuffer()),
  );
}

const aPagina = (p: {
  id: string; ancho: number; alto: number; png: Uint8Array;
  cursorX: number; cursorY: number; altoFila: number; usados: number;
}): Pagina => ({
  id: p.id, ancho: p.ancho, alto: p.alto, png: Buffer.from(p.png),
  cursorX: p.cursorX, cursorY: p.cursorY, altoFila: p.altoFila, usados: p.usados,
});

/**
 * Mete los fotogramas de una animación en el atlas del usuario y le quita la
 * tira suelta.
 *
 * Devuelve `true` si quedó archivada, `false` si no cabía (y entonces conserva
 * su tira, que sigue siendo perfectamente utilizable).
 */
export async function archivarAnimacionEnAtlas(userId: string, id: string) {
  // ── Fuera de la transacción: leer y cortar ────────────────────────────────
  const previa = await prisma.spriteAnimation.findFirst({
    where: { id, character: { userId } },
    select: { tira: true, atlasFrames: true, fotogramas: true, ancho: true, alto: true },
  });
  if (!previa) throw new Error("Animación no encontrada");
  // Ya archivada: no hay tira que mover. Se contesta según si sus marcos son
  // legibles, que es lo que decide si la animación se puede volver a pintar.
  if (!previa.tira) {
    return !!normalizarMarcosAtlas(previa.atlasFrames, previa.fotogramas, previa.ancho, previa.alto);
  }
  // Un fotograma más grande que la página no cabe por definición.
  if (previa.ancho + MARGEN * 2 > TAMANO_ATLAS_SPRITE || previa.alto + MARGEN * 2 > TAMANO_ATLAS_SPRITE) {
    return false;
  }

  // El grueso del trabajo de CPU, sin nada bloqueado: son los bytes de esta
  // animación y nadie más los toca.
  const fotos = await cortarFotogramas(
    Buffer.from(previa.tira), previa.ancho, previa.alto, previa.fotogramas,
  );

  // ── Dentro: colocar, pegar y escribir ─────────────────────────────────────
  return prisma.$transaction(async (tx) => {
    // El lock es por usuario: dos archivados suyos a la vez se pisarían al
    // escribir la misma página. Los de otros usuarios no se estorban.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tvphi-atlas:${userId}`}))`;

    // Se vuelve a leer DENTRO del lock: entre el corte de arriba y este punto,
    // otro archivado del mismo usuario pudo haber terminado ya con esta misma
    // animación. Sin esta comprobación se escribiría dos veces.
    const a = await tx.spriteAnimation.findFirst({
      where: { id, character: { userId } },
      select: { tira: true, atlasFrames: true, fotogramas: true, ancho: true, alto: true },
    });
    if (!a) throw new Error("Animación no encontrada");
    if (!a.tira) {
      return !!normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto);
    }
    if (a.fotogramas !== previa.fotogramas || a.ancho !== previa.ancho || a.alto !== previa.alto) {
      // La animación cambió de forma mientras cortábamos: los fotogramas que
      // llevamos en la mano ya no son los suyos. Se deja para el próximo
      // guardado en vez de escribir algo incoherente.
      return false;
    }

    const previos = normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto);
    const idsPrevios = [...new Set(previos?.map((x) => x.atlasId) ?? [])];
    const filasPrevias = idsPrevios.length
      ? await tx.spriteAtlas.findMany({ where: { userId, id: { in: idsPrevios } } })
      : [];
    const paginas = new Map<string, Pagina>(filasPrevias.map((p) => [p.id, aPagina(p)]));

    let marcos: MarcoAtlasSprite[] = [];
    if (previos && filasPrevias.length === idsPrevios.length) {
      // Reescritura: ya tenía sitio reservado y sus páginas siguen existiendo.
      marcos = previos;
    } else {
      // Colocación nueva: se sigue rellenando la última página empezada.
      const ultima = await tx.spriteAtlas.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
      let p: Pagina | null = ultima ? aPagina(ultima) : null;
      if (p) paginas.set(p.id, p);
      for (let i = 0; i < fotos.length; i++) {
        let sitio = p ? reservarMarcoAtlas(p, a.ancho, a.alto, MARGEN) : null;
        if (!p || !sitio) {
          const png = await paginaVacia();
          const nueva = await tx.spriteAtlas.create({ data: { userId, png, bytes: png.length } });
          p = aPagina(nueva);
          paginas.set(p.id, p);
          sitio = reservarMarcoAtlas(p, a.ancho, a.alto, MARGEN);
        }
        // Con una página recién creada esto no debería pasar nunca: el tamaño
        // ya se comprobó arriba. Si pasa, mejor conservar la tira que romper.
        if (!sitio) return false;
        p.cursorX = sitio.siguiente.cursorX;
        p.cursorY = sitio.siguiente.cursorY;
        p.altoFila = sitio.siguiente.altoFila;
        p.usados += a.ancho * a.alto;
        marcos.push({ atlasId: p.id, x: sitio.x, y: sitio.y, ancho: a.ancho, alto: a.alto });
      }
    }

    // Pegar, página por página. Cada fotograma se pinta en dos pasadas:
    // primero un rectángulo opaco en modo «dest-out» que BORRA lo que hubiera
    // —si no, al reescribir una animación el dibujo viejo asomaría por debajo
    // del nuevo donde este sea transparente— y luego el fotograma encima.
    const porPagina = new Map<string, { marco: MarcoAtlasSprite; foto: Buffer }[]>();
    marcos.forEach((marco, i) => {
      porPagina.set(marco.atlasId, [...(porPagina.get(marco.atlasId) ?? []), { marco, foto: fotos[i] }]);
    });

    const goma = Buffer.alloc(a.ancho * a.alto * 4, 255);
    for (const [pid, elems] of porPagina) {
      const p = paginas.get(pid);
      if (!p) return false;
      const ops = elems.flatMap(({ marco, foto }) => [
        {
          input: goma,
          raw: { width: a.ancho, height: a.alto, channels: 4 as const },
          left: marco.x, top: marco.y, blend: "dest-out" as const,
        },
        { input: foto, left: marco.x, top: marco.y, blend: "over" as const },
      ]);
      const png = await sharp(p.png).composite(ops).png({ compressionLevel: 6 }).toBuffer();
      await tx.spriteAtlas.update({
        where: { id: pid },
        data: {
          png, bytes: png.length,
          cursorX: p.cursorX, cursorY: p.cursorY, altoFila: p.altoFila, usados: p.usados,
        },
      });
    }

    // Y ya no hace falta la tira: se rehace desde el atlas cuando se pida.
    await tx.spriteAnimation.update({
      where: { id },
      data: {
        atlasFrames: marcos as unknown as Prisma.InputJsonValue,
        tira: null,
        bytesTira: 0,
      },
    });
    return true;
  }, { maxWait: 10_000, timeout: 30_000 });
}

/**
 * Rehace la tira de una animación archivada, pegando sus fotogramas.
 *
 * Si la animación todavía conserva su tira suelta se devuelve tal cual: no hay
 * nada que rehacer.
 */
export async function reconstruirTiraAnimacion(o: {
  userId: string;
  tira: Uint8Array | Buffer | null;
  atlasFrames: unknown;
  fotogramas: number;
  ancho: number;
  alto: number;
}) {
  if (o.tira) return Buffer.from(o.tira);

  const marcos = normalizarMarcosAtlas(o.atlasFrames, o.fotogramas, o.ancho, o.alto);
  if (!marcos) throw new Error("Sin tira ni atlas");

  const ids = [...new Set(marcos.map((m) => m.atlasId))];
  const filas = await prisma.spriteAtlas.findMany({
    where: { userId: o.userId, id: { in: ids } },
    select: { id: true, png: true },
  });
  // Falta alguna página: la tira saldría con huecos. Mejor un error claro que
  // un sprite con fotogramas en blanco que nadie sabe explicar.
  if (filas.length !== ids.length) throw new Error("Atlas incompleto");

  const paginas = new Map(filas.map((p) => [p.id, Buffer.from(p.png)]));
  const fotos = await Promise.all(marcos.map((m) =>
    sharp(paginas.get(m.atlasId)!)
      .extract({ left: m.x, top: m.y, width: m.ancho, height: m.alto })
      .png({ compressionLevel: 6 })
      .toBuffer()));

  return sharp({
    create: {
      width: o.ancho * o.fotogramas, height: o.alto,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(fotos.map((input, i) => ({ input, left: i * o.ancho, top: 0, blend: "over" as const })))
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * Borra las páginas del atlas que ya no usa ninguna animación.
 *
 * Hace falta porque las páginas cuelgan del USUARIO, no del personaje: una
 * página puede tener fotogramas de varios, así que borrar un personaje no puede
 * llevarse páginas por delante sin mirar. Se llama después de cada borrado.
 */
export async function limpiarPaginasAtlasHuerfanas(userId: string) {
  const animaciones = await prisma.spriteAnimation.findMany({
    where: { character: { userId }, atlasFrames: { not: Prisma.DbNull } },
    select: { atlasFrames: true, fotogramas: true, ancho: true, alto: true },
  });

  const usados = new Set<string>();
  for (const a of animaciones) {
    normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto)
      ?.forEach((m) => usados.add(m.atlasId));
  }

  return prisma.spriteAtlas.deleteMany({
    where: { userId, ...(usados.size ? { id: { notIn: [...usados] } } : {}) },
  });
}
