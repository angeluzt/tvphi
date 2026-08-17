import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { normalizarPlanAnimacion } from "@/lib/story/medio";

// La IA MIRA la foto y dice qué parte de ella se puede animar.
//
// POR QUÉ HACE FALTA. La que escribe el capítulo rellena `animacion` mirando su
// propio texto, y eso vale mientras la imagen se parezca a lo que escribió.
// Pero la foto se redibuja, se sube una propia o se retoca, y entonces el plan
// habla de un fuego que ya no está. Además, un capítulo escrito ANTES de que
// existiera este campo no lo trae, y sin él se vuelve al genérico que era el
// origen del problema. Aquí se pregunta mirando la imagen de verdad.
//
// ESTO NO DIBUJA NADA. Devuelve una frase y dos números que se enseñan y se
// pueden corregir ANTES de gastar. Preguntar es una llamada de texto —céntimos—;
// generar son N imágenes que se pagan una a una.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  /** La foto de la escena, base64 (con o sin cabecera data:). */
  imagen: z.string().min(100).max(8_000_000),
  /** Cómo es la escena, si se sabe. Ayuda, pero manda lo que se ve. */
  escena: z.string().trim().max(2000).optional(),
  /** Una pista de la persona: «anima el fuego, no el agua». */
  pista: z.string().trim().max(300).optional(),
  modelo: z.string().max(80).optional(),
});

const INSTRUCCION = `Miras UNA foto fija y dices qué parte de ella se puede animar en un bucle corto de pocos dibujos.

Devuelves SOLO un objeto JSON, sin explicaciones y sin markdown:
{"movimiento":"...","fotogramas":5,"fps":6,"motivo":"..."}

REGLAS:
- "movimiento" va EN INGLÉS, en UNA frase, y nombra la parte CONCRETA de esta imagen que se mueve y cómo. Bien: "the campfire flames flicker and the smoke drifts to the right", "the rain falls and the puddle ripples", "her hair and the scarf sway in the wind". Mal: "small motion", "the scene moves", "ambiance", "subtle animation".
- Elige SOLO cosas que cambian de forma por sí solas: fuego, humo, agua, vapor, tela, pelo, hojas, chispas, polvo, una luz que late. NUNCA propongas mover la cámara, desplazar objetos o personas por la escena, ni que entre o salga nadie: eso no es este efecto y sale mal.
- Nada de cambiar la composición, el encuadre, la ropa, la hora del día ni el estilo.
- Si en la foto no hay NADA que cambie de forma, elige lo más sutil que haya (una luz que respira, una sombra que tiembla) y dilo en "motivo".
- "fotogramas": 2 a 12, contando la foto que ya existe. Cada uno cuesta una imagen: 3-4 para algo lento (humo, nubes, tela), 6-8 para algo rápido que cambia mucho (fuego, agua agitada).
- "fps": 1 a 30. Fuego 8-12; agua o tela 5-7; humo o una luz que respira 2-4.
- "motivo": una frase corta EN ESPAÑOL diciéndole a la persona qué has elegido y por qué.`;

function comoDataUrl(v: string): string | null {
  const limpio = v.trim();
  if (/^data:image\/(png|jpeg|webp);base64,/.test(limpio)) return limpio;
  const b64 = limpio.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64.slice(0, 64))) return null;
  return `data:image/png;base64,${b64}`;
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

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const url = comoDataUrl(parsed.data.imagen);
  if (!url) return NextResponse.json({ error: "No pude leer esa imagen." }, { status: 400 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.texto;

  const encargo = [
    "Mira esta foto y di qué animar.",
    parsed.data.escena ? `Contexto de la escena: ${parsed.data.escena}` : "",
    parsed.data.pista ? `La persona apunta a: ${parsed.data.pista}` : "",
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
      signal: espera("texto"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCCION },
          {
            role: "user",
            content: [
              { type: "text", text: encargo },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });

    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch { /* con un proxy por medio puede no ser JSON */ }

    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      // Que el modelo de texto no sepa mirar imágenes NO es un callejón: la
      // frase se puede escribir a mano. Se marca para que el aviso lleve a eso
      // y no a reintentar lo mismo.
      const sinVision = /image|vision|multimodal|content type/i.test(crudo);
      return NextResponse.json(
        { error: crudo, modeloMal: delModelo, modelo, sinVision }, { status: 502 });
    }
    if (!j) {
      return NextResponse.json(
        { error: "OpenAI respondió algo que no es JSON. ¿Hay un proxy o cortafuegos por medio?" },
        { status: 502 });
    }

    const bruto = j?.choices?.[0]?.message?.content;
    if (!bruto) return NextResponse.json({ error: "El modelo no devolvió nada." }, { status: 502 });

    let data: any = null;
    try { data = JSON.parse(bruto); }
    catch { return NextResponse.json({ error: "El modelo no devolvió un JSON válido." }, { status: 502 }); }

    const plan = normalizarPlanAnimacion(data);
    if (!plan) {
      return NextResponse.json(
        { error: "No supo decir qué animar en esa foto. Escríbelo tú y sigue.", bruto: data },
        { status: 422 });
    }
    const motivo = String(data?.motivo ?? "").trim().slice(0, 300);
    return NextResponse.json({ ok: true, plan, motivo: motivo || null });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }
}
