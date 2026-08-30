import { nanoid } from "nanoid";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { cargarImagen } from "@/lib/lab/quitar-fondo";
import { pngBase64ABlob } from "@/lib/lab/png-base64";
import { celdasSpriteEnRejilla, cortarHoja, tiraDeFotogramas } from "@/lib/lab/sprites";
import type { SpriteEnCapa } from "@/lib/lab/sprite-capa";
import type { EscenaCapa } from "./model";
import type { ElementoVivo } from "./plan-medios";

// La foto viva, hecha con actores recortados en vez de repintando la escena.
//
// EL PROBLEMA DE LA OTRA TÉCNICA. La foto viva de cuadros pide N fotos enteras,
// cada una a partir de la anterior. Funciona —y para agua, fuego o humo es lo
// único que funciona—, pero tiene dos facturas:
//   · el dinero: seis cuadros son SEIS imágenes de 1536×1024 por escena, y en
//     un capítulo de seis escenas con tres vivas son dieciocho;
//   · la deriva: cada cuadro se dibuja mirando al anterior, así que el error se
//     acumula. Al sexto, la cara del personaje ya no es la misma cara, y en
//     bucle eso se ve como un parpadeo de identidad.
//
// LO QUE SE HACE AQUÍ. La foto original NO se toca: se queda de fondo, intacta.
// Encima se pegan actores que sí se animan, y cada actor sale de UNA sola hoja
// de sprites —los seis cuadros del pájaro en una imagen, que es lo que el
// taller ya sabía hacer—. Un actor cuesta una imagen, no seis, y la escena de
// debajo no puede derivar porque nadie la vuelve a dibujar.
//
// CUÁNDO NO SIRVE. Cuando lo que se mueve no tiene silueta: el oleaje de todo
// un mar, una niebla, la lluvia sobre el cuadro entero. Eso no se recorta, así
// que ahí sigue mandando la técnica de cuadros. Las dos conviven a propósito;
// la elección la hace la IA en el plan de la escena, y se puede cambiar a mano.
//
// CÓMO SE GUARDA. Como capas de la escena: la foto de fondo y un actor por
// capa, con su `spr`. El motor ya sabe pintar eso —es el mismo dibujante del
// laboratorio—, así que esto no toca ni el reproductor ni el exportador.

/** Dónde se coloca la foto de fondo en la pila de profundidad. */
const DEPTH_FONDO = 0.4;

/**
 * Las capas de una foto viva con actores, a partir de lo que ya está dibujado.
 *
 * Es la parte sin red ni navegador: entra qué actores hay y con qué imagen se
 * quedó cada uno, sale la escena montada. Aparte a propósito, para poder
 * comprobarla sin levantar medio mundo.
 */
export function capasDeVivaSprites(opts: {
  /** El id de la foto de la escena, la que se queda quieta debajo. */
  stillId: string;
  nombreFondo?: string;
  actores: {
    elemento: ElementoVivo;
    /** La tira ya recortada y guardada. */
    imageId: string;
    /** Los que quedaron DE VERDAD: cortar puede descartar celdas vacías. */
    fotogramas: number;
    nombre?: string;
  }[];
}): EscenaCapa[] {
  const fondo: EscenaCapa = {
    id: nanoid(6),
    imageId: opts.stillId,
    nombre: opts.nombreFondo || "Foto",
    depth: DEPTH_FONDO,
    escala: 1,
    opacidad: 1,
  };

  const actores = opts.actores.map((a, i) => {
    const e = a.elemento;
    // Lo que está más abajo del cuadro se pinta más tarde y con más
    // profundidad: es la regla que hace que un actor de primer plano tape al
    // que está al fondo sin tener que decírselo a nadie.
    const cerca = Math.max(0, Math.min(1, e.y));
    const spr: SpriteEnCapa = {
      fotogramas: Math.max(1, a.fotogramas),
      fps: e.fps,
      vista: e.vista,
      direccionBase: e.direccion,
      accion: e.accion,
      anclaje: e.anclaje,
      x: e.x,
      y: e.y,
      alto: e.alto,
      // «capa» y no «pantalla»: el actor forma parte del decorado, así que si
      // la toma hace zoom tiene que crecer con la foto. Con «pantalla» se
      // quedaría del mismo tamaño mientras el fondo se acerca, y eso se ve
      // como un recorte pegado encima.
      espacio: "capa",
      sincronizar: true,
      ...(e.espejo ? { espejo: true } : {}),
      ...(e.hasta ? {
        trayectoria: {
          x: e.hasta.x, y: e.hasta.y, segundos: e.hasta.segundos,
          ...(e.hasta.bucle ? { bucle: true } : {}),
        },
      } : {}),
    };
    return {
      id: nanoid(6),
      imageId: a.imageId,
      nombre: a.nombre || nombreDeActor(e.que, i),
      depth: Math.round(Math.max(0.45, Math.min(0.95, 0.5 + cerca * 0.45)) * 100) / 100,
      escala: 1,
      opacidad: 1,
      spr,
    } satisfies EscenaCapa;
  });

  return [fondo, ...actores];
}

/** Un nombre corto para la lista de capas. La descripción entera no cabe. */
export function nombreDeActor(que: string, indice: number): string {
  const limpio = que.replace(/[^\p{L}\p{N} ]+/gu, " ").trim().split(/\s+/).slice(0, 3).join(" ");
  return limpio ? limpio.slice(0, 40) : `Actor ${indice + 1}`;
}

