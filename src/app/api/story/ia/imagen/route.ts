import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias } from "@/lib/story/cupo";

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

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const key = claveOpenAi();
  if (!key) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });
  }

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = esAdminHistorias(user.email) && parsed.data.modelo
    ? parsed.data.modelo
    : guardados.imagen;
  if (!modelo) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });
  }
  const size = TAMANOS[parsed.data.formato ?? "16:9"] ?? TAMANOS["16:9"];
  const ref = parsed.data.referenciaVfx;
  const imgBytes = ref ? pngBytes(ref.imagen) : null;
  const maskBytes = ref?.mascara ? pngBytes(ref.mascara) : null;

  try {
    let r: Response;
    let referenciaVfxUsada = false;

    if (imgBytes && editable(modelo)) {
      const form = new FormData();
      form.set("model", modelo);
      form.set("prompt", promptConVfx(parsed.data.prompt, ref?.resumen));
      form.set("size", size);
      form.set("n", "1");
      form.set("quality", "medium");
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
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      referenciaVfxUsada = r.ok;
      // Si edits falla por el modelo, no caemos en silencio a generations:
      // el cliente debe ver el error (la referencia importa).
    } else {
      r = await fetch(OPENAI("/v1/images/generations"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelo,
          prompt: promptSoloTexto(parsed.data.prompt, ref?.resumen),
          size,
          n: 1,
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
      return NextResponse.json({
        error: delModelo
          ? `El modelo «${modelo}» no sirve para imágenes: ${crudo}. Elige otro.`
          : crudo,
        modeloMal: delModelo, modelo,
      }, { status: 502 });
    }

    const b64 = await leerImagen(j);
    if (!b64) {
      await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: `«${modelo}» contestó, pero sin imagen. Elige otro.`,
        modeloMal: true, modelo,
      }, { status: 502 });
    }
    return NextResponse.json({
      ok: true, formato: "png", imagen: b64, size, referenciaVfxUsada,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
