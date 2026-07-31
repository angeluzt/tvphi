import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { descifrar, MODELOS_POR_DEFECTO } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";

// Narrar un texto con la voz de OpenAI.
//
// Hasta ahora la voz se generaba DENTRO del navegador con un modelo pequeño que
// suena robótico — lo puse yo y lo dejé marcado como temporal desde el principio.
// Esto la sustituye.
//
// Se usa Chat Completions con las dos modalidades, que es la forma que trae la
// documentación de OpenAI para pedir audio. El modelo lo elige el usuario: el
// barato de texto NO sirve aquí (no soporta audio), y por eso los modelos se
// guardan por tarea y no uno solo para todo.

const cuerpo = z.object({
  texto: z.string().min(1).max(4000),
  // Vacíos = los que el usuario tenga guardados.
  modelo: z.string().max(80).optional(),
  voz: z.string().max(40).optional(),
});

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
  const modelo = parsed.data.modelo || guardados.voz;
  const voz = parsed.data.voz || guardados.vozNombre || "alloy";
  if (!modelo) {
    return NextResponse.json(
      { error: "No has elegido modelo de voz. Cópialo de platform.openai.com." }, { status: 400 });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        modalities: ["text", "audio"],
        audio: { voice: voz, format: "wav" },
        messages: [
          // Se le pide LEER, no responder: si no, contesta al texto en vez de
          // narrarlo.
          { role: "system", content: "Lee en voz alta EXACTAMENTE el texto del usuario, con tono de narrador. No añadas nada, no comentes, no respondas: solo léelo." },
          { role: "user", content: parsed.data.texto },
        ],
      }),
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      // OpenAI retira modelos cada cierto tiempo, y entonces contesta con una
      // jerga que no le dice nada a nadie. Si el problema es el modelo, se dice
      // en claro y se marca, para que la interfaz pueda ofrecer cambiarlo en el
      // sitio en vez de dejar al usuario encerrado.
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported|model/i.test(crudo);
      // Se apunta para que la próxima vez salga avisado en la lista.
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: delModelo
          ? `El modelo «${modelo}» no sirve para narrar: ${crudo}. Elige otro aquí mismo.`
          : crudo,
        modeloMal: delModelo,
        modelo,
      }, { status: 502 });
    }
    const audio = j?.choices?.[0]?.message?.audio?.data;
    if (!audio) {
      await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: `«${modelo}» contestó, pero sin audio: no sirve para narrar. Elige otro aquí mismo.`,
        modeloMal: true, modelo,
      }, { status: 502 });
    }
    // El audio vuelve en base64; lo guarda el navegador, igual que las imágenes.
    return NextResponse.json({ ok: true, formato: "wav", audio });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
