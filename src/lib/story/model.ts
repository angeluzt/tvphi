// Modelo de "Historias narradas".
//
// Estructura: un proyecto tiene ESCENAS (una imagen cada una) y cada escena tiene
// una o varias SUB-ESCENAS o "tomas" (Shot). Cada toma recorre la imagen desde un
// encuadre inicial hasta uno final — así una sola imagen da varias tomas sin
// volver a importarla.
//
// El movimiento se define de UNA de estas dos formas (excluyentes):
//   · "preset": se elige una dirección (izquierda, abajo, acercar…) y se controla
//     con barras la posición (X, Y), el tamaño y la SEPARACIÓN entre el punto 1 y
//     el 2. Ambos puntos se mueven y se redimensionan juntos.
//   · "free": se coloca el punto 1 y el punto 2 por separado, cada uno con su
//     posición y su tamaño, para ir de cualquier sitio a cualquier otro.

import { nanoid } from "nanoid";
import { type VfxKind, type VfxShape, vfxSpec, vfxDefaults } from "./vfx";

export type TransitionKind = "cut" | "fade" | "slide";
// Los stickers pueden seguir la transición de entrada de la toma o llevar la suya.
export type OverlayTransition = "inherit" | TransitionKind;

// Encuadre: ventana recortada sobre la imagen, por centro (cx, cy) y ancho (w),
// todo normalizado 0..1 respecto a la imagen. El alto se deduce para mantener
// siempre 16:9 y no deformar.
export interface Frame {
  cx: number;
  cy: number;
  w: number;
}

export type MotionKind = "fixed" | "left" | "right" | "up" | "down" | "in" | "out";
// "continue": la toma arranca justo donde acabó la anterior y va hasta su punto
// 2. Sirve para encadenar A→B→C→D sin saltos entre tomas.
export type MotionMode = "preset" | "free" | "continue";

// Movimiento predefinido: un centro, un tamaño y cuánto recorre entre el punto 1
// y el 2. El sentido lo marca el tipo (izquierda, abajo, acercar…), así que el
// recorrido nunca es negativo.
export interface PresetMotion {
  kind: MotionKind;
  cx: number;
  cy: number;
  w: number;
  distance: number;
}

// Efectos para la voz narrada. "none" la deja tal cual.
export type VoiceEffect = "none" | "deep" | "demon" | "whisper" | "robot" | "cave" | "radio" | "high";

// Los que cambian el tono lo hacen cambiando la velocidad, así que también
// cambian lo que dura el audio: hay que tenerlo en cuenta en los tiempos.
export const VOICE_RATE: Record<VoiceEffect, number> = {
  none: 1, deep: 0.86, demon: 0.72, whisper: 1, robot: 1, cave: 1, radio: 1, high: 1.28,
};

export const VOICE_EFFECTS: { id: VoiceEffect; label: string }[] = [
  { id: "none", label: "Normal" },
  { id: "deep", label: "Grave" },
  { id: "demon", label: "Demonio" },
  { id: "whisper", label: "Susurro" },
  { id: "robot", label: "Robot" },
  { id: "cave", label: "Cueva (eco)" },
  { id: "radio", label: "Radio / megáfono" },
  { id: "high", label: "Agudo" },
];

export interface Dialogue {
  id: string;
  text: string; // texto oculto que narra la voz IA
  audioId?: string; // audio generado (IndexedDB)
  dur: number; // duración del audio (s), 0 si aún no se generó
  effect: VoiceEffect;
  // Velocidad de lectura (1 = tal cual). Cambia lo que dura SIN tocar el tono:
  // el modelo de voz no deja pedirle otra velocidad, así que se estira el audio
  // ya generado.
  speed: number;
  // Tono (1 = tal cual). Cambia lo grave/agudo SIN tocar la duración. Es lo que
  // permite tener voces distintas con el mismo modelo, que solo trae una.
  pitch: number;
  // true cuando el texto cambió después de generar la voz: el audio sigue ahí
  // (para poder seguir viendo el video) pero ya no corresponde a lo escrito.
  stale: boolean;
  // Pausa antes de este diálogo, contada desde que acaba el anterior. Se usa una
  // pausa en vez de un instante absoluto para que el orden siga teniendo sentido
  // aunque la voz todavía no se haya generado (y por tanto no se sepa cuánto dura).
  gapSec: number;
  // Quién habla. El narrador y cada personaje pueden sonar distinto: con una
  // sola voz para todo, un diálogo entre dos personas no se distingue de la
  // narración. Vacío = narrador, que es el caso normal.
  //
  // "quien" es el nombre del personaje; la voz sale de project.voices, así que
  // cambiarla una vez cambia todas las frases de ese personaje.
  quien?: string;
  // Voz solo para esta frase, por encima de la de su personaje. Para el caso
  // suelto en el que una frase concreta tiene que sonar de otra manera.
  voz?: string;
}

export interface ShotSfx {
  id: string;
  audioId: string;
  name: string;
  volume: number; // 0..1
  dur: number; // duración del archivo (s)
  gapSec: number; // pausa antes: tras el sonido anterior, o desde el inicio si va en bucle
  // En bucle el sonido no forma parte de la secuencia: arranca y sigue sonando en
  // las tomas siguientes hasta que alguna lo corte.
  loop: boolean;
}

// Excepción de una toma sobre un sonido en bucle que le llega de más arriba.
export interface AudioOverride {
  sfxId: string;
  stop: boolean; // corta el sonido desde esta toma en adelante
  volume: number | null; // otro volumen desde esta toma en adelante
}

// Movimiento propio de un sticker PNG:
//   · "follow": queda pegado a la imagen y se mueve/escala con la cámara.
//   · "fixed": se queda quieto en el lienzo.
//   · "free": va de una posición/tamaño inicial a otra final.
export type OverlayMotion = "fixed" | "follow" | "free";

