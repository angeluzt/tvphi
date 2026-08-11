import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { revisar, SEMANTICO_LABEL, type Escena } from "@/lib/lab/escena";

// Cambiar UN DETALLE del mapa que ya existe, sin rehacerlo.
//
// POR QUÉ NO VALE LA RUTA DE GENERAR. Generar parte de una frase y devuelve una
// escena nueva: todo lo que se hubiera ajustado a mano —la posición del portal,
// las profundidades afinadas, los prompts reescritos capa por capa— se va con
// ella. Y lo que se pide de verdad casi nunca es «otra escena», es «esta misma,
// pero el árbol más a la izquierda» o «quítame la niebla del fondo». Pedir eso
// regenerando cuesta lo mismo que la primera vez y encima castiga: cuanto más
// trabajo llevas, más pierdes al pedir un retoque.
//
// Aquí entra el mapa completo y sale el mapa completo. La instrucción de
// sistema insiste en que se conserve todo lo que no se ha mencionado, porque
// ese es el fallo típico: el modelo «mejora» de paso el resto y devuelve una
// escena distinta que además parece correcta.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  /** Qué hay que cambiar, en las palabras del usuario. */
  instruccion: z.string().trim().min(2).max(400),
  /** El mapa actual, entero. */
  base: z.unknown(),
  modelo: z.string().max(80).optional(),
});

const INSTRUCCION = `Editas mapas semánticos de escena por capas. Recibes un mapa JSON completo y una instrucción de cambio.

Devuelves SOLO el mapa JSON completo y modificado. Sin explicaciones, sin markdown.

REGLA PRINCIPAL, por encima de cualquier otra: conserva TODO lo que la instrucción no menciona, byte a byte.
- No renombres capas ni objetos, no cambies sus id.
- No toques "depth", "blur", "ai.prompt" ni "ai.exclude" de capas que no se mencionan.
- No añadas objetos que no se hayan pedido, ni "mejores" nada por tu cuenta.
- No cambies "scene.width", "scene.height", "scene.id" ni "scene.mapBackground".
- Si la instrucción es ambigua, haz la interpretación MÍNIMA. Es preferible quedarse corto: el usuario puede volver a pedirlo, pero no puede recuperar lo que le borraste.

Cómo se escriben las cosas:
- Todas las coordenadas van de 0 a 1 sobre el ancho y el alto de la escena. x crece hacia la derecha, y crece hacia ABAJO.
- Cada objeto guarda su geometría según su "shape": rect/roundedRect/arch/stairs/door/window/tree/cloud/wedge usan x,y,w,h; circle usa cx,cy,r; ellipse usa cx,cy,rx,ry; star usa cx,cy,r; line usa x1,y1,x2,y2; polygon y path usan points (lista de pares).
- "semantic" solo puede ser uno de: SEMANTICOS.
- Para BORRAR algo, quítalo del array "objects" de su capa. No lo dejes con opacidad 0 ni lo muevas fuera del cuadro.
- Para DUPLICAR, copia el objeto con un id nuevo y distinto.
- Si mueves un objeto que se apoya en otro —una puerta en un muro, un árbol en el suelo—, muévelo sin despegarlo de su apoyo.`;

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

  // El mapa de partida se valida ANTES de gastar nada. Mandar a OpenAI una
  // escena que ya estaba rota es pagar por una respuesta que tampoco valdrá.
  const antes = revisar(parsed.data.base);
  if ("error" in antes) {
    return NextResponse.json(
      { error: `El mapa de partida no es válido: ${antes.error}` }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.texto;

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
            content: INSTRUCCION.replace("SEMANTICOS", Object.keys(SEMANTICO_LABEL).join(", ")),
          },
          { role: "user", content: `MAPA ACTUAL:\n${JSON.stringify(antes.escena)}` },
          { role: "user", content: `CAMBIO PEDIDO: ${parsed.data.instruccion}` },
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

    let data: any;
    try { data = JSON.parse(bruto); }
    catch { return NextResponse.json({ error: "El modelo no devolvió un JSON válido." }, { status: 502 }); }

    // El tamaño y el fondo del mapa los manda el servidor, igual que al generar:
    // un modelo que se invente 1920x1080 sobre una escena vertical descoloca
    // todas las capas, y el fallo solo se ve al apilarlas.
    if (data?.scene) {
      data.scene.width = antes.escena.scene.width;
      data.scene.height = antes.escena.scene.height;
      data.scene.id = antes.escena.scene.id;
      data.scene.mapBackground = "#101522";
    }

    const despues = revisar(data);
    if ("error" in despues) {
      return NextResponse.json(
        { error: `El retoque no vale: ${despues.error}`, bruto: data },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, escena: despues.escena, cambios: resumir(antes.escena, despues.escena) });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }
}

/**
 * Qué ha cambiado de verdad, contado en formas.
 *
 * Sirve para pillar al modelo cuando dice que sí y devuelve el mapa igual, o
 * cuando se le va la mano y rehace media escena con una instrucción de tres
 * palabras. Sin esto, las dos cosas se ven idénticas desde fuera: un aviso de
 * «listo» y una escena que hay que revisar a ojo.
 */
function resumir(antes: Escena, despues: Escena): {
  anadidas: number; quitadas: number; movidas: number;
} {
  const mapa = (e: Escena) => new Map(
    e.layers.flatMap((c) => c.objects.map((o) => [o.id, JSON.stringify(o)] as const)),
  );
  const a = mapa(antes);
  const d = mapa(despues);
  let quitadas = 0, movidas = 0;
  for (const [id, json] of a) {
    if (!d.has(id)) quitadas++;
    else if (d.get(id) !== json) movidas++;
  }
  let anadidas = 0;
  for (const id of d.keys()) if (!a.has(id)) anadidas++;
  return { anadidas, quitadas, movidas };
}
