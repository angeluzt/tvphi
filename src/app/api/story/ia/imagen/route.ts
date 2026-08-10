import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import {
  esAdminHistorias, bloqueoDeGasto, respuestaBloqueo,
  reservarUsoIa, liberarUsoIa, mensajeCupoImagenes,
} from "@/lib/story/cupo";
import { leerAjustes, calidadEfectiva, usaReferenciaVfx } from "@/lib/story/ajustes";

// Generar la imagen de una escena.
//
// Con referencia VFX (PNG + máscara): /v1/images/edits, como el HTML de prueba.
// El modelo rellena el fondo negro/transparente alrededor de los efectos; la
// respuesta es SOLO la placa de fondo (sin recomponer VFX: TVPHI los anima).
// Sin referencia: /v1/images/generations con el prompt de texto.

const referencia = z.object({
  imagen: z.string().min(100).max(6_000_000),
  mascara: z.string().min(100).max(6_000_000).optional(),
  resumen: z.string().max(6000).optional(),
});

const cuerpo = z.object({
  prompt: z.string().min(4).max(4000),
  modelo: z.string().max(80).optional(),
  // El formato del video manda: una escena apaisada pedida cuadrada se ve mal.
  formato: z.enum(["16:9", "9:16", "1:1"]).optional(),
  /**
   * Calidad pedida. SOLO se le hace caso al admin: si un usuario normal la
   * mandara, un límite de gasto que se puede saltar tocando la petición no es
   * un límite. Para él manda siempre la del panel.
   */
  calidad: z.enum(["low", "medium", "high"]).optional(),
  referenciaVfx: referencia.optional(),
});

const TAMANOS: Record<string, string> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
};

const editable = (m: string) =>
  /^(gpt-image-2|gpt-image-1\.5|gpt-image-1(?:$|-\d)|chatgpt-image-latest)/i.test(m);

function promptConVfx(scene: string, summary = "") {
  return [
    scene.trim(),
    "Edit only the transparent background region. Preserve the visible input effects as fixed spatial anchors.",
    "DEPTH / OCCLUSION (important):",
    "- People MAY stand in front of or beside torches, fire, smoke, lamps, neon and similar emitters. That depth is natural and desired.",
    "- Do NOT put a face, head or body INSIDE a portal opening or magic circle. Portal interiors stay empty voids or architectural frames only.",
    "- Never the inverse of natural depth: do not place a portal/effect so it covers a character's face as if the person were stuck behind/under the effect.",
    "Create one continuous environment. Attach supports around anchors: braziers under fire, frames around portals, vents under smoke, fixtures at lamps.",
    "The returned image is the CLEAN BACKGROUND PLATE. Do not bake temporary motion (no floating particles, sparks, rain streaks, lightning bolts, motion trails).",
    "TVPHI will render animated effects on top. No poster, UI, labels, captions, borders or written text.",
    summary ? `VFX anchors on the full image:\n${summary}` : "",
  ].filter(Boolean).join("\n\n");
}

function promptSoloTexto(scene: string, summary = "") {
  if (!summary) return scene;
  return [
    scene.trim(),
    "Build believable physical sources for these future animated effects at the stated coordinates. Do not draw floating particles or temporary motion.",
    "People may stand in front of torches/fire/lamps. Do not put faces inside portal openings.",
    summary,
  ].join("\n\n");
}

function pngBytes(value: string): Buffer | null {
  try {
    const b = Buffer.from(
      value.replace(/^data:image\/png;base64,/, "").replace(/\s+/g, ""),
      "base64",
    );
    if (b.length < 100 || b.length > 5_000_000) return null;
    if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
    return b;
  } catch {
    return null;
  }
}

