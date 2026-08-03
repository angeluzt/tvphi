import { VFX, SHAPE_LABEL, GROUP_LABEL, vfxDefaults } from "./vfx";
import { catalogoMusicaIA } from "./musica";

// El catálogo de efectos, en un sitio solo: lo sirve /api/story/efectos y viaja
// también dentro de los JSON que se exportan.
//
// Va con los proyectos a propósito. Un JSON de capítulo, por sí solo, no le dice
// a nadie qué efectos existen ni cómo se comportan; con el catálogo dentro, el
// archivo se explica solo y se le puede dar a una IA tal cual.
//
// Se genera desde el código, nunca a mano: si se escribiera aparte, en tres
// meses mentiría.
//
// Sobre el tamaño: esto se le manda a un modelo en CADA capítulo, y el usuario
// lo paga. Por eso hay dos versiones —la larga, para leerla una persona, y la
// compacta, que es la que viaja— y por eso los ajustes van en una sola línea
// ("intensity 0.2..3 =1") en vez de en un objeto por ajuste. Dice lo mismo
// ocupando la cuarta parte.

const COMPORTAMIENTO: Record<string, string> = {
  explosion: "Golpe único; con «every» > 0 se repite. Núcleo blanco, bola de fuego, onda y humo que queda.",
  chispas: "Golpe de chispas con peso: caen tras salir despedidas.",
  destello: "Fogonazo corto en el sitio. No deja partículas.",
  shockwave: "Anillo que se abre desde el sitio. Golpe.",
  escarcha: "Golpe de cristales de hielo que se agarran alrededor del sitio.",
  speedlines: "Líneas que salen del sitio en todas direcciones. Dura dos décimas.",
  glitch: "Bandas digitales sobre un rectángulo centrado en el sitio.",
  magiccircle: "Círculo de runas que gira sobre el sitio y se apaga.",
  fuego: "Llama continua que sube desde el sitio. En línea, arde todo el trazo.",
  aura: "Bola de energía revuelta pegada al sitio. No se desplaza.",
  portal: "Agujero ajustable (óvalo o rectángulo): centro oscuro, borde encendido y remolino. Ancho/alto/giro para encajar el vano de la imagen.",
  luz: "Esfera de luz quieta. Pocas partículas.",
  baliza: "Destellos alternos de policía o ambulancia sobre el sitio.",
  neon: "Tubo de luz a lo largo del trazo: filamento blanco dentro de una nube de color.",
  navidad: "Bombillas de colores repartidas por el trazo.",
  rayo: "Relámpagos. INTERMITENTE: cae cada varios segundos, no sin parar. Con «arriba» cae por cualquier parte del ancho.",
  lluvia: "Cae y cruza el cuadro entero, con profundidad (las de delante más largas y claras). Pensada para «arriba».",
  nieve: "Copos pequeños que caen despacio y se balancean. Cruza el cuadro.",
  ceniza: "Cae lento. Tarda en llenar la escena; súbele la velocidad si la toma es corta.",
  hojas: "Caen girando, con viento.",
  polvo: "OJO: son luciérnagas. FLOTAN donde nacen, NO cruzan el cuadro. Con «arriba» se reparten por el alto.",
  niebla: "Bancos de bruma anchos y tumbados repartidos por el trazo. Con «arriba» llena la escena entera.",
  humo: "Penacho que sube y SE ABRE al subir. Sobre fondo casi negro se lee como una mancha clara: poca intensidad.",
  burbujas: "Suben. Ponlas en una línea abajo para que suban desde el suelo.",
  confeti: "Papelitos de colores que caen girando.",
  estrellas: "Brillos que titilan y apenas se mueven. Con «arriba» se reparten por el alto.",
  lampara: "Solo resplandor: NO suelta partículas. Para una ventana, una vela o una farola.",
  haces: "Rayos rectos que salen del sitio como una estrella. Muy marcado: sobre una foto que ya tiene su luz, canta.",
  electricidad: "Chispazos cortos con fogonazo, repartidos por el trazo. INTERMITENTE: cada uno dura un suspiro.",
  fugaces: "Estrellas fugaces con estela larga. INTERMITENTE: pasa una cada uno o dos segundos, no una lluvia.",
  corazones: "Flotan sueltos, subiendo o cayendo según «sentido».",
  salpicadura: "Golpe de gotas de agua; con «every» > 0 se repite.",
};