export interface PngOverlay {
  id: string;
  imageId: string;
  x: number; y: number; w: number; h: number; // posición inicial en el lienzo, 0..1
  motion: OverlayMotion;
  toX: number; toY: number; toW: number; toH: number; // posición final si motion = "free"
  transition: OverlayTransition; // cómo aparece
  // Cuándo se ve, dentro de la toma:
  //   · "all"   → toda la toma
  //   · "range" → entre startSec y endSec
  //   · "after" → arranca cuando acaba el sticker anterior (más startSec de
  //     pausa) y dura durSec. Así se encadenan explosiones sin recalcular los
  //     tiempos a mano cada vez que se mueve una.
  timing: "all" | "range" | "after";
  startSec: number;
  endSec: number;
  durSec: number; // solo para "after"
  // Sonido propio del sticker (la explosión que va con la explosión). Suena
  // cuando el sticker aparece, no cuando empieza la toma.
  soundId?: string;
  soundName?: string;
  soundVolume: number; // 0..1
  soundDelay: number; // segundos de retraso desde que aparece el sticker
  // En bucle se repite mientras el sticker se ve y se corta al irse; si no,
  // suena una sola vez y se le deja acabar aunque el sticker ya se haya ido.
  soundLoop: boolean;
}

// Cuándo suena el sonido de un sticker, dentro de la toma. Se retrasa respecto
// a cuando aparece, sin poder salirse de su rato.
export function overlaySoundStart(o: PngOverlay, ventana: { start: number; end: number }) {
  const margen = Math.max(0, ventana.end - ventana.start - 0.05);
  return ventana.start + Math.min(Math.max(0, o.soundDelay || 0), margen);
}

// Un efecto de partículas colocado sobre una toma (lluvia, fuego, una explosión
// a los 2 s…). Se dibuja sobre el mismo lienzo que graba el exportador, así que
// sale en el video con la calidad del códec, no de un GIF.
// Un sitio donde actúa un efecto: un punto (inicio = fin) o una línea.
export interface VfxNode { x: number; y: number; x2: number; y2: number } // 0..1

// En qué se miden los sitios de un efecto:
//   "encuadre" (de siempre): 0..1 sobre el ENCUADRE INICIAL de la toma. Es lo
//       que sale al colocarlos con el dedo sobre la previsualización.
//   "imagen": 0..1 sobre la IMAGEN entera, sin importar cómo esté encuadrada.
//       Es lo cómodo cuando el proyecto se escribe a mano o lo genera una IA:
//       "la ventana está al 72% de ancho de la foto" y se acabó.
export type VfxEspacio = "encuadre" | "imagen";

export interface VfxLayer {
  id: string;
  kind: VfxKind;
  // Cómo se coloca (puntos sueltos, líneas, a mano alzada, desde arriba) y
  // TODOS los sitios donde actúa: tres ramas ardiendo son tres nodos de la
  // misma capa, con los mismos ajustes y el mismo color.
  shape: VfxShape;
  // Dónde se miden los sitios. Si falta, "encuadre" (como siempre).
  espacio?: VfxEspacio;
  nodes: VfxNode[];
  // Si va pegado a la imagen: al moverse o acercarse la toma, el efecto se
  // mueve con ella. Es lo que hace que una hoguera no se quede flotando en el
  // aire cuando la cámara se desplaza. No tiene sentido en lo que cae sobre
  // todo el cuadro (lluvia desde arriba), y ahí se deja apagado.
  follow: boolean;
  // true mientras los sitios sean los de serie (los que se ponen solos al
  // añadir el efecto, para que se vea algo al momento). En cuanto se coloca
  // uno a mano, los de serie se van: si tocas tres sitios quieres tres, no
  // cuatro.
  auto: boolean;
  colorHex: string;
  params: Record<string, number>;
  // Cuándo, dentro de la toma. "all" = mientras dure.
  timing: "all" | "range";
  startSec: number;
  endSec: number;
}

// Sitio de partida para una forma, para que un efecto recién añadido ya se vea
// sin tener que dibujar nada.
// Efectos que se ponen en un sitio concreto de la imagen: si la cámara se
// mueve, tienen que moverse con ella.
const ANCLADOS = new Set<VfxKind>([
  "explosion", "chispas", "destello", "shockwave", "escarcha", "speedlines",
  "glitch", "magiccircle", "fuego", "aura", "portal", "luz", "baliza", "neon",
  "navidad", "humo", "lampara", "haces", "electricidad", "salpicadura",
]);

export function defaultNode(shape: VfxShape): VfxNode {
  if (shape === "arriba") return { x: 0, y: -0.02, x2: 1, y2: -0.02 };
  if (shape === "punto") return { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 };
  return { x: 0.25, y: 0.5, x2: 0.75, y2: 0.5 };
}

export function newVfx(kind: VfxKind): VfxLayer {
  const spec = vfxSpec(kind);
  const shape = spec.shapes[0];
  return {
    id: nanoid(6), kind, shape,
    // "A mano alzada" empieza vacío: lo suyo es dibujarlo.
    nodes: shape === "libre" ? [] : [defaultNode(shape)],
    auto: true,
    // Lo que se coloca en un sitio concreto se pega a la imagen; lo que cae
    // sobre todo el cuadro, no.
    follow: shape !== "arriba",
    colorHex: spec.color ?? "#ffffff",
    params: vfxDefaults(kind),
    timing: "all", startSec: 0, endSec: 2,
  };
}

// El rato en el que cada efecto está activo dentro de la toma.
export function vfxWindow(v: VfxLayer, shotDuration: number) {
  if (v.timing !== "range") return { start: 0, end: shotDuration };
  const start = Math.max(0, Math.min(shotDuration, v.startSec));
  const end = Math.max(start + 0.05, Math.min(shotDuration, v.endSec));
  return { start, end };
}

export interface Shot {
  id: string;
  durationSec: number; // duración explícita
  autoDuration: boolean; // si true, se calcula a partir de los diálogos
  // Pausa al final, en segundos enteros: acabado el recorrido la imagen se queda
  // quieta en el punto 2 ese rato antes de pasar a la toma siguiente. Es tiempo
  // AÑADIDO a la duración, no un trozo que se le quite al movimiento.
  holdSec: number;
  motionMode: MotionMode;
  preset: PresetMotion; // se usa si motionMode = "preset"
  from: Frame; // punto 1, se usa si motionMode = "free"
  to: Frame; // punto 2, idem
  transition: TransitionKind; // transición de entrada desde la toma anterior
  transitionDur: number; // duración de esa entrada (s)
  dialogues: Dialogue[];
  sfx: ShotSfx[];
  audioOverrides: AudioOverride[]; // qué hacer con los bucles que vienen de arriba
  overlays: PngOverlay[];
  vfx: VfxLayer[];
  // Encuadres de los OTROS formatos. Lo de arriba (motionMode/preset/from/to) es
  // el encuadre del formato activo; al cambiar de formato se guarda aquí el que
  // se deja y se recupera el que ya se hubiera ajustado, para poder tener el
  // mismo capítulo en horizontal y en vertical sin rehacer los encuadres.
  altFrames?: Partial<Record<Aspect, ShotFraming>>;
}

