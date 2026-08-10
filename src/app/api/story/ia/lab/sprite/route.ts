import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo, estadoCupoImagenes,
  registrarUsoIaImagen, mensajeCupoImagenes } from "@/lib/story/cupo";
import { leerAjustes, calidadEfectiva } from "@/lib/story/ajustes";
import { CROMA } from "@/lib/lab/quitar-fondo";
import { rejillaSpriteEquilibrada } from "@/lib/lab/sprites";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";
import { reconstruirTiraAnimacion } from "@/lib/lab/atlas-sprite.server";

// Una hoja de sprites: N fotogramas del mismo bicho, en fila.
//
// POR QUÉ EN UNA SOLA IMAGEN. Un pájaro que aletea son ocho dibujos. Pedirlos
// de uno en uno son ocho llamadas —ocho veces el precio— y encima salen ocho
// pájaros distintos, porque cada llamada empieza de cero. En una sola imagen el
// modelo ve los ocho a la vez y los hace del mismo bicho, que es justo lo que
// hace falta para que la animación no parpadee.
//
// Y sale a UNA imagen: en calidad baja, ocho fotogramas por $0.005. Se paga una
// vez y el sprite se reutiliza en todos los vídeos que quieras.
//
// SOBRE EL FONDO. Se pide magenta plano, no transparencia: gpt-image-2 no sabe
// devolver alfa, y pedírselo es tirar una llamada. El croma lo quita el cliente
// con lo que ya usa para las capas.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  /** Qué es. En inglés se le da mejor, pero se acepta lo que venga. */
  que: z.string().min(3).max(400),
  /** Cuántos fotogramas. Más de 12 y salen del tamaño de un sello. */
  fotogramas: z.number().int().min(1).max(12).default(6),
  /** Apaisada para lo que camina o vuela; alta para lo que cae. */
  forma: z.enum(["tira", "columna"]).default("tira"),
  distribucion: z.enum(["equilibrada", "fila", "columna"]).default("equilibrada"),
  /** Ángulo coherente con la ruta que el director escribió. */
  vista: z.enum(["lateral", "frontal", "trasera", "superior", "libre"]).default("lateral"),
  /** Hacia dónde apunta el dibujo original; luego el montaje puede espejarlo. */
  direccion: z.enum(["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"]).default("derecha"),
  accion: z.enum(["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"]).default("otro"),
  calidad: z.enum(["low", "medium", "high"]).optional(),
  modelo: z.string().max(80).optional(),
  /** Solo personajes del taller de sprites (cuadro maestro), no fichas de Historias. */
  personajeId: z.string().cuid().optional(),
  /** Animación del mismo personaje de la que se toma un fotograma como identidad. */
  referenciaAnimacionId: z.string().cuid().optional(),
  /** Qué cuadro de esa animación usar. Por defecto el último (encadenar pose final → siguiente). */
  referenciaCuadro: z.enum(["primero", "ultimo", "medio"]).default("ultimo"),
});

const TAMANOS = { tira: "1536x1024", columna: "1024x1536" } as const;

/**
 * El prompt de la hoja.
 *
 * Cada línea está aquí porque sin ella sale mal: sin la rejilla se solapan, sin
 * «same size and position» cada fotograma tiene el bicho a otra escala y la
 * animación da saltos, y sin prohibir sombras y suelo aparece un decorado que
 * luego no se puede recortar.
 */
