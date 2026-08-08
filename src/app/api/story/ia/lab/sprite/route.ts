import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { leerAjustes, calidadEfectiva } from "@/lib/story/ajustes";
import { CROMA } from "@/lib/lab/quitar-fondo";

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
  fotogramas: z.number().int().min(2).max(12).default(6),
  /** Apaisada para lo que camina o vuela; alta para lo que cae. */
  forma: z.enum(["tira", "columna"]).default("tira"),
  /** Ángulo coherente con la ruta que el director escribió. */
  vista: z.enum(["lateral", "frontal", "trasera", "superior", "libre"]).default("lateral"),
  calidad: z.enum(["low", "medium", "high"]).optional(),
  modelo: z.string().max(80).optional(),
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
  columna: boolean,
  vista: "lateral" | "frontal" | "trasera" | "superior" | "libre",
) {
  const rejilla = columna
    ? `Arrange them in ONE VERTICAL COLUMN of exactly ${n} equal cells, top to bottom.`
    : `Arrange them in ONE HORIZONTAL ROW of exactly ${n} equal cells, left to right.`;
  const angulo = {
    lateral: "Strict side view; the subject faces horizontally.",
    frontal: "Strict front view; the subject faces the viewer.",
    trasera: "Strict back view; the subject faces away from the viewer.",
    superior: "Strict top-down view, seen vertically from above.",
    libre: "Keep the viewing angle requested in the subject description exactly consistent across every frame.",
  }[vista];
  return [
    `SPRITE SHEET for 2D animation: ${n} frames of one single ${que}, in motion.`,
    rejilla,
    "Each cell shows the SAME character/object at the SAME size and the SAME position within its cell, only the pose changes across frames — it is one animation cycle that loops back to the first frame.",
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
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
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

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.imagen;
  if (!modelo) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });

  // Esta ruta es solo de admin, así que se le respeta la calidad que pida; si
  // no dice ninguna, manda la del panel, que en pruebas es la barata.
  const calidad = calidadEfectiva(await leerAjustes(), true, parsed.data.calidad);
  const { que, fotogramas, forma, vista } = parsed.data;

  try {
    const r = await fetch(OPENAI("/v1/images/generations"), {
      signal: espera("imagen"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        prompt: prompt(que, fotogramas, forma === "columna", vista),
        size: TAMANOS[forma],
        n: 1,
        quality: calidad,
      }),
    });

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

    return NextResponse.json({
      ok: true,
      imagen: b64,
      fotogramas,
      forma,
      vista,
      calidad,
      croma: CROMA,
      size: TAMANOS[forma],
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "imagen") }, { status: 502 });
  }
}