// Lo que define cómo se recorre la imagen en una toma.
export interface ShotFraming {
  motionMode: MotionMode;
  preset: PresetMotion;
  from: Frame;
  to: Frame;
}

export interface StoryScene {
  id: string;
  imageId: string; // clave en el store de imágenes (IndexedDB)
  imgW: number; // tamaño natural de la imagen, para calcular encuadres
  imgH: number;
  shots: Shot[];
  // Cómo es esta imagen, con palabras. Lo escribe la IA al inventar el capítulo
  // y sirve para dibujarla luego; también vale escrito a mano. Es opcional: los
  // proyectos de antes no lo tienen y siguen funcionando igual.
  prompt?: string;
}

export interface AudioLayer {
  id: string;
  kind: "music" | "sfx";
  audioId: string;
  name: string;
  volume: number; // 0..1
  startSec: number; // inicio global
  loop: boolean;
}

// Un video ya hecho (por ejemplo la careta) que se pega antes o después de la
// historia al exportar, para que salga un único archivo.
export interface ClipVideo {
  assetId: string; // el archivo vive en el navegador (IndexedDB)
  name: string;
  dur: number; // segundos
}

export interface StoryProject {
  aspect: Aspect; // forma del video: horizontal, vertical o cuadrado
  scenes: StoryScene[];
  audioLayers: AudioLayer[]; // música/efectos globales de todo el video
  narrationVolume: number; // 0..1
  intro: ClipVideo | null; // se pega al principio
  outro: ClipVideo | null; // se pega al final
  // Qué voz usa cada quien. La clave "" es el narrador; las demás son nombres
  // de personaje. Se guarda en el proyecto y no en cada frase para poder
  // cambiar de golpe cómo suena alguien en todo el capítulo.
  voices?: Record<string, string>;
}

// El narrador no tiene nombre: es el que habla cuando nadie más lo hace.
export const NARRADOR = "";

// Qué voz le toca a una frase: la suya propia, si no la de su personaje, y si
// no la del narrador.
export function vozDe(p: StoryProject, d: Dialogue, porDefecto: string): string {
  return d.voz || p.voices?.[d.quien ?? NARRADOR] || p.voices?.[NARRADOR] || porDefecto;
}

// Todos los que hablan en el capítulo, el narrador primero.
export function quienesHablan(p: StoryProject): string[] {
  const vistos = new Set<string>([NARRADOR]);
  for (const sc of p.scenes)
    for (const sh of sc.shots)
      for (const d of sh.dialogues) if (d.quien) vistos.add(d.quien);
  return [...vistos];
}

export const MIN_SHOT = 2; // duración mínima de una toma sin diálogos
export const TAIL = 0.4; // margen tras el último diálogo
export const DEFAULT_TRANS_DUR = 0.6;

// --------------------------------------------------------------------------
// Formato del video
// --------------------------------------------------------------------------

export type Aspect = "16:9" | "9:16" | "1:1";

export const ASPECTS: { id: Aspect; label: string; corto: string; ratio: number; w: number; h: number }[] = [
  { id: "16:9", label: "Horizontal 16:9", corto: "YouTube, TV", ratio: 16 / 9, w: 1280, h: 720 },
  { id: "9:16", label: "Vertical 9:16", corto: "Shorts, TikTok, Reels", ratio: 9 / 16, w: 720, h: 1280 },
  { id: "1:1", label: "Cuadrado 1:1", corto: "Feed de Instagram", ratio: 1, w: 720, h: 720 },
];

export function aspectInfo(a: Aspect) {
  return ASPECTS.find((x) => x.id === a) ?? ASPECTS[0];
}

// El formato afecta a TODOS los encuadres (el alto de la ventana se deduce del
// ancho para que cuadre con el video). Como solo se edita un proyecto a la vez,
// se guarda aquí en vez de arrastrarlo por cada llamada; quien carga o cambia el
// proyecto lo pone al día con setProjectAspect.
let aspectoActual = 16 / 9;
export function setProjectAspect(a: Aspect) {
  aspectoActual = aspectInfo(a).ratio;
}
function targetAspect() {
  return aspectoActual;
}

// --------------------------------------------------------------------------
// Encuadres
// --------------------------------------------------------------------------

// Alto (0..1 sobre la imagen) que corresponde a un ancho dado para que la
// ventana tenga la forma del video (16:9, 9:16 o cuadrado).
export function frameH(w: number, imgW: number, imgH: number) {
  if (!imgW || !imgH) return w;
  return (w * imgW) / (targetAspect() * imgH);
}

// Ancho máximo que cabe en la imagen manteniendo la forma del video.
export function maxFrameW(imgW: number, imgH: number) {
  if (!imgW || !imgH) return 1;
  return Math.min(1, (imgH * targetAspect()) / imgW);
}

// Encuadre que abarca todo lo posible de la imagen (equivalente a "cover").
export function coverFrame(imgW: number, imgH: number): Frame {
  return { cx: 0.5, cy: 0.5, w: maxFrameW(imgW, imgH) };
}

// Ajusta un encuadre para que quepa dentro de la imagen.
export function clampFrame(f: Frame, imgW: number, imgH: number): Frame {
  const w = Math.max(0.05, Math.min(maxFrameW(imgW, imgH), f.w));
  const h = frameH(w, imgW, imgH);
  return {
    w,
    cx: Math.max(w / 2, Math.min(1 - w / 2, f.cx)),
    cy: Math.max(h / 2, Math.min(1 - h / 2, f.cy)),
  };
}

// Encuadre en píxeles de la imagen, listo para drawImage(img, sx, sy, sw, sh, …).
export function framePx(f: Frame, imgW: number, imgH: number) {
  const c = clampFrame(f, imgW, imgH);
  const h = frameH(c.w, imgW, imgH);
  return {
    sx: (c.cx - c.w / 2) * imgW,
    sy: (c.cy - h / 2) * imgH,
    sw: c.w * imgW,
    sh: h * imgH,
  };
}

export function lerpFrame(a: Frame, b: Frame, p: number): Frame {
  const t = Math.max(0, Math.min(1, p));
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    w: a.w + (b.w - a.w) * t,
  };
}

// --------------------------------------------------------------------------
// Movimiento
// --------------------------------------------------------------------------

