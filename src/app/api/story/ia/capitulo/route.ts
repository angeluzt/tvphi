import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { descifrar, OPENAI } from "@/lib/story/credenciales";
import { referenciaCompacta } from "@/lib/story/catalogo";
import { migrateProject } from "@/lib/story/model";
import { limpiarCapitulo } from "@/lib/story/guion";

// Escribir un capítulo con IA a partir de un texto del usuario.
//
// Lo que sale de aquí NO se guarda en ningún proyecto: se devuelve para que la
// interfaz lo enseñe y el usuario decida importarlo. Escribir directo encima de
// lo que estás editando sería la peor forma posible de estrenar esto.
//
// La referencia (catálogo de efectos y reglas del montaje) se le manda al modelo
// como contexto: sin ella inventa efectos que no existen y coloca los sitios en
// el espacio equivocado, que es exactamente donde fallé yo escribiéndolos a mano.

const cuerpo = z.object({
  prompt: z.string().min(4).max(4000),
  escenas: z.number().int().min(1).max(20).optional(),
  modelo: z.string().max(80).optional(),
});

const INSTRUCCIONES = `Escribes el montaje de un video narrado, en JSON, para la aplicación TVPHI.

Devuelve SOLO un objeto JSON con esta forma:
{"name": "título", "project": {"aspect":"16:9","narrationVolume":1,"audioLayers":[],"intro":null,"outro":null,"scenes":[...]}}

Cada escena es UNA imagen:
{"id":"s1","imageId":"img-1","imgW":1920,"imgH":1080,"prompt":"cómo es esta imagen",
 "vfx":[/* anclas de la FOTO: portal, fuego, humo… */],"shots":[...]}

Cada toma es un encuadre sobre esa imagen:
{"id":"s1a","autoDuration":true,"durationSec":6,"holdSec":0.4,"motionMode":"preset",
 "preset":{"kind":"in","cx":0.5,"cy":0.5,"w":1,"distance":0.25},
 "transition":"fade","transitionDur":1,"usarVfxEscena":true,"omitirVfxEscena":[],
 "dialogues":[{"id":"d1","text":"...","quien":"","dur":0,"gapSec":0.5,"effect":"none","speed":1,"pitch":1,"stale":false}],
 "sfx":[],"overlays":[],"audioOverrides":[],"vfx":[]}

Reglas que NO puedes saltarte:
- Los identificadores de imagen ("imageId") son inventados y descriptivos: uno distinto por escena.
- "prompt" describe la imagen de esa escena para poder dibujarla: qué se ve, encuadre, luz, ambiente y estilo. Concreto y visual, 1-3 frases, sin texto ni letras dentro de la imagen. Mantén los mismos personajes y el mismo estilo entre escenas describiéndolos igual cada vez: es lo único que las mantiene unidas.
- "kind" de preset: fixed, left, right, up, down, in, out. Para un primer plano baja "w" (1 = imagen entera, 0.35 = primer plano).
- Los efectos pegados a la foto (portal, fuego, humo, lámpara, aura…) van UNA SOLA VEZ en "scenes[].vfx", con "espacio":"imagen" y "follow":true. NO los copies en cada toma.
- En "shots[].vfx" solo lo de ESA toma: lluvia/nieve/niebla con forma "arriba", o un golpe puntual (explosión, destello) con timing "range".
- "usarVfxEscena":true (casi siempre) hace que la toma vea los efectos de la escena al hacer zoom. Pon false solo si esa toma debe verse sin NINGUNO de ellos.
- "omitirVfxEscena":[] lista ids concretos de scenes[].vfx que esa toma no pinta (el resto sí). Úsalo si un plano no debe mostrar, por ejemplo, un fuego concreto; deja [] si no omite nada.
- Los efectos SOLO pueden usar los "id" del catálogo. Respeta formas y rangos.
- Para los sitios usa SIEMPRE "espacio":"imagen" y coordenadas 0..1 sobre la foto (salvo forma "arriba").
- Escribe los diálogos en el idioma del encargo del usuario, con frases que se puedan narrar en voz alta.
- "quien" dice quién habla: cadena vacía para el narrador, y el nombre del personaje cuando habla él. Usa el mismo nombre siempre para el mismo personaje: es lo que permite darle su propia voz.
- Varias tomas por escena quedan mejor que una: un plano abierto y un primer plano sobre la misma imagen (mismos vfx de escena, distinto encuadre).

LO QUE SE NARRA (esto es lo que más se rompe, léelo dos veces):
- El campo "text" de cada diálogo es EXACTAMENTE lo que se va a oír en el video. Se lee tal cual, palabra por palabra.
- Escribe SOLO la historia. Nada de presentar, resumir, saludar, despedirse, preguntar ni comentar.
- PROHIBIDO, en cualquier idioma y en cualquier sitio: "en esta historia", "hoy te voy a contar", "bienvenidos", "espero que te haya gustado", "¿te gustó?", "no olvides suscribirte", "hasta la próxima", "fin", "y colorín colorado".
- Nada de acotaciones ni notas: ni "(susurrando)", ni "Narrador:", ni "Escena 1". Solo la frase que se dice.
- La primera frase del capítulo entra directamente en la historia, como si el video ya llevara un rato.
- La última frase cierra la historia por dentro. No se despide de nadie.

Devuelve el JSON y nada más: sin explicaciones ni vallas de código.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { prompt, escenas = 6, modelo = "gpt-4o-mini" } = parsed.data;

  const cred = await prisma.aiCredential.findUnique({ where: { userId: user.id } });
  if (!cred) {
    return NextResponse.json({ error: "No has puesto tu clave de OpenAI" }, { status: 400 });
  }
  const key = descifrar(cred.encrypted);
  if (!key) {
    return NextResponse.json(
      { error: "La clave guardada no se puede leer. Vuelve a ponerla." }, { status: 400 });
  }

  // La compacta: dice lo mismo con muchos menos tokens, y los paga el usuario
  // en cada generación.
  const ref = referenciaCompacta();
  let bruto: string;
  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCCIONES },
          { role: "system", content: `Catálogo de efectos y reglas del montaje:\n${JSON.stringify(ref)}` },
          { role: "user", content: `Haz un capítulo de ${escenas} escenas sobre esto:\n\n${prompt}` },
        ],
      }),
    });
    // Se lee como texto primero: si hay un proxy por medio o la red falla, la
    // respuesta no es JSON y reventaría aquí con un error ilegible.
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}
    if (!r.ok) {
      // El mensaje de OpenAI tal cual: "clave inválida", "sin saldo"… es lo que
      // el usuario necesita leer, no un "error 400" nuestro.
      return NextResponse.json(
        { error: j?.error?.message || `OpenAI respondió ${r.status}` }, { status: 502 });
    }
    if (!j) {
      return NextResponse.json(
        { error: "OpenAI respondió algo que no es JSON. ¿Hay un proxy o cortafuegos por medio?" },
        { status: 502 });
    }
    bruto = j?.choices?.[0]?.message?.content ?? "";
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }

  let crudo: any;
  try { crudo = JSON.parse(bruto); }
  catch { return NextResponse.json({ error: "La IA no devolvió un JSON válido" }, { status: 502 }); }

  // Se pasa por el mismo normalizador que la importación a mano: lo que venga
  // raro se endereza o se cae aquí, no dentro del proyecto del usuario.
  const project = migrateProject(crudo?.project ?? crudo);
  if (!project.scenes.length) {
    return NextResponse.json({ error: "La IA no devolvió ninguna escena" }, { status: 502 });
  }

  // Red de seguridad: el prompt PIDE que no meta frases de presentador, pero
  // pedir no es garantizar. Lo que se cuela aquí se acabaría oyendo en el vídeo
  // («¿te gustó cómo quedó?»), y para entonces ya está pagado.
  const { quitadas } = limpiarCapitulo(project);

  return NextResponse.json({
    ok: true,
    // Se dice lo que se ha quitado en vez de hacerlo a escondidas.
    quitadas,
    name: typeof crudo?.name === "string" ? crudo.name : "Capítulo generado",
    project,
    // Para que la interfaz pueda decir cuántas imágenes va a pedir.
    imagenes: project.scenes.length,
  });
}