// PARA QUÉ sirve cada uno contando una historia. El comportamiento dice qué
// hace; esto dice cuándo echar mano de él, que es lo que de verdad hace falta
// para no poner lluvia en todas las escenas.
const CUANDO: Record<string, string> = {
  explosion: "El momento en que algo revienta. Uno por escena y basta: dos seguidas se anulan.",
  chispas: "Metal contra metal, un cable que salta, una espada al chocar.",
  destello: "Un hechizo que se lanza, una foto, algo que aparece de golpe.",
  shockwave: "Acompaña a un impacto para que se sienta la fuerza. Va bien pegado a «explosion».",
  escarcha: "Magia de hielo, un congelamiento, algo que se cristaliza.",
  speedlines: "Un golpe rapidísimo o un susto. Muy de cómic: úsalo poco.",
  glitch: "Una pantalla que falla, un recuerdo que se corrompe, algo digital roto.",
  magiccircle: "Un conjuro que se prepara. Debajo de quien lo lanza, no encima.",
  fuego: "Antorchas, hogueras, una casa ardiendo. En línea prende un muro entero.",
  aura: "Alguien cargando poder. Sobre el pecho o las manos, no sobre la cabeza.",
  portal: "Una puerta a otro sitio. En un vano o un arco, mejor que en el aire.",
  luz: "Una bola de energía flotando, un alma, un orbe mágico.",
  baliza: "Policía o ambulancia. Solo si la escena lo pide de verdad.",
  neon: "Un cartel, un rótulo, una calle de ciudad de noche.",
  navidad: "Una guirnalda por un alero, un árbol, una fiesta.",
  rayo: "Tormenta. El fogonazo cambia el ánimo de la escena entera de golpe.",
  lluvia: "Tristeza, huida, noche fría. Casi siempre con la forma «arriba».",
  nieve: "Frío, calma, paso del tiempo.",
  ceniza: "Después de un incendio, un mundo arrasado, un duelo.",
  hojas: "Otoño, un jardín, un salto de estación.",
  polvo: "Bosque encantado, hadas, magia tranquila. NO cruzan el cuadro: no valen como «cae algo».",
  niebla: "Misterio, un pantano, un recuerdo borroso. Baja, sobre el suelo.",
  humo: "Una chimenea, unas ruinas todavía calientes, una vela apagada.",
  burbujas: "Bajo el agua, una poción, un caldero.",
  confeti: "Una fiesta, una victoria, un final feliz.",
  estrellas: "Un cielo, un momento de asombro, magia de fondo.",
  lampara: "Una ventana encendida, una vela, una farola. Es lo que hace que una casa parezca habitada.",
  haces: "Luz entrando por un ventanal o entre los árboles. Muy fuerte: bájale la intensidad.",
  electricidad: "Un cable pelado, una máquina rota, magia eléctrica.",
  fugaces: "Un cielo nocturno con algo pasando. Un deseo, un presagio.",
  corazones: "Amor, ternura, un momento dulce. Con moderación.",
  salpicadura: "Algo que cae al agua, un charco al pisarlo.",
};

// Un ejemplo REAL de cada efecto, listo para copiar. Es lo que más ayuda: con
// un ejemplo delante no hay que adivinar la forma del objeto ni qué valores son
// razonables. Las coordenadas son sobre la imagen (espacio "imagen").
function ejemploDe(id: string, formaPorDefecto: string, color: string | null) {
  const nodos =
    formaPorDefecto === "arriba" ? [{ x: 0, y: 0, x2: 1, y2: 0 }]
    : formaPorDefecto === "linea" ? [{ x: 0.3, y: 0.62, x2: 0.7, y2: 0.6 }]
    : [{ x: 0.5, y: 0.55, x2: 0.5, y2: 0.55 }];
  return {
    id: `${id}1`, kind: id, shape: formaPorDefecto, espacio: "imagen",
    nodes: nodos, colorHex: color ?? "#ffffff",
    params: vfxDefaults(id as any), timing: "all", startSec: 0, endSec: 0,
  };
}

// Los ajustes en una línea: "clave min..max =pordefecto". Ocupa la cuarta parte
// que un objeto por ajuste y se entiende igual de bien.
function ajustesCompactos(id: string) {
  const spec = VFX.find((v) => v.id === id)!;
  const def = vfxDefaults(id as any);
  return spec.params.map((p) => `${p.key} ${p.min}..${p.max} =${def[p.key]}`).join(" | ");
}