// Ancho máximo del encuadre que aún deja hueco para recorrer la separación pedida.
// Sin esto, una imagen 16:9 con el encuadre al 100% no tendría por dónde moverse.
export function presetMaxW(kind: MotionKind, distance: number, imgW: number, imgH: number) {
  const max = maxFrameW(imgW, imgH);
  const d = Math.abs(distance);
  if (kind === "left" || kind === "right") return Math.max(0.05, Math.min(max, 1 - d));
  if (kind === "up" || kind === "down") {
    // El alto tiene que dejar hueco: h + d <= 1.
    const hMax = Math.max(0.05, 1 - d);
    const wForH = imgW ? (hMax * targetAspect() * imgH) / imgW : max;
    return Math.max(0.05, Math.min(max, wForH));
  }
  return max;
}

// Deriva los dos encuadres a partir de un movimiento predefinido.
export function presetFrames(p: PresetMotion, imgW: number, imgH: number): { from: Frame; to: Frame } {
  const half = p.distance / 2;
  // Se encoge lo justo para que el recorrido quepa dentro de la imagen.
  const w = Math.min(p.w, presetMaxW(p.kind, p.distance, imgW, imgH));
  const mk = (dx: number, dy: number, wf: number) =>
    clampFrame({ cx: p.cx + dx, cy: p.cy + dy, w: w * wf }, imgW, imgH);

  switch (p.kind) {
    case "left": return { from: mk(half, 0, 1), to: mk(-half, 0, 1) };
    case "right": return { from: mk(-half, 0, 1), to: mk(half, 0, 1) };
    case "up": return { from: mk(0, half, 1), to: mk(0, -half, 1) };
    case "down": return { from: mk(0, -half, 1), to: mk(0, half, 1) };
    case "in": return { from: mk(0, 0, 1), to: mk(0, 0, 1 - p.distance) };
    case "out": return { from: mk(0, 0, 1 - p.distance), to: mk(0, 0, 1) };
    default: return { from: mk(0, 0, 1), to: mk(0, 0, 1) };
  }
}

// Los dos encuadres efectivos de una toma, venga del modo que venga. Con
// "continue" el punto 1 es donde acabó la toma anterior; si no hay ninguna
// antes, se queda con el suyo.
export function resolveFrames(
  shot: Shot,
  imgW: number,
  imgH: number,
  prevTo?: Frame | null,
): { from: Frame; to: Frame } {
  if (shot.motionMode === "preset") return presetFrames(shot.preset, imgW, imgH);
  const from = shot.motionMode === "continue" && prevTo ? prevTo : shot.from;
  return { from: clampFrame(from, imgW, imgH), to: clampFrame(shot.to, imgW, imgH) };
}

// Rango recomendado del deslizador de separación según el tipo de movimiento.
// Cuánto recorre el movimiento. Nunca negativo: el sentido lo deciden los
// botones (izquierda/derecha, subir/bajar, acercar/alejar), así que un valor
// negativo solo era otra forma de decir lo que ya dice el botón contrario.
export function distanceRange(kind: MotionKind): { min: number; max: number } {
  if (kind === "in" || kind === "out") return { min: 0, max: 0.8 };
  if (kind === "fixed") return { min: 0, max: 0 };
  return { min: 0, max: 0.6 };
}

// El botón contrario: el que hace el mismo movimiento al revés.
const OPUESTO: Record<MotionKind, MotionKind> = {
  fixed: "fixed", left: "right", right: "left", up: "down", down: "up", in: "out", out: "in",
};

// Convierte los movimientos guardados con separación negativa (cuando eso
// existía) a su equivalente con el botón contrario, para que se sigan viendo
// EXACTAMENTE igual:
//   · en los desplazamientos basta con dar la vuelta al botón;
//   · en acercar/alejar hay que rehacer también las cuentas, porque encoger un
//     k% y agrandar un k% no son la misma proporción.
export function normalizePreset(p: PresetMotion, imgW: number, imgH: number): PresetMotion {
  if (!(p.distance < 0)) return p;
  const k = -p.distance;
  const kind = OPUESTO[p.kind] ?? p.kind;
  if (p.kind !== "in" && p.kind !== "out") return { ...p, kind, distance: k };

  // En acercar/alejar no basta con dar la vuelta: encoger un k% y agrandar un k%
  // no son la misma proporción, y además el encuadre grande pudo quedar recortado
  // por el borde de la imagen. Se parte de los tamaños que DE VERDAD salían.
  const { from, to } = presetFrames(p, imgW, imgH);
  if (!(from.w > 0) || !(to.w > 0)) return { ...p, kind, distance: k };
  return to.w < from.w
    ? { ...p, kind: "in", w: from.w, distance: 1 - to.w / from.w }
    : { ...p, kind: "out", w: to.w, distance: 1 - from.w / to.w };
}

// --------------------------------------------------------------------------
// Duraciones y recorrido del tiempo
// --------------------------------------------------------------------------

// Lo que ocupa un diálogo ya con su efecto: los que cambian el tono lo hacen
// cambiando la velocidad, y entonces el audio dura más o menos.
export function dialogueDur(d: Dialogue) {
  // El efecto ya cambiaba la duración (sigue igual que siempre) y la velocidad
  // se le suma encima. El tono no aparece aquí: no altera lo que dura.
  return (d.dur || 0) / ((VOICE_RATE[d.effect] ?? 1) * (d.speed || 1));
}

// Instante en que arranca cada diálogo dentro de la toma. Se encadenan: cada uno
// empieza tras su pausa, contada desde el final del anterior.
export function dialogueStarts(s: Shot): number[] {
  const out: number[] = [];
  let t = 0;
  for (const d of s.dialogues) {
    t += Math.max(0, d.gapSec || 0);
    out.push(t);
    t += dialogueDur(d);
  }
  return out;
}

// Igual para los sonidos: los que no van en bucle se encadenan entre sí; los de
// bucle arrancan desde el inicio de la toma más su pausa.
export function sfxStarts(s: Shot): number[] {
  const out: number[] = [];
  let t = 0;
  for (const x of s.sfx) {
    const gap = Math.max(0, x.gapSec || 0);
    if (x.loop) {
      out.push(gap);
    } else {
      t += gap;
      out.push(t);
      t += x.dur || 0;
    }
  }
  return out;
}

