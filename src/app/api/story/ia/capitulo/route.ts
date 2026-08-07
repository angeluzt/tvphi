import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, OPENAI, IA_NO_DISPONIBLE, preferenciasModelos, espera, motivoFallo } from "@/lib/story/credenciales";
import { referenciaCompacta } from "@/lib/story/catalogo";
import { migrateProject, quienesHablan } from "@/lib/story/model";
import { prepararCapituloGenerado, ajustarMusicaCapitulo } from "@/lib/story/guion";
import { VOCES } from "@/lib/story/modelos";
import { estadoCupoHistorias, mensajeCupoAgotado, registrarUsoIaCapitulo, esAdminHistorias } from "@/lib/story/cupo";
import { AVISO_SIN_VERIFICAR } from "@/lib/email-verify";

// Si la IA no rellenó project.voices, se asigna una voz distinta por hablante
// para que Nora y Tomás no suenen iguales al narrar.
function asegurarVocesCapitulo(project: ReturnType<typeof migrateProject>) {
  const voces = { ...(project.voices ?? {}) };
  const pool = VOCES.filter((v) => v !== "verse"); // verse a veces falla en TTS
  let i = 0;
  for (const quien of quienesHablan(project)) {
    const actual = (voces[quien] ?? "").trim();
    if (actual && pool.includes(actual)) continue;
    // Narrador → onyx de serie; el resto rotando el catálogo.
    if (quien === "" && !actual) {
      voces[""] = "onyx";
      continue;
    }
    while (pool[i % pool.length] === (voces[""] || "onyx") && pool.length > 1) i++;
    voces[quien] = pool[i % pool.length];
    i++;
  }
  project.voices = voces;
}

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
  /**
   * La forma del vídeo. Importa desde el principio y no después: los encuadres
   * se hacen para esta forma, y las imágenes se piden con este tamaño. Antes
   * salía siempre apaisado, así que para TikTok no había manera.
   */
  formato: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
});

/** El tamaño real con el que se van a generar las imágenes de cada escena. */
const MEDIDAS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1536, h: 1024 },
  "9:16": { w: 1024, h: 1536 },
  "1:1": { w: 1024, h: 1024 },
};

