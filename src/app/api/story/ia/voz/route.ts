import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, cupoAgotado } from "@/lib/story/cupo";

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

// Cómo debe sonar la narración. Por ahora fijo en español latino/neutro:
// sin acento de España y sin pausas entre palabras que no vengan en el texto.
// Solo aplica en gpt-4o-mini-tts (y variantes); tts-1 / tts-1-hd lo ignoran o fallan.
const INSTRUCCIONES_VOZ =
  "Habla en español latinoamericano neutro, fluido y natural, como un narrador de audiolibro. " +
  "No uses acento ni léxico de España (nada de ceceo, «vale», «tío», etc.). " +
  "Lee en frases continuas: no pauses entre palabras salvo comas, puntos u otra puntuación del texto. " +
  "Tono calmado de narración; no suenes robótico ni como si dictaras una lista.";

// tts-1 y tts-1-hd no aceptan `instructions`.
function aceptaInstrucciones(modelo: string) {
  return !/^tts-1(-hd)?$/i.test(modelo.trim());
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Sin cupo no se gasta ni un token del servidor. El editor sigue entero y la
  // voz del navegador, que es gratis, sigue funcionando.
  const sinCupo = await cupoAgotado(user.id, user.email);
  if (sinCupo) return NextResponse.json({ error: sinCupo, sinCupo: true }, { status: 429 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const key = claveOpenAi();
  if (!key) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });
  }

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = esAdminHistorias(user.email) && parsed.data.modelo
    ? parsed.data.modelo
    : guardados.voz;
  const voz = parsed.data.voz || guardados.vozNombre || "alloy";
  if (!modelo) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });
  }

  // Un modelo de CHAT no deja de ser un chat aunque le pidas que solo lea.
  //
  // Esto salió de un fallo real: las narraciones acababan con cosas como
  // «¿te gustó cómo quedó?». No es que el modelo desobedeciera un poco; es que
  // se le estaba pidiendo a un conversador que no conversara. Insistirle en el
  // prompt reduce la probabilidad, no la elimina.
  //
  // El endpoint de voz (/v1/audio/speech) no puede hacer eso: no responde, lee
  // lo que se le da. Es la diferencia entre pedirlo y que sea imposible.
  const deVoz = /tts/i.test(modelo);

  try {
    const r = deVoz
      ? await fetch(OPENAI("/v1/audio/speech"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: modelo,
            input: parsed.data.texto,
            voice: voz,
            response_format: "wav",
            ...(aceptaInstrucciones(modelo) ? { instructions: INSTRUCCIONES_VOZ } : {}),
          }),
        })
      : await fetch(OPENAI("/v1/chat/completions"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: modelo,
            modalities: ["text", "audio"],
            audio: { voice: voz, format: "wav" },
            messages: [
              // Camino de respaldo, para modelos de audio que no son de voz.
              // El aviso va en mayúsculas y repetido a propósito: aquí no hay
              // garantía, solo insistencia.
              { role: "system", content:
                "Eres un LECTOR, no un asistente. Tu única salida es la lectura en voz alta del texto del usuario, con tono de narrador.\n" +
                INSTRUCCIONES_VOZ + "\n" +
                "PROHIBIDO: saludar, despedirse, comentar el texto, preguntar nada, decir si te gusta, ofrecer ayuda, añadir introducción o cierre.\n" +
                "Si el texto es una sola palabra, lees esa palabra y callas. No existe ninguna razón para decir nada que no esté escrito." },
              { role: "user", content: parsed.data.texto },
            ],
          }),
        });

    // El endpoint de voz devuelve el audio en crudo, no un JSON.
    if (deVoz) {
      if (!r.ok) {
        const crudo = await r.text();
        let e: any = null;
        try { e = JSON.parse(crudo); } catch {}
        const msg = e?.error?.message || `OpenAI respondió ${r.status}`;
        const delModelo = /deprecat|does not exist|no longer|not found|unsupported|model/i.test(msg);
        if (delModelo) await anotarFallo(user.id, modelo);
        return NextResponse.json({
          error: delModelo ? `El modelo «${modelo}» no sirve para narrar: ${msg}. Elige otro aquí mismo.` : msg,
          modeloMal: delModelo, modelo,
        }, { status: 502 });
      }
      const wav = Buffer.from(await r.arrayBuffer()).toString("base64");
      return NextResponse.json({ ok: true, formato: "wav", audio: wav, via: "voz" });
    }

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
    // Se avisa de por dónde ha ido: por el camino de chat no hay garantía de que
    // no añada nada de su cosecha.
    return NextResponse.json({ ok: true, formato: "wav", audio, via: "chat" });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