// Lo que tarda el movimiento en ir del punto 1 al 2, sin contar la pausa final.
export function moveDur(s: Shot) {
  if (!s.autoDuration) return Math.max(0.3, s.durationSec);
  const starts = dialogueStarts(s);
  let end = 0;
  s.dialogues.forEach((d, i) => { end = Math.max(end, starts[i] + dialogueDur(d)); });
  return Math.max(MIN_SHOT, end + (end > 0 ? TAIL : 0));
}

// La toma dura el movimiento MÁS la pausa. La pausa es tiempo añadido, no un
// trozo que se le quite al movimiento: acabado el recorrido, la imagen se queda
// quieta esos segundos y hasta que no pasan no empieza la toma siguiente.
export function shotDur(s: Shot) {
  return moveDur(s) + Math.max(0, s.holdSec || 0);
}

// Progreso del movimiento (0..1): llega a 1 cuando acaba el recorrido, y de ahí
// al final de la toma se queda clavado en el punto 2, que es lo que se quería
// dejar ver.
export function moveProgress(shot: Shot, localTime: number) {
  return Math.max(0, Math.min(1, localTime / Math.max(0.05, moveDur(shot))));
}

export interface FlatShot {
  scene: StoryScene;
  shot: Shot;
  sceneIndex: number;
  shotIndex: number;
  start: number;
  dur: number;
  // Los dos encuadres ya resueltos. Se calculan aquí porque una toma que
  // "continúa" necesita saber dónde acabó la de antes, y eso solo se sabe
  // recorriendo la línea de tiempo en orden.
  frames: { from: Frame; to: Frame };
}

// Aplana escenas+tomas en una línea de tiempo con los tiempos globales.
export function flatten(p: StoryProject): FlatShot[] {
  const out: FlatShot[] = [];
  let acc = 0;
  let anterior: Frame | null = null; // dónde acabó la toma de antes
  p.scenes.forEach((scene, sceneIndex) => {
    scene.shots.forEach((shot, shotIndex) => {
      const dur = shotDur(shot);
      const frames = resolveFrames(shot, scene.imgW, scene.imgH, anterior);
      out.push({ scene, shot, sceneIndex, shotIndex, start: acc, dur, frames });
      acc += dur;
      anterior = frames.to;
    });
  });
  return out;
}

export function totalDuration(p: StoryProject) {
  return flatten(p).reduce((a, f) => a + f.dur, 0);
}

// Tramo (inicio, fin) que ocupa una escena entera en la línea de tiempo.
export function sceneRange(flat: FlatShot[], sceneId: string): { start: number; end: number } | null {
  const parts = flat.filter((f) => f.scene.id === sceneId);
  if (!parts.length) return null;
  return { start: parts[0].start, end: parts[parts.length - 1].start + parts[parts.length - 1].dur };
}

// Sonido en bucle que llega a una toma desde una anterior.
export interface InheritedLoop {
  sfx: ShotSfx;
  volume: number; // volumen efectivo en esta toma
  fromSceneIndex: number;
  fromShotIndex: number;
}

// Bucles que siguen sonando al llegar a la toma `index`: los que arrancaron antes
// y ninguna toma intermedia (ni esta) ha cortado. El volumen es el de la última
// excepción que se haya puesto por el camino.
export function inheritedLoops(flat: FlatShot[], index: number): InheritedLoop[] {
  const out: InheritedLoop[] = [];
  for (let j = 0; j < index; j++) {
    for (const s of flat[j].shot.sfx) {
      if (!s.loop) continue;
      let stopped = false;
      let volume = s.volume;
      for (let k = j + 1; k <= index; k++) {
        const ov = flat[k].shot.audioOverrides?.find((o) => o.sfxId === s.id);
        if (!ov) continue;
        if (ov.stop) { stopped = true; break; }
        if (typeof ov.volume === "number") volume = ov.volume;
      }
      if (!stopped) out.push({ sfx: s, volume, fromSceneIndex: flat[j].sceneIndex, fromShotIndex: flat[j].shotIndex });
    }
  }
  return out;
}

// Cuándo deja de sonar un bucle: en la primera toma posterior que lo corte, o al
// final del video. Devuelve también los cambios de volumen por el camino.
export function loopSpan(flat: FlatShot[], fromIndex: number, sfxId: string, total: number) {
  const changes: { at: number; volume: number }[] = [];
  let end = total;
  for (let k = fromIndex + 1; k < flat.length; k++) {
    const ov = flat[k].shot.audioOverrides?.find((o) => o.sfxId === sfxId);
    if (!ov) continue;
    if (ov.stop) { end = flat[k].start; break; }
    if (typeof ov.volume === "number") changes.push({ at: flat[k].start, volume: ov.volume });
  }
  return { end, changes };
}

// Índice de la toma activa en un instante dado.
export function locate(flat: FlatShot[], t: number): number {
  if (!flat.length) return -1;
  for (let i = 0; i < flat.length; i++) {
    if (t < flat[i].start + flat[i].dur) return i;
  }
  return flat.length - 1;
}

// --------------------------------------------------------------------------
// Stickers PNG
// --------------------------------------------------------------------------

const lerp = (a: number, b: number, p: number) => a + (b - a) * Math.max(0, Math.min(1, p));

