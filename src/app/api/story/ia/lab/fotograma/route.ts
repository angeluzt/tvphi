import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import {
  esAdminHistorias, bloqueoDeGasto, respuestaBloqueo,
  reservarUsoIa, liberarUsoIa,
} from "@/lib/story/cupo";
import { leerAjustes, calidadEfectiva } from "@/lib/story/ajustes";
import { promptFotograma } from "@/lib/story/prompt-fotograma";

// Un fotograma más, a partir de una imagen que ya existe.
//
// ES EL LADRILLO DEL APNG. El cliente pide N veces, una por cuadro, y puede
// parar, reanudar o rehacer UNO sin tirar el resto. Pedir los N de golpe
// aquí sería un timeout y un gasto que no se puede recortar.
//
// Se usa /v1/images/edits con la foto de referencia: el modelo VE la escena
// y solo se le pide un cambio mínimo (agua, tela, respirar). Sin la foto,
// cada cuadro sería otra escena.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  prompt: z.string().min(4).max(4000),
  /** PNG de referencia, base64 (con o sin data:). */
  imagen: z.string().min(100).max(6_000_000),
  formato: z.enum(["16:9", "9:16", "1:1"]).optional(),
  calidad: z.enum(["low", "medium", "high"]).optional(),
  modelo: z.string().max(80).optional(),
  /**
   * Qué se mueve. Vacío = movimiento mínimo genérico. Concreto gana:
   * «el agua de la orilla», «el fuego de la hoguera».
   */
  movimiento: z.string().max(400).optional(),
});

const TAMANOS: Record<string, string> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
};

const editable = (m: string) =>
  /^(gpt-image-2|gpt-image-1\.5|gpt-image-1(?:$|-\d)|chatgpt-image-latest)/i.test(m);

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
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const bytes = pngBytes(parsed.data.imagen);
  if (!bytes) {
    return NextResponse.json({ error: "La imagen de referencia no es un PNG válido." }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const reserva = await reservarUsoIa(user.id, user.email, "imagen");
  if (!reserva.ok) {
    return NextResponse.json({
      error: reserva.mensaje, sinCupo: true, cupoImagenes: reserva.cupo,
    }, { status: 429 });
  }

  const ajustes = await leerAjustes();
  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.imagen;
  if (!modelo) {
    await liberarUsoIa(reserva.id);
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });
  }
  if (!editable(modelo)) {
    await liberarUsoIa(reserva.id);
    return NextResponse.json({
      error: `«${modelo}» no admite editar a partir de una foto. Elige un modelo de imagen que sí (gpt-image-…).`,
    }, { status: 400 });
  }

  const size = TAMANOS[parsed.data.formato ?? "16:9"] ?? TAMANOS["16:9"];
  const calidad = calidadEfectiva(ajustes, true, parsed.data.calidad);
  let committed = false;
  try {
    const form = new FormData();
    form.set("model", modelo);
    form.set("prompt", promptFotograma({
      escena: parsed.data.prompt,
      movimiento: parsed.data.movimiento,
    }));
    form.set("size", size);
    form.set("n", "1");
    form.set("quality", calidad);
    form.set("output_format", "png");
    form.set("background", "opaque");
    form.append(
      "image[]",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      "ref.png",
    );
    const r = await fetch(OPENAI("/v1/images/edits"), {
      signal: espera("imagen"),
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch { /* no JSON */ }
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|must be verified/i.test(crudo)
        && !/parameter|unsupported.*param/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      const culpaNuestra = r.status >= 400 && r.status < 500;
      return NextResponse.json({
        error: delModelo
          ? `El modelo «${modelo}» no sirve para imágenes: ${crudo}. Elige otro.`
          : crudo,
        modeloMal: delModelo, modelo,
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
      ok: true, formato: "png", imagen: b64, size, calidad,
      cupoImagenes: reserva.cupo.exento ? null : reserva.cupo,
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "imagen") }, { status: 502 });
  } finally {
    if (!committed) await liberarUsoIa(reserva.id);
  }
}