async function leerImagen(json: any): Promise<string | null> {
  const d = json?.data?.[0];
  let b64: string | null = d?.b64_json ?? null;
  if (!b64 && d?.url) {
    const img = await fetch(d.url);
    if (img.ok) b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
  }
  return b64;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Sin cupo no se gasta ni un token del servidor. El editor sigue entero y la
  // voz del navegador, que es gratis, sigue funcionando.
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const key = claveOpenAi();
  if (!key) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });
  }

  const admin = esAdminHistorias(user.email);
  const ajustes = await leerAjustes();

  // Interruptor general: con esto apagado, el usuario normal no gasta imágenes.
  if (!ajustes.imagenesIa && !admin) {
    return NextResponse.json({
      error: "Ahora mismo no se pueden generar imágenes con IA. Sube la tuya desde el editor.",
      imagenesApagadas: true,
    }, { status: 403 });
  }

  // Cupo de imágenes, aparte del de historias: una historia son varias imágenes
  // y son el 80% de la factura, así que se cuentan por su lado.
  const reserva = await reservarUsoIa(user.id, user.email, "imagen");
  if (!reserva.ok) {
    return NextResponse.json({
      error: reserva.mensaje, sinCupo: true, cupoImagenes: reserva.cupo,
    }, { status: 429 });
  }

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = admin && parsed.data.modelo
    ? parsed.data.modelo
    : guardados.imagen;
  if (!modelo) {
    await liberarUsoIa(reserva.id);
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });
  }
  const size = TAMANOS[parsed.data.formato ?? "16:9"] ?? TAMANOS["16:9"];
  const calidad = calidadEfectiva(ajustes, admin, parsed.data.calidad);
  // En baja no se manda la referencia: su entrada se cobra a fidelidad alta
  // pase lo que pase, así que pagarla para un borrador es tirar justo el dinero
  // que se intentaba ahorrar.
  const ref = usaReferenciaVfx(calidad) ? parsed.data.referenciaVfx : undefined;
  const imgBytes = ref ? pngBytes(ref.imagen) : null;
  const maskBytes = ref?.mascara ? pngBytes(ref.mascara) : null;

  let committed = false;
  try {
    let r: Response;
    let referenciaVfxUsada = false;

    if (imgBytes && editable(modelo)) {
      const form = new FormData();
      form.set("model", modelo);
      form.set("prompt", promptConVfx(parsed.data.prompt, ref?.resumen));
      form.set("size", size);
      form.set("n", "1");
      form.set("quality", calidad);
      form.set("output_format", "png");
      form.set("background", "opaque");
      // Sin input_fidelity: gpt-image-2 lo rechaza; el HTML de prueba tampoco lo manda.
      form.append(
        "image[]",
        new Blob([new Uint8Array(imgBytes)], { type: "image/png" }),
        "vfx-input.png",
      );
      if (maskBytes) {
        form.append(
          "mask",
          new Blob([new Uint8Array(maskBytes)], { type: "image/png" }),
          "vfx-mask.png",
        );
      }
      r = await fetch(OPENAI("/v1/images/edits"), {
        signal: espera("imagen"),
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      referenciaVfxUsada = r.ok;
      // Si edits falla por el modelo, no caemos en silencio a generations:
      // el cliente debe ver el error (la referencia importa).
    } else {
      r = await fetch(OPENAI("/v1/images/generations"), {
        signal: espera("imagen"),
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelo,
          prompt: promptSoloTexto(parsed.data.prompt, ref?.resumen),
          size,
          n: 1,
          // Este camino NO mandaba calidad: se quedaba con la de OpenAI, que es
          // más cara que la baja. Con el ajuste apagado no se notaba porque
          // casi todo iba por «edits»; al abaratar, esto era el agujero.
          quality: calidad,
        }),
      });
    }

    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}

    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      // Un parámetro que nosotros mandamos mal no implica que el modelo esté retirado.
      const delModelo = /deprecat|does not exist|no longer|not found|must be verified/i.test(crudo)
        && !/parameter|input_fidelity|unsupported.*param/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);

      // NO todo fallo de OpenAI es un 502.
      //
      // Antes todos salían así, y el editor no podía distinguir un corte
      // pasajero —que sí conviene reintentar— de un «no» de contenido, que
      // repetido da exactamente el mismo «no» y encima se paga dos veces.
      // Se conserva la familia del código que dio OpenAI: 4xx suyo es que algo
      // de LA PETICIÓN no le vale (moderación, prompt, parámetros), y eso no
      // se arregla insistiendo.
      const culpaNuestra = r.status >= 400 && r.status < 500;
      const contenido = r.status === 400
        && /safety|moderation|content policy|rejected as a result/i.test(crudo);

      return NextResponse.json({
        error: delModelo
          ? `El modelo «${modelo}» no sirve para imágenes: ${crudo}. Elige otro.`
          : crudo,
        modeloMal: delModelo, modelo,
        codigo: contenido ? "contenido" : culpaNuestra ? "peticion" : "openai",
        /** Para el lote: si insistir tiene sentido o solo cuesta dinero. */
        reintentable: !culpaNuestra,
      }, { status: culpaNuestra ? 400 : 502 });
    }

    const b64 = await leerImagen(j);
    if (!b64) {
      await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: `«${modelo}» contestó, pero sin imagen. Elige otro.`,
        modeloMal: true, modelo,
      }, { status: 502 });
    }
    committed = true;
    return NextResponse.json({
      ok: true, formato: "png", imagen: b64, size, referenciaVfxUsada,
      calidad,
      cupoImagenes: reserva.cupo.exento ? null : reserva.cupo,
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "imagen") }, { status: 502 });
  } finally {
    if (!committed) await liberarUsoIa(reserva.id);
  }
}
