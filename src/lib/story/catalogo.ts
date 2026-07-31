import { VFX, SHAPE_LABEL, GROUP_LABEL, vfxDefaults } from "./vfx";

// El catálogo de efectos, en un sitio solo: lo sirve /api/story/efectos y viaja
// también dentro de los JSON que se exportan.
//
// Va con los proyectos a propósito. Un JSON de capítulo, por sí solo, no le dice
// a nadie qué efectos existen ni cómo se comportan; con el catálogo dentro, el
// archivo se explica solo y se le puede dar a una IA tal cual.
//
// Se genera desde el código, nunca a mano: si se escribiera aparte, en tres
// meses mentiría.

const COMPORTAMIENTO: Record<string, string> = {
  explosion: "Golpe único; con «every» > 0 se repite. Sale del sitio hacia fuera.",
  chispas: "Golpe de chispas con peso: caen tras salir despedidas.",
  destello: "Fogonazo corto en el sitio. No deja partículas.",
  shockwave: "Anillo que se abre desde el sitio. Golpe.",
  escarcha: "Golpe de cristales de hielo que se agarran alrededor del sitio.",
  speedlines: "Líneas que salen del sitio en todas direcciones. Dura dos décimas.",
  glitch: "Bandas digitales sobre un rectángulo centrado en el sitio.",
  magiccircle: "Círculo de runas que gira sobre el sitio y se apaga.",
  fuego: "Llama continua que sube desde el sitio. En línea, arde todo el trazo.",
  aura: "Bola de energía revuelta pegada al sitio. No se desplaza.",
  portal: "Remolino continuo en el sitio. Varios sitios juntos llenan un hueco.",
  luz: "Esfera de luz quieta. Pocas partículas.",
  baliza: "Destellos alternos de policía o ambulancia sobre el sitio.",
  neon: "Tubo de luz a lo largo del trazo. Estático salvo el parpadeo.",
  navidad: "Bombillas repartidas por el trazo.",
  rayo: "Relámpagos. Con forma «arriba» caen por cualquier parte del ancho.",
  lluvia: "Cae y cruza el cuadro entero. Pensada para la forma «arriba».",
  nieve: "Cae despacio y se balancea. Cruza el cuadro.",
  ceniza: "Cae lento. Tarda en llenar la escena; súbele la velocidad si la toma es corta.",
  hojas: "Caen girando, con viento.",
  polvo: "OJO: son luciérnagas. FLOTAN donde nacen, NO cruzan el cuadro. Con la forma «arriba» se reparten por el alto para que llenen la escena.",
  niebla: "Manchas de bruma repartidas por el trazo. Con «arriba» llena la escena entera.",
  humo: "Columna que sube y se abre. Sobre fondo casi negro se lee como una mancha clara: úsalo con poca intensidad.",
  burbujas: "Suben. Ponlas en una línea abajo para que suban desde el suelo.",
  confeti: "Papelitos de colores que caen girando.",
  estrellas: "Brillos que titilan y apenas se mueven. Con «arriba» se reparten por el alto.",
  lampara: "Solo resplandor: NO suelta partículas. Para una ventana, una vela o una farola.",
  haces: "Rayos rectos que salen del sitio como una estrella. Muy marcado: sobre una foto que ya tiene su luz, canta.",
  electricidad: "Chispazos cortos repartidos por el trazo. Cada uno dura poco.",
  fugaces: "Estrellas fugaces inclinadas.",
  corazones: "Suben o caen según «sentido».",
  salpicadura: "Golpe de gotas de agua; con «every» > 0 se repite.",
};

export function catalogoEfectos() {
  return VFX.map((v) => ({
    id: v.id,
    nombre: v.label,
    grupo: v.group,
    grupoNombre: GROUP_LABEL[v.group],
    // Si es continuo dura toda su ventana; si no, es un golpe que salta y se apaga.
    continuo: v.continuo,
    comportamiento: COMPORTAMIENTO[v.id] ?? "",
    formas: v.shapes.map((f) => ({ id: f, nombre: SHAPE_LABEL[f] })),
    colorPorDefecto: v.color,
    ajustes: v.params.map((p) => ({
      clave: p.key, nombre: p.label, min: p.min, max: p.max, paso: p.step,
    })),
    porDefecto: vfxDefaults(v.id),
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
    follow: "Si el efecto va pegado a algo de la foto, tiene que seguir a la cámara o se queda flotando al hacer zoom. Si no lo pones, se decide por el tipo de efecto.",
  };
}

// Lo que hay que saber para que el montaje cuadre, más allá de los efectos.
export function reglasMontaje() {
  return {
    duracion: "Con autoDuration la toma dura lo que dure su narración; hasta que no se genera la voz, dura el mínimo (2 s). Con autoDuration en falso manda durationSec.",
    pausa: "holdSec son segundos de imagen quieta DESPUÉS del movimiento; se suman a la toma.",
    tomas: "Una escena es una imagen; sus tomas son encuadres distintos sobre ella. Para un primer plano, baja preset.w (1 = imagen entera, 0.35 = primer plano).",
    tiempos: "startSec y endSec de un efecto son segundos absolutos dentro de la toma: si la toma cambia de duración al generar la voz, se descolocan. Úsalos cortos o deja timing en «all».",
    musica: "Un sonido de toma con loop sigue sonando en las tomas siguientes hasta que otra lo corte con audioOverrides: [{sfxId, stop: true, volume: null}]. Es la forma de poner música que aguanta cambios de duración.",
    archivos: "Las imágenes y los audios NO viajan en el JSON: solo sus identificadores y sus nombres. Al importar salen como faltantes y se reponen desde la propia pantalla.",
  };
}

// El bloque de referencia que se mete en los JSON exportados.
export function referenciaParaIA() {
  return {
    queEsEsto: "Referencia para escribir o modificar este proyecto sin la interfaz delante. NO forma parte del montaje: al importar se ignora entero.",
    montaje: reglasMontaje(),
    sitios: reglasSitios(),
    efectos: catalogoEfectos(),
  };
}
