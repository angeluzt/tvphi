import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { normalizarPlan, reglasDelPlan, MAX_PASOS_TANDA } from "@/lib/lab/tanda-sprites";

// De UNA frase a la lista de animaciones que hay que dibujar.
//
// POR QUÉ EXISTE. La tanda ya sabía encadenar varias animaciones del mismo
// personaje, pero te obligaba a escribir cada acción a mano, en su fila, con
// sus desplegables: el mismo trabajo manual que venía a quitar, solo que en
// vertical. Lo natural es decir «un pescador que pesca, se levanta, se da la
// vuelta y se va caminando» y que el reparto lo haga quien sabe hacerlo.
//
// ESTO NO DIBUJA NADA, y es la decisión importante. Devuelve un PLAN que se
// enseña y se corrige antes de generar. Planear es una llamada de texto
// —céntimos, un segundo—; generar son N imágenes que se pagan. Encadenarlo
// directo convertiría una frase mal escrita en ocho imágenes tiradas.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  /** La idea entera, en una frase. */
  idea: z.string().trim().min(6).max(600),
  /** Un tope propio, si se quiere una tanda corta. */
  maximo: z.number().int().min(2).max(MAX_PASOS_TANDA).optional(),
  modelo: z.string().max(80).optional(),
});

const INSTRUCCION = `Repartes una idea en las ANIMACIONES que hay que dibujar para un sprite 2D.

Devuelves SOLO un objeto JSON, sin explicaciones y sin markdown.

Cada animación es un ciclo corto de fotogramas de UN personaje haciendo UNA cosa. No son escenas: no hay fondo, ni suelo, ni sombra, ni otros personajes.

El campo "personaje" describe QUIÉN es, y se antepone automáticamente a cada paso, así que NO puede llevar la acción dentro. El campo "que" de cada paso describe solo lo que hace, y continúa la frase del personaje después de una coma.

CONTRATO Y REGLAS:
CONTRATO`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

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
  const modelo = parsed.data.modelo || guardados.texto;
  const tope = parsed.data.maximo ?? MAX_PASOS_TANDA;

  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
      signal: espera("texto"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: INSTRUCCION.replace("CONTRATO", JSON.stringify(reglasDelPlan())),
          },
          {
            role: "user",
            content: `Idea: ${parsed.data.idea}\n\nComo mucho ${tope} animaciones.`,
          },
        ],
      }),
    });
    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch { /* con un proxy por medio puede no ser JSON */ }
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported|model/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({ error: crudo, modeloMal: delModelo, modelo }, { status: 502 });
    }
    if (!j) {
      return NextResponse.json(
        { error: "OpenAI respondió algo que no es JSON. ¿Hay un proxy o cortafuegos por medio?" },
        { status: 502 });
    }
    const bruto = j?.choices?.[0]?.message?.content;
    if (!bruto) return NextResponse.json({ error: "El modelo no devolvió nada." }, { status: 502 });

    let data: unknown;
    try { data = JSON.parse(bruto); }
    catch { return NextResponse.json({ error: "El modelo no devolvió un JSON válido." }, { status: 502 }); }

    const plan = normalizarPlan(data, (i) => `ia${Date.now().toString(36)}${i}`);
    plan.pasos = plan.pasos.slice(0, tope);
    if (!plan.personaje || plan.pasos.length < 1) {
      return NextResponse.json(
        { error: "El plan que devolvió no tiene personaje o no tiene acciones.", bruto: data },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, plan });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }
}