export interface ActorMontado {
  imageId: string;
  fotogramas: number;
  nombre: string;
  /** Lo que hubo que enderezar, si hubo algo. */
  aviso?: string;
}

/**
 * Pide la hoja de UN actor, la recorta y la deja guardada como tira.
 *
 * Se apoya en la ruta del taller —la misma que usa el laboratorio— porque ahí
 * ya está resuelto lo difícil: el prompt de la rejilla, el fondo magenta plano
 * y la comprobación de que el modelo admite hojas. Copiarlo aquí habría sido
 * mantener dos versiones del mismo prompt, que es como se desincronizan.
 */
export async function montarActor(
  elemento: ElementoVivo,
  opts: {
    calidad?: "low" | "medium" | "high";
    guardar: (blob: Blob, nombre: string) => Promise<string>;
    indice?: number;
  },
): Promise<ActorMontado> {
  const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/sprite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      que: elemento.que,
      fotogramas: elemento.fotogramas,
      forma: "tira",
      vista: elemento.vista,
      direccion: elemento.direccion,
      accion: elemento.accion,
      calidad: opts.calidad,
    }),
  });
  if (!r.ok) throw new Error(j?.error || "No se pudo dibujar el actor.");
  if (!j?.imagen) throw new Error("El servidor contestó sin la hoja del actor.");

  const hoja = pngBase64ABlob(j.imagen);
  const url = URL.createObjectURL(hoja);
  let ancho = 0;
  let alto = 0;
  try {
    const img = await cargarImagen(url);
    ancho = img.naturalWidth;
    alto = img.naturalHeight;
  } finally {
    URL.revokeObjectURL(url);
  }

  const esperados = Number(j.fotogramas) || elemento.fotogramas;
  const columnas = Number(j.columnas) || esperados;
  const filas = Number(j.filas) || 1;
  const croma = typeof j.croma === "string" && /^#[0-9a-f]{6}$/i.test(j.croma) ? j.croma : "#FF00FF";

  const urlCorte = URL.createObjectURL(hoja);
  let cortada: Awaited<ReturnType<typeof cortarHoja>>;
  try {
    cortada = await cortarHoja({
      dataUrl: urlCorte,
      fotogramas: esperados,
      forma: "tira",
      croma,
      celdas: celdasSpriteEnRejilla(ancho, alto, esperados, { columnas, filas }),
    });
  } finally {
    URL.revokeObjectURL(urlCorte);
  }
  if (!cortada.fotogramas.length) {
    throw new Error("La hoja salió sin ningún fotograma recortable.");
  }

  let tira: Awaited<ReturnType<typeof tiraDeFotogramas>>;
  try {
    tira = await tiraDeFotogramas(cortada.fotogramas);
  } finally {
    // Los object URL de los cuadros sueltos no hacen falta en cuanto están
    // pegados: si no se sueltan, un capítulo con actores se come la memoria.
    cortada.fotogramas.forEach((f) => {
      if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
    });
  }

  const nombre = nombreDeActor(elemento.que, opts.indice ?? 0);
  const imageId = await opts.guardar(tira.blob, `actor-${nanoid(6)}`);
  return {
    imageId,
    fotogramas: tira.fotogramas,
    nombre,
    ...(cortada.descartados
      ? { aviso: `${nombre}: ${cortada.descartados} cuadros salieron vacíos y se descartaron.` }
      : {}),
  };
}

export interface VivaSpritesHecha {
  capas: EscenaCapa[];
  avisos: string[];
  /** Los actores que no salieron. La escena se monta con los que sí. */
  fallos: string[];
}

/**
 * La escena entera: todos los actores del plan, montados sobre la foto.
 *
 * Un actor que falle NO tumba la escena. Con tres pedidos y dos buenos, se
 * monta con dos y se dice cuál faltó: tirar los dos que ya están pagados para
 * castigar al que falló no ayuda a nadie.
 */
export async function montarVivaConSprites(opts: {
  stillId: string;
  elementos: ElementoVivo[];
  calidad?: "low" | "medium" | "high";
  guardar: (blob: Blob, nombre: string) => Promise<string>;
  onPaso?: (texto: string) => void;
}): Promise<VivaSpritesHecha> {
  const actores: Parameters<typeof capasDeVivaSprites>[0]["actores"] = [];
  const avisos: string[] = [];
  const fallos: string[] = [];

  for (let i = 0; i < opts.elementos.length; i++) {
    const e = opts.elementos[i];
    opts.onPaso?.(`Actor ${i + 1} de ${opts.elementos.length}: ${nombreDeActor(e.que, i)}…`);
    try {
      const hecho = await montarActor(e, {
        calidad: opts.calidad, guardar: opts.guardar, indice: i,
      });
      if (hecho.aviso) avisos.push(hecho.aviso);
      actores.push({
        elemento: e, imageId: hecho.imageId,
        fotogramas: hecho.fotogramas, nombre: hecho.nombre,
      });
    } catch (err) {
      fallos.push(`${nombreDeActor(e.que, i)}: ${(err as Error).message}`);
    }
  }

  if (!actores.length) {
    throw new Error(fallos.length ? fallos.join(" · ") : "No se pidió ningún actor.");
  }
  return {
    capas: capasDeVivaSprites({ stillId: opts.stillId, actores }),
    avisos,
    fallos,
  };
}