export function catalogoEfectos() {
  return VFX.map((v) => ({
    id: v.id,
    nombre: v.label,
    grupo: v.group,
    grupoNombre: GROUP_LABEL[v.group],
    // Si es continuo dura toda su ventana; si no, es un golpe que salta y se apaga.
    continuo: v.continuo,
    comportamiento: COMPORTAMIENTO[v.id] ?? "",
    cuandoUsarlo: CUANDO[v.id] ?? "",
    formas: v.shapes.map((f) => ({ id: f, nombre: SHAPE_LABEL[f] })),
    colorPorDefecto: v.color,
    ajustes: v.params.map((p) => ({
      clave: p.key, nombre: p.label, min: p.min, max: p.max, paso: p.step,
    })),
    porDefecto: vfxDefaults(v.id),
  }));
}

// La misma información, en la cuarta parte de tokens. Es la que se le manda al
// modelo cuando escribe un capítulo.
export function catalogoCompacto() {
  return VFX.map((v) => ({
    id: v.id,
    que: v.label,
    tipo: v.continuo ? "continuo" : "golpe",
    formas: v.shapes.join("|"),
    color: v.color,
    hace: COMPORTAMIENTO[v.id] ?? "",
    cuando: CUANDO[v.id] ?? "",
    ajustes: ajustesCompactos(v.id),
  }));
}

// Las reglas que más se rompen al escribir un proyecto sin la interfaz delante.
export function reglasSitios() {
  return {
    espacio: {
      encuadre: "0..1 sobre el ENCUADRE INICIAL de la toma. Es lo que sale al colocarlos con el dedo. Por defecto.",
      imagen: "0..1 sobre la IMAGEN entera, sin importar el encuadre. Lo cómodo al escribir el proyecto a mano.",
    },
    forma: {
      arriba: "Franja a todo el ancho por encima del cuadro. Sus sitios los pone el motor: lo que escribas se ignora.",
      punto: "Un sitio suelto: {x, y, x2: x, y2: y}.",
      linea: "Un trazo de (x, y) a (x2, y2). El efecto se reparte por él.",
      libre: "Varios trazos seguidos, como dibujados a mano.",
    },
    varios: "Un mismo efecto admite VARIOS sitios a la vez: tres antorchas son un solo «fuego» con tres nodos, no tres efectos.",
    follow: "Si el efecto va pegado a algo de la foto, tiene que seguir a la cámara o se queda flotando al hacer zoom. Si no lo pones, se decide por el tipo de efecto.",
  };
}

// Lo que hay que saber para que el montaje cuadre, más allá de los efectos.
export function reglasMontaje() {
  return {
    duracion: "Con autoDuration la toma dura lo que dure su narración; hasta que no se genera la voz, dura el mínimo (2 s). Con autoDuration en falso manda durationSec.",
    pausa: "holdSec casi siempre 0. gapSec por defecto 0; solo un respiro corto si la trama lo pide. Prioridad: narración fluida.",
    ritmo: "No inventes silencios. Entre frases gapSec 0 salvo drama puntual (≤0.25). Entre tomas de la misma escena: cut. Voces distintas = voices{} con ids OpenAI, no effect high/deep.",
    tomas: "Una escena es una imagen; sus tomas son encuadres distintos sobre ella. Para un primer plano, baja preset.w (1 = imagen entera, 0.35 = primer plano).",
    vfxEscena: "Portal, fuego, humo, lámpara… van en scenes[].vfx UNA vez (espacio imagen). Las tomas los ven con usarVfxEscena:true y al hacer zoom siguen el sitio.",
    vfxToma: "En shots[].vfx solo atmósfera de cuadro (lluvia/nieve forma arriba) o golpes puntuales de ESA toma.",
    omitirVfx: "omitirVfxEscena:[\"id\"] oculta efectos concretos de la escena en esa toma. [] = no omite ninguno. usarVfxEscena:false oculta TODOS los de la escena.",
    tiempos: "startSec y endSec de un efecto son segundos absolutos dentro de la toma: si la toma cambia de duración al generar la voz, se descolocan. Úsalos cortos o deja timing en «all».",
    musica: "Un sonido de toma con loop sigue sonando en las tomas siguientes hasta que otra lo corte con audioOverrides: [{sfxId, stop: true, volume: null}]. Es la forma de poner música que aguanta cambios de duración.",
    archivos: "Las imágenes y los audios NO viajan en el JSON: solo sus identificadores y sus nombres. Al importar salen como faltantes y se reponen desde la propia pantalla.",
    voces: "project.voices mapea quien→voz OpenAI (alloy, nova, onyx…). effect es filtro (robot, cave…), no sustituto de voz. Cada personaje una voz distinta. «quien» vacío = narrador; mismo nombre siempre para el mismo personaje.",
  };
}

