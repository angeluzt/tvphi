import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { revisar } from "@/lib/lab/escena";
import { leerAnimacion } from "@/lib/lab/animacion-ia";
import { referenciaAnimacion } from "@/lib/lab/referencia-camara";

// De una frase a un mapa de la escena por capas.
//
// El modelo de texto no dibuja: coloca. Se le pide el JSON con la geometría
// —qué hay, dónde, en qué capa y a qué profundidad— y luego cada capa se pinta
// aparte. Es lo que hace que la escena tenga sitios conocidos: se sabe dónde
// quedó el arco porque se decidió antes de dibujar nada.
//
// En pruebas y solo para admin, como el resto del laboratorio.

const cuerpo = z.object({
  // 4000, igual que el resto de rutas de IA que ya funcionaban. Con 1200 una
  // descripción normal de escena —fondo, plano medio, escenario, objetos— se
  // pasaba de largo y salía «Datos inválidos» sin decir por qué.
  idea: z.string().min(4).max(4000),
  formato: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  capas: z.number().int().min(3).max(6).default(4),
  modelo: z.string().max(80).optional(),
});

const TAM: Record<string, [number, number]> = {
  "16:9": [1536, 1024],
  "9:16": [1024, 1536],
  "1:1": [1024, 1024],
};

const INSTRUCCION = `Eres un director de arte que prepara escenas por capas para animarlas con paralaje.

Devuelves SOLO un objeto JSON, sin explicaciones y sin markdown.

Estructura:
{"scene":{"id":"kebab-case","title":"...","width":N,"height":N,"description":"qué se ve, en una frase","style":"estilo visual en inglés, sin texto ni letras"},
 "layers":[{"id":"kebab","name":"01 Nombre","depth":0.05,"blur":0.3,
   "ai":{"prompt":"lo que hay que DIBUJAR en esta capa, en inglés","exclude":"lo que NO, en inglés"},
   "objects":[{"id":"x","shape":"rect","semantic":"sky","x":0,"y":0,"w":1,"h":1,"label":"CIELO"}]}],
 "animacion":{"pasos":[{"mov":"acercar","segundos":3,"intensidad":45,"nota":"para qué es este tramo"}]},
 "efectos":[{"id":"humo","espacio":"imagen","x":0.5,"y":0.7,"escala":0.4}]}

LA ANIMACIÓN Y LOS EFECTOS
- Además del mapa, escribes la ANIMACIÓN de cámara en «animacion.pasos» y los EFECTOS del motor en «efectos».
- Los movimientos válidos, con qué hace cada uno y con cuáles se combinan, van en la referencia que se te pasa aparte. NO inventes ninguno.
- Tú dices QUÉ pasa —«acércate», «cruza el arco»—; los números de cámara los pone la aplicación. No escribas coordenadas de cámara.
- La animación tiene que aprovechar las capas que acabas de crear: si haces una puerta en primer plano, atraviésala.

REGLAS DE LAS CAPAS
- De atrás hacia delante. La PRIMERA es el fondo: cubre el cuadro entero y es opaca.
- Las demás llevan solo lo suyo y van sobre fondo transparente.
- "depth" reparte la profundidad: la del fondo cerca de 0.05, la de delante cerca de 0.95.
- Nunca pongas en una capa que no sea la primera una forma que cubra todo el cuadro:
  esa capa saldría sin transparencia y taparía las de atrás. Lo que ocupa todo se
  cuenta con palabras en "ai.prompt".
- Una capa aparte, casi al frente, para RESERVAS: dónde irá el personaje (semantic
  "subject") y dónde irán los efectos animados (semantic "vfx_zone"). Esa capa es una
  guía: lleva "guia": true, su "ai.prompt" dice que no se dibuja nada, NO se manda a
  dibujar y NO cuenta en el número de capas que se te pide. Es una sola, y solo si
  hace falta reservar sitio.
- Todas las DEMÁS capas se dibujan y cada una cuesta una imagen: no metas ninguna
  que vaya a salir vacía.

COORDENADAS de 0 a 1 sobre el ancho y el alto. Se puede salir un poco (-0.05, 1.05).

semantic: sky, terrain, wall, floor, door, window, column, arch, stairs, vegetation,
water, subject, prop, light_anchor, vfx_zone, negative_space.

shape y lo que lleva cada una:
- rect / roundedRect: x,y,w,h (+radius)
- circle: cx,cy,r · ellipse: cx,cy,rx,ry
- triangle / wedge: x,y,w,h   (wedge sube de izquierda a derecha)
- polygon: points [[x,y],...] · path: points + smooth 0..1 + closed
- line: x1,y1,x2,y2,width
- arch: x,y,w,h,thickness · stairs: x,y,w,h,steps
- door: x,y,w,h,arco · window: x,y,w,h,columnas,filas
- tree: x,y,w,h,tronco · cloud: x,y,w,h · star: cx,cy,r,puntas,hueco
- repeat: x1,y1,x2,y2,veces,item — reparte N copias de "item" por esa línea.
  El item lleva shape, semantic y su tamaño (w,h o r), NO su posición.

"label" en MAYÚSCULAS y corto: es lo que leerá el modelo de imagen.
Usa "repeat" cuando algo se repite (ventanas, columnas, farolas, árboles):
escribir doce objetos iguales ensucia el mapa.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // El laboratorio es solo para quien administra, igual que su página.
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // QUÉ está mal, no solo que algo lo está. «Datos inválidos» a secas obliga
    // a adivinar, y aquí lo que suele fallar es un texto demasiado largo.
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.texto;
  const [w, h] = TAM[parsed.data.formato];

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
          // La referencia se genera desde las mismas listas que usa el motor:
          // sin ella el modelo inventa movimientos y efectos que la aplicación
          // no sabe reproducir, y el fallo solo se ve al darle a reproducir.
          { role: "system", content:
            "REFERENCIA DE CÁMARA Y EFECTOS (no inventes nada fuera de esto):\n"
            + JSON.stringify(referenciaAnimacion()) },
          { role: "user", content:
            `Escena: ${parsed.data.idea}\n\n`
            + `Lienzo: ${w}x${h}. Haz exactamente ${parsed.data.capas} capas que se DIBUJEN. `
            + "La de reservas, si la pones, va aparte y no cuenta en ese número." },
        ],
      }),
    });
    // Se lee como texto primero: con un proxy por medio la respuesta puede no
    // ser JSON, y entonces reventaría aquí con un error ilegible.
    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch {}
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

    // El tamaño lo manda el servidor, no el modelo: si se inventa 1920x1080
    // cuando se pidió vertical, las capas no encajarían con lo que luego se
    // genera, y eso solo se descubre al apilarlas.
    const d = data as any;
    if (d?.scene) { d.scene.width = w; d.scene.height = h; }

    const revisado = revisar(d);
    if ("error" in revisado) {
      // Se devuelve TAMBIÉN lo que contestó: así se puede corregir a mano en el
      // editor en vez de perder la respuesta y volver a pagarla.
      return NextResponse.json(
        { error: `El mapa que devolvió no vale: ${revisado.error}`, bruto: d },
        { status: 422 },
      );
    }
    // La animación se traduce AQUÍ a la cola del motor: el modelo escribe
    // intenciones y los números de cámara los pone quien los sabe.
    const anim = leerAnimacion(d, revisado.escena);
    return NextResponse.json({
      ok: true,
      escena: revisado.escena,
      animacion: anim.pasos,
      notas: anim.notas,
      // Lo que se ha tenido que enderezar se dice, no se hace a escondidas.
      avisos: anim.avisos,
      efectos: Array.isArray(d?.efectos) ? d.efectos : [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }
}