const INSTRUCCIONES = `Escribes el montaje de un video narrado, en JSON, para la aplicación TVPHI.

Devuelve SOLO un objeto JSON con esta forma:
{"name": "título", "project": {"aspect":"16:9","narrationVolume":1,"audioLayers":[],"intro":null,"outro":null,"voices":{"":"onyx"},"scenes":[...]}}

Cada escena es UNA imagen:
{"id":"s1","imageId":"img-1","imgW":1920,"imgH":1080,"prompt":"cómo es esta imagen",
 "vfx":[/* anclas de la FOTO: portal, fuego, humo… */],"shots":[...]}

Cada toma es un encuadre sobre esa imagen:
{"id":"s1a","autoDuration":true,"durationSec":6,"holdSec":0,"motionMode":"preset",
 "preset":{"kind":"in","cx":0.5,"cy":0.5,"w":1,"distance":0.25},
 "transition":"cut","transitionDur":0,"usarVfxEscena":true,"omitirVfxEscena":[],
 "dialogues":[{"id":"d1","text":"...","quien":"","dur":0,"gapSec":0,"effect":"none","speed":1,"pitch":1,"stale":false}],
 "sfx":[],"overlays":[],"audioOverrides":[],"vfx":[]}

Reglas que NO puedes saltarte:
- Los identificadores de imagen ("imageId") son inventados y descriptivos: uno distinto por escena.
- "prompt" describe la imagen de esa escena para poder dibujarla: qué se ve, encuadre, luz, ambiente y estilo. Concreto y visual, 1-3 frases, sin texto ni letras dentro de la imagen. Mantén los mismos personajes y el mismo estilo entre escenas describiéndolos igual cada vez: es lo único que las mantiene unidas.
- Si hay portal en scenes[].vfx, el prompt no debe meter caras dentro del vano. Fuego/antorcha/lámpara: la gente SÍ puede estar delante; lo incorrecto es el efecto tapando la cara como si la persona quedara detrás.
- "kind" de preset: fixed, left, right, up, down, in, out. Para un primer plano baja "w" (1 = imagen entera, 0.35 = primer plano).
- Los efectos pegados a la foto (portal, fuego, humo, lámpara, aura…) van UNA SOLA VEZ en "scenes[].vfx", con "espacio":"imagen" y "follow":true. NO los copies en cada toma.
- En "shots[].vfx" solo lo de ESA toma: lluvia/nieve/niebla con forma "arriba", o un golpe puntual (explosión, destello) con timing "range".
- "usarVfxEscena":true (casi siempre) hace que la toma vea los efectos de la escena al hacer zoom. Pon false solo si esa toma debe verse sin NINGUNO de ellos.
- "omitirVfxEscena":[] lista ids concretos de scenes[].vfx que esa toma no pinta (el resto sí). Úsalo si un plano no debe mostrar, por ejemplo, un fuego concreto; deja [] si no omite nada.
- Los efectos SOLO pueden usar los "id" del catálogo. Respeta formas y rangos.
- Para los sitios usa SIEMPRE "espacio":"imagen" y coordenadas 0..1 sobre la foto (salvo forma "arriba").
- Escribe los diálogos en el idioma del encargo del usuario, con frases que se puedan narrar en voz alta.
- "quien" dice quién habla: cadena vacía para el narrador, y el nombre del personaje cuando habla él. Usa el mismo nombre siempre para el mismo personaje.
- Varias tomas por escena quedan mejor que una: un plano abierto y un primer plano sobre la misma imagen (mismos vfx de escena, distinto encuadre).

VOCES (importante — no improvises con efectos de tono):
- En "project" incluye "voices": un mapa nombre→voz OpenAI. Voces válidas: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse, marin, cedar.
- Ejemplo: "voices":{"":"onyx","Nora":"nova","Tomás":"echo","Eco":"fable"} ("" = narrador).
- Cada personaje distinto DEBE tener una voz distinta. El narrador también.
- "effect" NO sirve para distinguir personajes. effect es un filtro de audio: none (casi siempre), robot (IA/máquina), cave/radio/whisper/deep/demon solo si la trama lo pide (eco, megáfono, susurro…). NUNCA uses effect "high" o "deep" para “hacer de mujer/hombre”: eso lo hace la voz OpenAI.
- Campo opcional "voz" en un diálogo: solo si ESA frase debe sonar distinta a la de su personaje.

RITMO (prioridad: diálogo fluido):
- gapSec por defecto 0. Primera frase de toma: 0. Entre frases: 0 salvo un respiro dramático puntual (máx ~0.25).
- holdSec: 0. Entre tomas de la misma escena: transition "cut". Fundido ≤0.35 solo al cambiar de escena.
- No alargues con silencios. Mejor frases encadenadas que pausas de relleno.

LO QUE SE NARRA (esto es lo que más se rompe, léelo dos veces):
- El campo "text" de cada diálogo es EXACTAMENTE lo que se va a oír en el video. Se lee tal cual, palabra por palabra.
- Escribe SOLO la historia. Nada de presentar, resumir, saludar, despedirse, preguntar ni comentar.
- PROHIBIDO, en cualquier idioma y en cualquier sitio: "en esta historia", "hoy te voy a contar", "bienvenidos", "espero que te haya gustado", "¿te gustó?", "no olvides suscribirte", "hasta la próxima", "fin", "y colorín colorado".
- Nada de acotaciones ni notas: ni "(susurrando)", ni "Narrador:", ni "Escena 1". Solo la frase que se dice.
- La primera frase del capítulo entra directamente en la historia, como si el video ya llevara un rato.
- La última frase cierra la historia por dentro. No se despide de nadie.

MÚSICA:
- La música baja SOLA mientras se narra (a un tercio), así que el volumen que pongas es el de los silencios entre frases, no el que compite con la voz.
- Elige UNA pista de la biblioteca y ponla en "audioLayers": {"id":"m1","kind":"music","audioId":"lib:<id>","name":"<título>","volume":0.12,"startSec":0,"loop":true}.
- volume entre 0.08 y 0.15. NUNCA 0.3 ni más: la biblioteca está masterizada alta y a 0.3 tapa la narración.
- UNA sola capa de música en todo el capítulo. Dos suenan sumadas (+3 dB) y se comen la voz: si la historia cambia de tono, cambia de pista por escena (abajo), no añadas otra global.
- Si una escena pide su propia música, va como sonido en bucle de su PRIMERA toma —{"audioId":"lib:<id>","loop":true,"volume":0.12}— y se corta al empezar la escena siguiente con audioOverrides:[{"sfxId":"<id>","stop":true,"volume":null}]. Eso es mejor que una cama global: cambia con la historia.

Devuelve el JSON y nada más: sin explicaciones ni vallas de código.`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { prompt, escenas = 6 } = parsed.data;

  const key = claveOpenAi();
  if (!key) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });
  }

  const prefs = await preferenciasModelos(user.id, user.email);
  const modelo = esAdminHistorias(user.email) && parsed.data.modelo
    ? parsed.data.modelo
    : prefs.texto;

  const formato = parsed.data.formato;
  const medida = MEDIDAS[formato];

  // Sin el correo confirmado no se escribe nada: es la puerta por la que
  // entraría quien se apunta con direcciones de usar y tirar a gastar la clave.
  if (!user.emailVerifiedAt && !esAdminHistorias(user.email)) {
    return NextResponse.json({
      error: AVISO_SIN_VERIFICAR, sinVerificar: true, codigo: "sin_verificar",
    }, { status: 403 });
  }

  const cupo = await estadoCupoHistorias(user.id, user.email);
  if (!cupo.exento && cupo.quedan <= 0) {
    return NextResponse.json({
      error: mensajeCupoAgotado(cupo),
      cupo,
      codigo: "cupo_ia",
    }, { status: 429 });
  }

  // La compacta: dice lo mismo con muchos menos tokens, y los paga el usuario
  // en cada generación.
  const ref = referenciaCompacta();
  let bruto: string;
  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
        signal: espera("texto"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCCIONES },
          // La forma va aparte y en su propio mensaje para que no se pierda
          // entre el resto: es lo que decide si el vídeo sirve para TikTok.
          { role: "system", content:
            `FORMATO DE ESTE VÍDEO: ${formato}. Usa "aspect":"${formato}" y, en cada escena, `
            + `"imgW":${medida.w} y "imgH":${medida.h}. `
            + (formato === "9:16"
              ? "Es VERTICAL, para móvil: encuadra en vertical, la acción en el centro y con aire arriba y abajo; nada importante en los bordes laterales."
              : formato === "1:1"
                ? "Es CUADRADO: encuadra centrado, sin depender de los lados."
                : "Es APAISADO, para pantalla ancha.") },
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
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }

  let crudo: any;
  try { crudo = JSON.parse(bruto); }
  catch { return NextResponse.json({ error: "La IA no devolvió un JSON válido" }, { status: 502 }); }

  // Se pasa por el mismo normalizador que la importación a mano: lo que venga
  // raro se endereza o se cae aquí, no dentro del proyecto del usuario.
  const project = migrateProject(crudo?.project ?? crudo);
  // El formato lo pone el servidor, no el modelo: se le pide, pero si contesta
  // otro el usuario acabaría con un vídeo de otra forma sin enterarse, y los
  // encuadres ya vendrían hechos para la equivocada.
  project.aspect = formato;
  for (const sc of project.scenes) {
    if (!(sc.imgW > 0) || !(sc.imgH > 0) || (sc.imgW > sc.imgH) !== (medida.w > medida.h)) {
      sc.imgW = medida.w;
      sc.imgH = medida.h;
    }
  }
  if (!project.scenes.length) {
    return NextResponse.json({ error: "La IA no devolvió ninguna escena" }, { status: 502 });
  }

  // Red de seguridad: el prompt PIDE que no meta frases de presentador, pero
  // pedir no es garantizar. Lo que se cuela aquí se acabaría oyendo en el vídeo
  // («¿te gustó cómo quedó?»), y para entonces ya está pagado.
  const { quitadas } = prepararCapituloGenerado(project);
  asegurarVocesCapitulo(project);
  const musica = ajustarMusicaCapitulo(project);

  await registrarUsoIaCapitulo(user.id);
  const cupoTras = await estadoCupoHistorias(user.id, user.email);

  return NextResponse.json({
    ok: true,
    // Se dice lo que se ha quitado en vez de hacerlo a escondidas.
    quitadas,
    // Lo mismo con la música que se ha enderezado.
    musica,
    name: typeof crudo?.name === "string" ? crudo.name : "Capítulo generado",
    project,
    // Para que la interfaz pueda decir cuántas imágenes va a pedir.
    imagenes: project.scenes.length,
    cupo: cupoTras,
  });
}
