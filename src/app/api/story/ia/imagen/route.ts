import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { descifrar, MODELOS_POR_DEFECTO } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";

// Generar la imagen de una escena.
//
// Es la pieza que faltaba: la IA ya escribía el montaje entero, pero las
// imágenes había que ponerlas a mano una por una. Con esto, de un prompt sale
// el capítulo y sus imágenes.
//
// La imagen NO se guarda en el servidor: vuelve en base64 y el navegador la
// mete donde van todas las demás (IndexedDB). Así no crece la factura de la
// base de datos por guardar archivos que ya viven en el navegador.

const cuerpo = z.object({
  prompt: z.string().min(4).max(4000),
  modelo: z.string().max(80).optional(),
  // El formato del video manda: una escena apaisada pedida cuadrada se ve mal.
  formato: z.enum(["16:9", "9:16", "1:1"]).optional(),
});

// Los tamaños que admite la API de imágenes. Se elige el que más se acerca al
// formato del video para no tener que recortar después.
const TAMANOS: Record<string, string> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const cred = await prisma.aiCredential.findUnique({ where: { userId: user.id } });
  if (!cred) return NextResponse.json({ error: "No has puesto tu clave de OpenAI" }, { status: 400 });
  const key = descifrar(cred.encrypted);
  if (!key) {
    return NextResponse.json({ error: "La clave guardada no se puede leer. Vuelve a ponerla." }, { status: 400 });
  }

  const guardados = { ...MODELOS_POR_DEFECTO, ...((cred.models as any) ?? {}) };
  const modelo = parsed.data.modelo || guardados.imagen;
  if (!modelo) {
    return NextResponse.json(
      { error: "No has elegido modelo de imagen. Elígelo en «Modelos, uno por tarea»." }, { status: 400 });
  }
  const size = TAMANOS[parsed.data.formato ?? "16:9"] ?? TAMANOS["16:9"];

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      // No se manda "response_format": los modelos nuevos de imagen no lo
      // admiten y ya devuelven base64. Para los viejos se recoge la URL más
      // abajo.
      body: JSON.stringify({ model: modelo, prompt: parsed.data.prompt, size, n: 1 }),
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}

    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported|must be verified|model/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: delModelo
          ? `El modelo «${modelo}» no sirve para imágenes: ${crudo}. Elige otro.`
          : crudo,
        modeloMal: delModelo, modelo,
      }, { status: 502 });
    }

    const dato = j?.data?.[0];
    let b64: string | null = dato?.b64_json ?? null;
    // Los modelos antiguos devuelven un enlace temporal en vez del dato. Se
    // recoge aquí y no en el navegador: el enlace lleva la firma de la cuenta.
    if (!b64 && dato?.url) {
      const img = await fetch(dato.url);
      if (img.ok) b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    }
    if (!b64) {
      await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: `«${modelo}» contestó, pero sin imagen. Elige otro.`,
        modeloMal: true, modelo,
      }, { status: 502 });
    }
    return NextResponse.json({ ok: true, formato: "png", imagen: b64, size });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