function prompt(
  que: string,
  n: number,
  vista: "lateral" | "frontal" | "trasera" | "superior" | "libre",
  direccion: "derecha" | "izquierda" | "frente" | "espaldas" | "arriba" | "abajo" | "ninguna",
  accion: "quieto" | "caminar" | "correr" | "volar" | "flotar" | "nadar" | "caer" | "girar" | "otro",
  columnas: number, filas: number, conReferencia: boolean,
) {
  const vacias = columnas * filas - n;
  const rejilla = `Arrange the ${n} frames in a ${columnas}-column by ${filas}-row grid of equal cells, in reading order.`
    + (vacias ? ` Leave the final ${vacias} unused cell(s) completely magenta.` : "");
  const angulo = {
    lateral: direccion === "izquierda"
      ? "Strict side view; the subject faces LEFT in every frame."
      : "Strict side view; the subject faces RIGHT in every frame.",
    frontal: "Strict front view; the subject faces the viewer.",
    trasera: "Strict back view; the subject faces away from the viewer.",
    superior: "Strict top-down view, seen vertically from above.",
    libre: "Keep the viewing angle requested in the subject description exactly consistent across every frame.",
  }[vista];
  return [
    `SPRITE SHEET for 2D animation: ${n} frames of one single ${que}, in motion.`,
    conReferencia
      ? "IDENTITY REFERENCE: preserve the exact face, proportions, silhouette, colors, clothes, accessories, line work and rendering style of the input character. Change only the pose."
      : "Create one distinctive design and repeat that exact identity in every cell.",
    `Animation action: ${accion}. Intrinsic facing direction: ${direccion}.`,
    rejilla,
    n === 1 ? "Draw one complete clean pose inside the single cell."
      : "Each cell shows the SAME character/object at the SAME size and position; only the pose changes in a looping cycle.",
    "CRITICAL SAFE AREA: the complete subject, including feet, tails, wings, antennae, smoke and loose parts, must fit inside the central 60% of EACH cell. Leave at least 15% empty pure-magenta margin on all four sides of every cell.",
    "No subject pixel may touch or cross a cell edge. Never borrow space from a neighboring cell. If the subject is long or tall, SHRINK the entire subject uniformly until every extremity fits with the safe margin.",
    `BACKGROUND: every pixel that is not the subject must be flat pure magenta ${CROMA} (R255 G0 B255), perfectly uniform.`,
    "No gradient, no shading, no vignette, no glow, no reflection of the magenta on the subject.",
    "No ground, no shadow, no scenery, no frame borders, no grid lines, no numbers, no text, no watermark.",
    `${angulo} Clean silhouette, even lighting, no motion blur.`,
    `Remember: background = flat ${CROMA} magenta, subject = the ${que}. Nothing else.`,
  ].join("\n");
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const bloqueo = await bloqueoDeGasto(user);
  if (bloqueo) return respuestaBloqueo(bloqueo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const admin = esAdminHistorias(user.email);
  const ajustes = await leerAjustes();
  if (!ajustes.imagenesIa && !admin) return NextResponse.json({ error: "Ahora mismo no se pueden generar imágenes con IA." }, { status: 403 });
  const cupoImg = await estadoCupoImagenes(user.id, user.email);
  if (!cupoImg.exento && cupoImg.quedan <= 0) return NextResponse.json({ error: mensajeCupoImagenes(cupoImg), sinCupo: true }, { status: 429 });
  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = admin && parsed.data.modelo ? parsed.data.modelo : guardados.imagen;
  if (!modelo) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });

  // Esta ruta es solo de admin, así que se le respeta la calidad que pida; si
  // no dice ninguna, manda la del panel, que en pruebas es la barata.
  const calidad = calidadEfectiva(ajustes, admin, parsed.data.calidad);
  const {
    que, fotogramas, forma, distribucion, vista, direccion, accion,
    personajeId, referenciaAnimacionId, referenciaCuadro,
  } = parsed.data;
  const rejilla = distribucion === "fila" ? { columnas: fotogramas, filas: 1 }
    : distribucion === "columna" ? { columnas: 1, filas: fotogramas }
      : rejillaSpriteEquilibrada(fotogramas, forma);

  let bufferReferencia: Buffer | null = null;
  let etiquetaRef = "maestro";

  if (referenciaAnimacionId) {
    const anim = await prisma.spriteAnimation.findFirst({
      where: {
        id: referenciaAnimacionId,
        character: { userId: user.id, ...(personajeId ? { id: personajeId } : {}) },
      },
      select: {
        id: true, nombre: true, characterId: true, tira: true, atlasFrames: true,
        fotogramas: true, ancho: true, alto: true,
      },
    });
    if (!anim) {
      return NextResponse.json({ error: "No encontré esa animación de referencia en tu taller." }, { status: 404 });
    }
    if (personajeId && anim.characterId !== personajeId) {
      return NextResponse.json({ error: "La animación de referencia no pertenece a ese personaje." }, { status: 400 });
    }
    try {
      const tira = await reconstruirTiraAnimacion({
        userId: user.id,
        tira: anim.tira,
        atlasFrames: anim.atlasFrames,
        fotogramas: anim.fotogramas,
        ancho: anim.ancho,
        alto: anim.alto,
      });
      const n = Math.max(1, anim.fotogramas);
      const idx = referenciaCuadro === "primero" ? 0
        : referenciaCuadro === "medio" ? Math.floor((n - 1) / 2)
          : n - 1;
      bufferReferencia = await sharp(tira)
        .extract({ left: idx * anim.ancho, top: 0, width: anim.ancho, height: anim.alto })
        .png()
        .toBuffer();
      etiquetaRef = `${anim.nombre} · cuadro ${idx + 1}/${n}`;
    } catch {
      return NextResponse.json({ error: "No se pudo leer el fotograma de la animación de referencia." }, { status: 500 });
    }
  } else if (personajeId) {
    const personaje = await prisma.spriteCharacter.findFirst({
      where: { id: personajeId, userId: user.id },
      select: { referencia: true },
    });
    if (!personaje) {
      return NextResponse.json({ error: "Ese personaje no pertenece a tu biblioteca de sprites." }, { status: 404 });
    }
    bufferReferencia = Buffer.from(personaje.referencia);
    etiquetaRef = "cuadro maestro";
  }

  const editable = /^(gpt-image-2|gpt-image-1\.5|gpt-image-1(?:$|-\d)|chatgpt-image-latest)/i.test(modelo);
  if (bufferReferencia && !editable) {
    return NextResponse.json({ error: `«${modelo}» no admite una imagen de referencia.` }, { status: 400 });
  }

  try {
    const p = prompt(que, fotogramas, vista, direccion, accion, rejilla.columnas, rejilla.filas, !!bufferReferencia);
    let r: Response;
    if (bufferReferencia) {
      const form = new FormData();
      form.set("model", modelo); form.set("prompt", p); form.set("size", TAMANOS[forma]);
      form.set("n", "1"); form.set("quality", calidad); form.set("output_format", "png"); form.set("background", "opaque");
      form.append("image[]", new Blob([new Uint8Array(bufferReferencia)], { type: "image/png" }), "character-reference.png");
      r = await fetch(OPENAI("/v1/images/edits"), { signal: espera("imagen"), method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    } else {
      r = await fetch(OPENAI("/v1/images/generations"), { signal: espera("imagen"), method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelo, prompt: p, size: TAMANOS[forma], n: 1, quality: calidad }) });
    }

    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch { /* abajo se decide */ }

    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const culpaNuestra = r.status >= 400 && r.status < 500;
      return NextResponse.json({
        error: crudo,
        reintentable: !culpaNuestra,
      }, { status: culpaNuestra ? 400 : 502 });
    }

    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: `«${modelo}» contestó sin imagen.` }, { status: 502 });
    }
    if (!cupoImg.exento) await registrarUsoIaImagen(user.id);

    return NextResponse.json({
      ok: true,
      imagen: b64,
      fotogramas,
      forma,
      vista,
      direccion,
      accion,
      calidad,
      croma: CROMA,
      size: TAMANOS[forma],
      columnas: rejilla.columnas, filas: rejilla.filas, distribucion,
      referenciaUsada: !!bufferReferencia,
      referenciaDe: bufferReferencia ? etiquetaRef : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "imagen") }, { status: 502 });
  }
}