// Caja del sticker en el lienzo (0..1) en un momento dado del recorrido.
export function overlayBox(
  o: PngOverlay,
  p: number,
  frames: { from: Frame; to: Frame },
  imgW: number,
  imgH: number,
) {
  if (o.motion === "free") {
    return {
      x: lerp(o.x, o.toX, p), y: lerp(o.y, o.toY, p),
      w: lerp(o.w, o.toW, p), h: lerp(o.h, o.toH, p),
    };
  }
  if (o.motion === "follow") {
    // Se ancla al punto de la imagen donde estaba al empezar y se mueve con la cámara.
    const f0 = frames.from;
    const f = lerpFrame(frames.from, frames.to, p);
    const h0 = frameH(f0.w, imgW, imgH);
    const hp = frameH(f.w, imgW, imgH);
    const ix = f0.cx - f0.w / 2 + o.x * f0.w;
    const iy = f0.cy - h0 / 2 + o.y * h0;
    const k = f.w ? f0.w / f.w : 1;
    return {
      x: (ix - (f.cx - f.w / 2)) / (f.w || 1),
      y: (iy - (f.cy - hp / 2)) / (hp || 1),
      w: o.w * k,
      h: o.h * k,
    };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

// --------------------------------------------------------------------------
// Constructores
// --------------------------------------------------------------------------

export function defaultPreset(imgW: number, imgH: number, kind: MotionKind = "in"): PresetMotion {
  const distance = kind === "fixed" ? 0 : 0.28;
  return { kind, cx: 0.5, cy: 0.5, w: presetMaxW(kind, distance, imgW, imgH), distance };
}

export function newShot(imgW: number, imgH: number, kind: MotionKind = "in"): Shot {
  const preset = defaultPreset(imgW, imgH, kind);
  const { from, to } = presetFrames(preset, imgW, imgH);
  return {
    id: nanoid(6),
    durationSec: 4,
    autoDuration: true,
    holdSec: 0,
    motionMode: "preset",
    preset,
    from,
    to,
    // De serie, corte seco: es lo que se espera al encadenar tomas de una misma
    // escena, y el fundido se pone a mano cuando se quiere.
    transition: "cut",
    transitionDur: DEFAULT_TRANS_DUR,
    dialogues: [],
    sfx: [],
    audioOverrides: [],
    overlays: [],
    vfx: [],
  };
}

export function newScene(imageId: string, imgW: number, imgH: number): StoryScene {
  return { id: nanoid(6), imageId, imgW, imgH, shots: [newShot(imgW, imgH)] };
}

export function newDialogue(gapSec = 0.3): Dialogue {
  return { id: nanoid(6), text: "", dur: 0, gapSec, effect: "none", speed: 1, pitch: 1, stale: false };
}

export function newSfx(audioId: string, name: string, dur: number): ShotSfx {
  return { id: nanoid(6), audioId, name, volume: 0.8, dur, gapSec: 0, loop: false };
}

export function newOverlay(imageId: string): PngOverlay {
  return {
    id: nanoid(6), imageId,
    x: 0.35, y: 0.35, w: 0.3, h: 0.3,
    motion: "follow",
    toX: 0.35, toY: 0.35, toW: 0.3, toH: 0.3,
    transition: "inherit",
    timing: "all", startSec: 0, endSec: 1, durSec: 1,
    soundVolume: 0.9, soundDelay: 0, soundLoop: false,
  };
}

// Cuándo aparece y desaparece cada sticker de una toma. Los encadenados ("after")
// dependen del que tienen delante, así que se calculan todos de una pasada.
export function overlayWindows(overlays: PngOverlay[], shotDuration: number) {
  let finAnterior = 0;
  return overlays.map((o) => {
    let start: number;
    let end: number;
    if (o.timing === "range") {
      start = Math.max(0, Math.min(shotDuration, o.startSec));
      end = Math.max(start + 0.05, Math.min(shotDuration, o.endSec));
    } else if (o.timing === "after") {
      start = Math.max(0, Math.min(shotDuration, finAnterior + Math.max(0, o.startSec)));
      end = Math.min(shotDuration, start + Math.max(0.05, o.durSec));
    } else {
      start = 0;
      end = shotDuration;
    }
    finAnterior = end;
    return { start, end };
  });
}

// El rato de un sticker suelto (hace falta su toma para los encadenados).
export function overlayWindow(o: PngOverlay, overlays: PngOverlay[], shotDuration: number) {
  const i = overlays.findIndex((x) => x.id === o.id);
  const todos = overlayWindows(overlays, shotDuration);
  return todos[i] ?? { start: 0, end: shotDuration };
}

// Cambia el formato del video conservando el encuadre de cada formato: el que
// se deja se guarda, y si ya se había ajustado uno para el formato nuevo se
// recupera tal cual. La primera vez que se estrena un formato se parte del
// encuadre actual, ajustado para que quepa en la nueva forma.
export function switchAspect(p: StoryProject, next: Aspect): StoryProject {
  const prev = p.aspect;
  if (prev === next) return p;
  setProjectAspect(next); // los ajustes de abajo se hacen ya con la forma nueva
  const scenes = p.scenes.map((sc) => ({
    ...sc,
    shots: sc.shots.map((sh) => {
      const actual: ShotFraming = {
        motionMode: sh.motionMode, preset: sh.preset, from: sh.from, to: sh.to,
      };
      const alt: Partial<Record<Aspect, ShotFraming>> = { ...(sh.altFrames ?? {}) };
      alt[prev] = actual;
      const guardado = alt[next];
      delete alt[next];
      const nuevo: ShotFraming = guardado ?? {
        motionMode: actual.motionMode,
        preset: {
          ...actual.preset,
          w: Math.min(actual.preset.w, presetMaxW(actual.preset.kind, actual.preset.distance, sc.imgW, sc.imgH)),
        },
        from: clampFrame(actual.from, sc.imgW, sc.imgH),
        to: clampFrame(actual.to, sc.imgW, sc.imgH),
      };
      return { ...sh, ...nuevo, altFrames: alt };
    }),
  }));
  return { ...p, aspect: next, scenes };
}

// Todos los archivos (imágenes, audios, videos) que usa un proyecto. Sirve para
// poder limpiarlos del navegador cuando se borra el proyecto.
export function projectAssets(p: StoryProject): string[] {
  const ids = new Set<string>();
  for (const sc of p.scenes) {
    ids.add(sc.imageId);
    for (const sh of sc.shots) {
      for (const d of sh.dialogues) if (d.audioId) ids.add(d.audioId);
      for (const s of sh.sfx) ids.add(s.audioId);
      for (const o of sh.overlays) {
        ids.add(o.imageId);
        if (o.soundId) ids.add(o.soundId);
      }
    }
  }
  for (const l of p.audioLayers) ids.add(l.audioId);
  if (p.intro) ids.add(p.intro.assetId);
  if (p.outro) ids.add(p.outro.assetId);
  return [...ids].filter(Boolean);
}

export function emptyProject(): StoryProject {
  return { aspect: "16:9", scenes: [], audioLayers: [], narrationVolume: 1, intro: null, outro: null };
}

// --------------------------------------------------------------------------
// Reordenar
// --------------------------------------------------------------------------

export function moveScene(p: StoryProject, id: string, dir: -1 | 1): StoryProject {
  const i = p.scenes.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.scenes.length) return p;
  const scenes = [...p.scenes];
  [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
  return { ...p, scenes };
}

// Mueve una escena a una posición concreta (arrastrar y soltar).
export function reorderScene(p: StoryProject, id: string, toIndex: number): StoryProject {
  const i = p.scenes.findIndex((s) => s.id === id);
  if (i < 0) return p;
  const scenes = [...p.scenes];
  const [it] = scenes.splice(i, 1);
  scenes.splice(Math.max(0, Math.min(scenes.length, toIndex)), 0, it);
  return { ...p, scenes };
}

// Copia una toma entera con todo lo que lleva dentro: encuadre, tiempos,
// diálogos, sonidos, stickers y efectos. Todo con identificadores nuevos, para
// que retocar la copia no toque el original. Los archivos (imágenes, audios) se
// comparten: se referencian por id y no se duplica nada pesado.
export function duplicateShot(p: StoryProject, sceneId: string, shotId: string): StoryProject {
  return {
    ...p,
    scenes: p.scenes.map((sc) => {
      if (sc.id !== sceneId) return sc;
      const i = sc.shots.findIndex((h) => h.id === shotId);
      if (i < 0) return sc;
      const o = sc.shots[i];
      const copia: Shot = {
        ...o,
        id: nanoid(6),
        preset: { ...o.preset },
        from: { ...o.from }, to: { ...o.to },
        altFrames: o.altFrames ? JSON.parse(JSON.stringify(o.altFrames)) : undefined,
        // La voz ya generada se reaprovecha: es el mismo texto, así que no hay
        // por qué volver a esperar a que la IA lo lea.
        dialogues: o.dialogues.map((d) => ({ ...d, id: nanoid(6) })),
        sfx: o.sfx.map((x) => ({ ...x, id: nanoid(6) })),
        // Las excepciones de audio apuntan a bucles de OTRAS tomas, así que
        // siguen valiendo tal cual.
        audioOverrides: o.audioOverrides.map((x) => ({ ...x })),
        overlays: o.overlays.map((x) => ({ ...x, id: nanoid(6) })),
        vfx: (o.vfx ?? []).map((v) => ({
          ...v, id: nanoid(6),
          params: { ...v.params },
          nodes: v.nodes.map((n) => ({ ...n })),
        })),
      };
      const shots = [...sc.shots];
      shots.splice(i + 1, 0, copia);
      return { ...sc, shots };
    }),
  };
}

export function moveShot(p: StoryProject, sceneId: string, shotId: string, dir: -1 | 1): StoryProject {
  return {
    ...p,
    scenes: p.scenes.map((sc) => {
      if (sc.id !== sceneId) return sc;
      const i = sc.shots.findIndex((s) => s.id === shotId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sc.shots.length) return sc;
      const shots = [...sc.shots];
      [shots[i], shots[j]] = [shots[j], shots[i]];
      return { ...sc, shots };
    }),
  };
}

// --------------------------------------------------------------------------
// Compatibilidad con proyectos guardados con modelos anteriores
// --------------------------------------------------------------------------

// Un proyecto guardado antes de que existieran los efectos no trae nada; se
// rellena con lo que falte para que no haya que migrar nada a mano.
function normalizeVfx(v: any): VfxLayer {
  const kind: VfxKind = vfxSpec(v.kind).id;
  const permitidas = vfxSpec(kind).shapes;
  const forma: VfxShape = permitidas.includes(v.shape) ? v.shape : permitidas[0];
  const sitios: VfxNode[] = Array.isArray(v.nodes)
    ? v.nodes.map((n: any) => ({
        x: Number(n.x) || 0, y: Number(n.y) || 0,
        x2: Number(n.x2) || 0, y2: Number(n.y2) || 0,
      }))
    // Los proyectos de antes traían un solo sitio suelto en x/y/x2/y2.
    : [{
        x: Number(v.x) || 0, y: Number(v.y) || 0,
        x2: Number(v.x2) || 0, y2: Number(v.y2) || 0,
      }];
  return {
    id: v.id ?? nanoid(6),
    kind,
    shape: forma,
    espacio: v.espacio === "imagen" ? "imagen" : "encuadre",
    // En un proyecto de antes el sitio se puso a mano con las barras: no se
    // toca. Y como entonces nada seguía a la cámara, se respeta.
    auto: !!v.auto,
    // Si no se dice nada, se decide por el efecto: lo que va pegado a un sitio
    // de la foto (una hoguera, una farola) sigue a la cámara, y lo que cae
    // sobre todo el cuadro (lluvia, nieve) no. Escrito a mano se acertaba solo
    // por casualidad, y sin esto el fuego se queda flotando al hacer zoom.
    follow: typeof v.follow === "boolean" ? v.follow : forma !== "arriba" && vfxSpec(kind).continuo !== undefined && ANCLADOS.has(kind),
    // La forma "arriba" ES una franja a todo el ancho por encima del cuadro:
    // sus sitios los pone el modelo, no quien escribe el proyecto. Un punto
    // suelto aquí hacía que la lluvia cayera en una columna en mitad de la
    // escena, y no avisaba nadie.
    nodes: forma === "arriba" ? [defaultNode("arriba")] : sitios,
    colorHex: typeof v.colorHex === "string" ? v.colorHex : (vfxSpec(kind).color ?? "#ffffff"),
    params: { ...vfxDefaults(kind), ...(v.params ?? {}) },
    timing: v.timing === "range" ? "range" : "all",
    startSec: Number(v.startSec) || 0,
    endSec: Number(v.endSec) || 2,
  };
}

function normalizeOverlay(o: any): PngOverlay {
  return {
    id: o.id ?? nanoid(6),
    imageId: o.imageId,
    x: o.x ?? 0.35, y: o.y ?? 0.35, w: o.w ?? 0.3, h: o.h ?? 0.3,
    motion: o.motion ?? "fixed",
    toX: o.toX ?? o.x ?? 0.35, toY: o.toY ?? o.y ?? 0.35,
    toW: o.toW ?? o.w ?? 0.3, toH: o.toH ?? o.h ?? 0.3,
    transition: o.transition ?? "inherit",
    timing: o.timing === "range" || o.timing === "after" ? o.timing : "all",
    startSec: Number(o.startSec) || 0,
    endSec: Number(o.endSec) || 1,
    durSec: Number(o.durSec) || 1,
    soundId: o.soundId || undefined,
    soundName: o.soundName || undefined,
    soundVolume: typeof o.soundVolume === "number" ? o.soundVolume : 0.9,
    soundDelay: Number(o.soundDelay) || 0,
    soundLoop: !!o.soundLoop,
  };
}

// Los modelos anteriores guardaban un instante absoluto (startSec). Se convierte
// a pausas encadenadas para no perder los tiempos ya ajustados.
function startsToGaps<T extends { startSec?: number; gapSec?: number; dur?: number }>(items: T[]): T[] {
  let prevEnd = 0;
  return items.map((it) => {
    if (typeof it.gapSec === "number") return it;
    const start = Math.max(0, it.startSec ?? 0);
    const gapSec = Math.max(0, Number((start - prevEnd).toFixed(3)));
    prevEnd = start + (it.dur ?? 0);
    const { startSec: _drop, ...rest } = it as any;
    return { ...rest, gapSec } as T;
  });
}

function normalizeFraming(f: any, imgW: number, imgH: number): ShotFraming | null {
  if (!f || !f.preset || !f.from || !f.to) return null;
  return {
    motionMode: f.motionMode === "free" ? "free" : "preset",
    preset: { ...defaultPreset(imgW, imgH), ...f.preset },
    from: f.from,
    to: f.to,
  };
}

function normalizeShot(s: any, imgW: number, imgH: number): Shot {
  const base = newShot(imgW, imgH);
  const hasFrames = s.from && s.to && typeof s.from.cx === "number";
  return {
    ...base,
    id: s.id ?? base.id,
    durationSec: s.durationSec ?? base.durationSec,
    autoDuration: s.autoDuration ?? base.autoDuration,
    holdSec: s.holdSec ?? 0,
    // Sin modo guardado: los proyectos antiguos llevaban los dos encuadres a mano.
    motionMode: s.motionMode === "free" || s.motionMode === "continue"
      ? s.motionMode
      : s.motionMode === "preset" ? "preset" : (hasFrames ? "free" : "preset"),
    preset: normalizePreset(s.preset ?? defaultPreset(imgW, imgH), imgW, imgH),
    from: hasFrames ? s.from : base.from,
    to: hasFrames ? s.to : base.to,
    transition: s.transition ?? base.transition,
    transitionDur: s.transitionDur ?? base.transitionDur,
    dialogues: startsToGaps<Dialogue>((s.dialogues ?? []).map((d: any) => ({ ...d, effect: d.effect ?? "none", speed: Number(d.speed) || 1, pitch: Number(d.pitch) || 1, stale: !!d.stale, ...(typeof d.quien === "string" && d.quien.trim() ? { quien: d.quien.trim().slice(0, 60) } : {}), ...(typeof d.voz === "string" && d.voz.trim() ? { voz: d.voz.trim().slice(0, 40) } : {}) }))),
    sfx: startsToGaps<ShotSfx>((s.sfx ?? []).map((x: any) => ({ ...x, dur: x.dur ?? 0, loop: x.loop ?? false }))),
    audioOverrides: s.audioOverrides ?? [],
    overlays: (s.overlays ?? []).map(normalizeOverlay),
    vfx: (s.vfx ?? []).map(normalizeVfx),
    altFrames: normalizeAltFrames(s.altFrames, imgW, imgH),
  };
}

function normalizeAltFrames(raw: any, imgW: number, imgH: number): Shot["altFrames"] {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<Aspect, ShotFraming>> = {};
  for (const a of ASPECTS) {
    const f = normalizeFraming(raw[a.id], imgW, imgH);
    if (f) out[a.id] = f;
  }
  return Object.keys(out).length ? out : undefined;
}

export function migrateProject(raw: any): StoryProject {
  if (!raw || typeof raw !== "object") return emptyProject();

  // Modelo actual o intermedio: escenas con tomas.
  if (Array.isArray(raw.scenes)) {
    return {
      aspect: normalizeAspect(raw.aspect),
      scenes: raw.scenes.map((sc: any) => ({
        id: sc.id ?? nanoid(6),
        imageId: sc.imageId,
        imgW: sc.imgW || 16,
        imgH: sc.imgH || 9,
        shots: (sc.shots ?? []).map((s: any) => normalizeShot(s, sc.imgW || 16, sc.imgH || 9)),
        // La descripción de la imagen viaja con la escena: sin ella no se puede
        // volver a dibujar ni saber qué había ahí.
        ...(typeof sc.prompt === "string" && sc.prompt.trim() ? { prompt: sc.prompt.trim().slice(0, 2000) } : {}),
      })),
      audioLayers: raw.audioLayers ?? [],
      narrationVolume: typeof raw.narrationVolume === "number" ? raw.narrationVolume : 1,
      // Qué voz usa cada quien. Viaja con el proyecto: si no, al abrirlo en otro
      // sitio todos volverían a sonar igual.
      ...(raw.voices && typeof raw.voices === "object" ? { voices: raw.voices as Record<string, string> } : {}),
      intro: normalizeClip(raw.intro),
      outro: normalizeClip(raw.outro),
    };
  }

  // Modelo original: una lista plana de "slides".
  if (!Array.isArray(raw.slides)) return emptyProject();
  const kindOf = (pan: string, zoom: string): MotionKind => {
    if (pan && pan !== "none") return pan as MotionKind;
    if (zoom === "in" || zoom === "out") return zoom;
    return "fixed";
  };
  const scenes: StoryScene[] = raw.slides.map((s: any) => {
    // No conocemos el tamaño original: 16:9 deja el encuadre completo.
    const imgW = 16, imgH = 9;
    const base = newShot(imgW, imgH, kindOf(s.pan, s.zoom));
    const shot: Shot = {
      ...base,
      transition: s.transition ?? "fade",
      dialogues: s.narration
        ? [{ id: nanoid(6), text: s.narration, audioId: s.audioId, dur: s.narrationDur ?? 0, gapSec: 0, effect: "none" as VoiceEffect, speed: 1, pitch: 1, stale: false }]
        : [],
      overlays: (s.overlays ?? []).map(normalizeOverlay),
      vfx: (s.vfx ?? []).map(normalizeVfx),
    };
    return { id: s.id ?? nanoid(6), imageId: s.imageId, imgW, imgH, shots: [shot] };
  });
  return {
    aspect: normalizeAspect(raw.aspect),
    scenes,
    audioLayers: raw.audioLayers ?? [],
    narrationVolume: typeof raw.narrationVolume === "number" ? raw.narrationVolume : 1,
    intro: normalizeClip(raw.intro),
    outro: normalizeClip(raw.outro),
  };
}

function normalizeAspect(a: any): Aspect {
  return ASPECTS.some((x) => x.id === a) ? (a as Aspect) : "16:9";
}

function normalizeClip(c: any): ClipVideo | null {
  if (!c || typeof c.assetId !== "string") return null;
  return { assetId: c.assetId, name: String(c.name ?? "video"), dur: Number(c.dur) || 0 };
}