// Cómo se arma una toma que se vea bien. Sin esto hay que adivinar qué valores
// son razonables, y lo que sale son tomas de tres segundos con la imagen entera
// quieta.
export function recetasDeTomas() {
  return [
    {
      nombre: "Plano de situación",
      cuando: "Primera toma de una escena: dónde estamos.",
      como: "Imagen casi entera, acercándose despacio.",
      toma: { preset: { kind: "in", cx: 0.5, cy: 0.5, w: 1, distance: 0.15 }, holdSec: 0, transition: "fade", transitionDur: 0.35 },
    },
    {
      nombre: "Primer plano de un personaje",
      cuando: "Cuando habla, o para que se le vea la cara.",
      como: "Baja «w» a 0.3–0.4 y centra en la cara. El centro es DONDE ESTÁ LA CARA en la imagen, no el medio.",
      toma: { preset: { kind: "in", cx: 0.42, cy: 0.35, w: 0.35, distance: 0.08 }, holdSec: 0, transition: "cut" },
    },
    {
      nombre: "Golpe de tensión",
      cuando: "Un susto, un impacto, una revelación.",
      como: "Toma corta, acercamiento rápido y corte seco al entrar.",
      toma: { autoDuration: false, durationSec: 1.2, preset: { kind: "in", cx: 0.5, cy: 0.45, w: 0.6, distance: 0.35 }, transition: "cut" },
    },
    {
      nombre: "Recorrido por la imagen",
      cuando: "Una imagen ancha con varias cosas que enseñar.",
      como: "Un paneo lateral manteniendo el tamaño.",
      toma: { preset: { kind: "left", cx: 0.5, cy: 0.5, w: 0.7, distance: 0.4 }, holdSec: 0, transition: "fade", transitionDur: 0.35 },
    },
    {
      nombre: "Encadenar sobre la misma imagen",
      cuando: "Dos tomas seguidas de la misma foto, sin salto.",
      como: "La segunda arranca donde acabó la primera: motionMode «continue».",
      toma: { motionMode: "continue", transition: "cut" },
    },
  ];
}

// Un trozo de capítulo entero, de verdad, con todo puesto en su sitio. Es el
// ejemplo que más rinde: enseña la forma exacta del objeto, cómo se reparten
// los diálogos y cómo se cuelgan los efectos.
export function ejemploDeEscena() {
  return {
    id: "e1",
    imageId: "img-torre",
    imgW: 1920, imgH: 1080,
    prompt: "Una torre de piedra en un acantilado, de noche, con una ventana encendida. Tormenta al fondo, mar picado. Estilo cinematográfico oscuro.",
    vfx: [
      { id: "v1", kind: "lampara", shape: "punto", espacio: "imagen", follow: true,
        nodes: [{ x: 0.53, y: 0.38, x2: 0.53, y2: 0.38 }],
        colorHex: "#ffd9a0", params: { size: 0.8, alcance: 1, intensity: 0.7, blink: 0.3, nervio: 0 },
        timing: "all", startSec: 0, endSec: 0 },
    ],
    shots: [
      {
        id: "e1a", autoDuration: true, durationSec: 6, holdSec: 0, usarVfxEscena: true,
        motionMode: "preset", preset: { kind: "in", cx: 0.5, cy: 0.45, w: 1, distance: 0.18 },
        from: { cx: 0.5, cy: 0.45, w: 1 }, to: { cx: 0.5, cy: 0.45, w: 0.82 },
        transition: "fade", transitionDur: 0.35,
        dialogues: [
          { id: "d1", text: "Nadie subía a la torre desde el invierno del setenta.", quien: "", dur: 0, gapSec: 0, effect: "none", speed: 1, pitch: 1, stale: false },
        ],
        sfx: [], audioOverrides: [], overlays: [],
        vfx: [
          { id: "v2", kind: "lluvia", shape: "arriba", espacio: "encuadre",
            nodes: [{ x: 0, y: 0, x2: 1, y2: 0 }],
            colorHex: "#8fc4ff", params: { intensity: 1.4, size: 1, speed: 1.2, wind: -0.6, limit: 0 },
            timing: "all", startSec: 0, endSec: 0 },
        ],
      },
      {
        id: "e1b", autoDuration: true, durationSec: 4, holdSec: 0, usarVfxEscena: true,
        motionMode: "preset", preset: { kind: "fixed", cx: 0.53, cy: 0.38, w: 0.34, distance: 0 },
        from: { cx: 0.53, cy: 0.38, w: 0.34 }, to: { cx: 0.53, cy: 0.38, w: 0.34 },
        transition: "cut", transitionDur: 0,
        dialogues: [
          { id: "d2", text: "Y sin embargo, aquella noche había luz.", quien: "", dur: 0, gapSec: 0, effect: "none", speed: 1, pitch: 1, stale: false },
          { id: "d3", text: "Te dije que no miraras.", quien: "Marta", dur: 0, gapSec: 0, effect: "none", speed: 1, pitch: 1, stale: false },
        ],
        sfx: [], audioOverrides: [], overlays: [],
        vfx: [
          { id: "v3", kind: "rayo", shape: "arriba", espacio: "encuadre",
            nodes: [{ x: 0, y: 0, x2: 1, y2: 0 }], colorHex: "#ffffff",
            params: { thickness: 1, branch: 1, flicker: 1, stormrate: 1.2, flash: 1 },
            timing: "all", startSec: 0, endSec: 0 },
        ],
      },
    ],
  };
}

