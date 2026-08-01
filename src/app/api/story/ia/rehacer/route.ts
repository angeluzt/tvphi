import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { descifrar, MODELOS_POR_DEFECTO, OPENAI } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { limpiarNarracion } from "@/lib/story/guion";

// Rehacer un trozo suelto: esta frase, esta imagen.
//
// Regenerar el capítulo entero porque una frase no convence es tirar el resto
// del trabajo —y pagarlo otra vez—. Aquí se rehace SOLO la pieza, y se le manda
// el contexto de alrededor para que lo nuevo encaje: de qué va el capítulo, qué
// se dice justo antes y justo después, y quién habla.
//
// Lo que se pide es otra FORMA de decir lo mismo, no otra cosa. Si cambiara lo
// que pasa, habría que rehacer la escena entera y la historia dejaría de
// sostenerse.

const cuerpo = z.object({
  que: z.enum(["texto", "imagen"]),
  // Lo que hay ahora y no convence.
  actual: z.string().min(1).max(4000),
  // El capítulo alrededor, para que lo nuevo pegue.
  contexto: z.object({
    titulo: z.string().max(200).optional(),
    deQueVa: z.string().max(2000).optional(),
    antes: z.string().max(1000).optional(),
    despues: z.string().max(1000).optional(),
    quien: z.string().max(60).optional(),
    escena: z.string().max(2000).optional(),
  }).default({}),
  // Qué se quiere distinto, si el usuario lo sabe decir. Vacío = sorpréndeme.
  pista: z.string().max(500).optional(),
  modelo: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { que, actual, contexto, pista } = parsed.data;

  const cred = await prisma.aiCredential.findUnique({ where: { userId: user.id } });
  if (!cred) return NextResponse.json({ error: "No has puesto tu clave de OpenAI" }, { status: 400 });
  const key = descifrar(cred.encrypted);
  if (!key) return NextResponse.json({ error: "La clave guardada no se puede leer. Vuelve a ponerla." }, { status: 400 });

  const guardados = { ...MODELOS_POR_DEFECTO, ...((cred.models as any) ?? {}) };
  const modelo = parsed.data.modelo || guardados.texto || "gpt-4o-mini";

  const comun =
    "Trabajas sobre un capítulo YA ESCRITO. Te dan una pieza que al usuario no le convence y el contexto de alrededor.\n" +
    "Tu trabajo es dar OTRA VERSIÓN DE LA MISMA PIEZA: lo mismo, dicho de otra manera.\n" +
    "NO cambies lo que pasa en la historia. Lo que ocurría antes tiene que seguir ocurriendo, y lo de después tiene que seguir teniendo sentido.\n" +
    "No repitas la versión que te dan: si te sale igual, es que no has hecho nada.";

  const instruccion = que === "texto"
    ? comun + "\n\n" +
      "Devuelve SOLO la frase nueva, sin comillas, sin explicar nada y sin numerar.\n" +
      "Es texto que se va a LEER EN VOZ ALTA tal cual en el vídeo. Por eso:\n" +
      "PROHIBIDO presentar, resumir, saludar, despedirse, preguntar qué te ha parecido, comentar el propio vídeo o poner acotaciones tipo (susurrando) o «Narrador:».\n" +
      "Mantén más o menos el mismo largo: el vídeo está montado sobre esa duración."
    : comun + "\n\n" +
      "Devuelve SOLO la descripción nueva de la imagen, sin comillas ni explicaciones.\n" +
      "Es la descripción con la que se va a dibujar la escena: qué se ve, encuadre, luz, ambiente y estilo.\n" +
      "Tiene que seguir siendo LA MISMA ESCENA (mismo sitio, mismos personajes, misma hora del día): cambia el punto de vista, el encuadre o la luz, no lo que hay.\n" +
      "Describe a los personajes igual que estaban descritos: es lo único que hace que se parezcan de una escena a otra.\n" +
      "Nada de texto ni letras dentro de la imagen.";

  const ctx = [
    contexto.titulo && `Capítulo: ${contexto.titulo}`,
    contexto.deQueVa && `De qué va: ${contexto.deQueVa}`,
    contexto.escena && `Escena: ${contexto.escena}`,
    contexto.quien && `Quien habla: ${contexto.quien}`,
    contexto.antes && `Justo antes se dice: ${contexto.antes}`,
    contexto.despues && `Justo después se dice: ${contexto.despues}`,
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: instruccion },
          { role: "user", content:
            `${ctx ? ctx + "\n\n" : ""}Versión actual, que no convence:\n${actual}` +
            (pista ? `\n\nLo que se busca: ${pista}` : "\n\nNo se ha dicho qué falla: prueba otro enfoque.") },
        ],
      }),
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported|model/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({
        error: delModelo ? `El modelo «${modelo}» no sirve: ${crudo}. Elige otro.` : crudo,
        modeloMal: delModelo, modelo,
      }, { status: 502 });
    }
    let salida = String(j?.choices?.[0]?.message?.content ?? "").trim();
    // A veces devuelve la frase entrecomillada aunque se le pida que no.
    salida = salida.replace(/^["'«]+|["'»]+$/g, "").trim();
    if (!salida) return NextResponse.json({ error: "No devolvió nada." }, { status: 502 });

    // La misma red que en la generación: aquí también puede colarse un remate
    // de presentador, y aquí también se acabaría oyendo en el vídeo.
    let quitadas: string[] = [];
    if (que === "texto") {
      const limpio = limpiarNarracion(salida);
      quitadas = limpio.quitadas;
      if (limpio.texto) salida = limpio.texto;
    }
    // Si sale exactamente lo mismo, se dice: es una llamada pagada para nada.
    const igual = salida.trim().toLowerCase() === actual.trim().toLowerCase();
    return NextResponse.json({ ok: true, texto: salida, quitadas, igual });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