// Errores que se cometen una y otra vez al escribir esto sin la pantalla
// delante. Van explícitos porque avisar sale más barato que corregir.
export function fallosTipicos() {
  return [
    "Copiar portal/fuego en cada toma: van en scenes[].vfx una sola vez.",
    "Poner un efecto por cada antorcha en vez de UN efecto con tres nodos.",
    "Usar «polvo» esperando que caiga: no cae, flota donde nace.",
    "Colocar un aura o una lámpara sin «follow»: al acercarse la cámara se despega de la foto.",
    "Poner startSec/endSec largos en una toma con autoDuration: al generar la voz cambia la duración y el efecto se descoloca.",
    "Centrar un primer plano en el medio de la imagen en vez de donde está la cara.",
    "Meter cinco efectos en una toma. Con dos bien puestos se ve mejor que con cinco peleándose.",
    "Cambiar el nombre del personaje entre escenas: cada nombre distinto es una voz distinta.",
    "Poner gapSec de 0.5 o holdSec/fundidos de 1 s: el video se oye a tirones. Ritmo natural: gaps ~0 salvo drama, holdSec 0.",
    "Usar effect «high»/«deep» para distinguir personajes: eso es un filtro. Usa project.voices con voces OpenAI distintas.",
  ];
}

// El bloque de referencia que se mete en los JSON exportados (versión larga:
// esta la lee una persona, o una IA a la que se le pasa el archivo entero).
export function referenciaParaIA() {
  return {
    queEsEsto: "Referencia para escribir o modificar este proyecto sin la interfaz delante. NO forma parte del montaje: al importar se ignora entero.",
    montaje: reglasMontaje(),
    sitios: reglasSitios(),
    recetasDeTomas: recetasDeTomas(),
    ejemploDeEscena: ejemploDeEscena(),
    fallosTipicos: fallosTipicos(),
    efectos: catalogoEfectos(),
    musica: {
      comoSeUsa: "Pon la pista en audioLayers con audioId igual al identificador (empieza por «lib:»), kind:\"music\", loop:true, volume 0.25-0.4, startSec 0.",
      pistas: catalogoMusicaIA(),
    },
  };
}

// La versión que se le manda al modelo al escribir un capítulo. Dice lo mismo
// con muchos menos tokens, que los paga el usuario en cada generación.
export function referenciaCompacta() {
  return {
    montaje: reglasMontaje(),
    sitios: reglasSitios(),
    recetasDeTomas: recetasDeTomas(),
    ejemploDeEscena: ejemploDeEscena(),
    fallosTipicos: fallosTipicos(),
    efectos: catalogoCompacto(),
    musica: {
      comoSeUsa: "Pon la pista en audioLayers con audioId igual al identificador de abajo (empieza por «lib:»), kind:\"music\", loop:true, volume 0.25-0.4 para que no tape la narración, startSec 0. Los archivos ya están en la app: no hacen falta subirlos.",
      pistas: catalogoMusicaIA(),
    },
    ejemploDeEfecto: ejemploDe("fuego", "punto", "#ff8a3d"),
  };
}
