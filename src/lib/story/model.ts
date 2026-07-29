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
export type MotionMode = "preset" | "free";

// Movimiento predefinido: un centro, un tamaño y una separación entre los dos
// puntos. La separación puede ser negativa para invertir el sentido.
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
  // true cuando el texto cambió después de generar la voz: el audio sigue ahí
  // (para poder seguir viendo el video) pero ya no corresponde a lo escrito.
  stale: boolean;
  // Pausa antes de este diálogo, contada desde que acaba el anterior. Se usa una
  // pausa en vez de un instante absoluto para que el orden siga teniendo sentido
  // aunque la voz todavía no se haya generado (y por tanto no se sepa cuánto dura).
  gapSec: number;
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
}

export interface Shot {
  id: string;
  durationSec: number; // duración explícita
  autoDuration: boolean; // si true, se calcula a partir de los diálogos
  holdSec: number; // pausa al final: la imagen se queda quieta en el punto 2
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
}

export interface StoryScene {
  id: string;
  imageId: string; // clave en el store de imágenes (IndexedDB)
  imgW: number; // tamaño natural de la imagen, para calcular encuadres
  imgH: number;
  shots: Shot[];
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

// Los dos encuadres efectivos de una toma, venga del modo que venga.
export function resolveFrames(shot: Shot, imgW: number, imgH: number): { from: Frame; to: Frame } {
  if (shot.motionMode === "preset") return presetFrames(shot.preset, imgW, imgH);
  return { from: clampFrame(shot.from, imgW, imgH), to: clampFrame(shot.to, imgW, imgH) };
}

// Rango recomendado del deslizador de separación según el tipo de movimiento.
export function distanceRange(kind: MotionKind): { min: number; max: number } {
  if (kind === "in" || kind === "out") return { min: -0.8, max: 0.8 };
  if (kind === "fixed") return { min: 0, max: 0 };
  return { min: -0.6, max: 0.6 };
}

// --------------------------------------------------------------------------
// Duraciones y recorrido del tiempo
// --------------------------------------------------------------------------

// Lo que ocupa un diálogo ya con su efecto: los que cambian el tono lo hacen
// cambiando la velocidad, y entonces el audio dura más o menos.
export function dialogueDur(d: Dialogue) {
  return (d.dur || 0) / (VOICE_RATE[d.effect] ?? 1);
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

export function shotDur(s: Shot) {
  if (!s.autoDuration) return Math.max(0.3, s.durationSec);
  const starts = dialogueStarts(s);
  let end = 0;
  s.dialogues.forEach((d, i) => { end = Math.max(end, starts[i] + dialogueDur(d)); });
  return Math.max(MIN_SHOT, end + (end > 0 ? TAIL : 0)) + Math.max(0, s.holdSec);
}

// Progreso del movimiento (0..1). La velocidad la marca la duración de la toma:
// el recorrido ocupa todo menos la pausa final, y en esa pausa la imagen se queda
// quieta en el punto 2 para poder ver bien lo que se quería enfocar.
export function moveProgress(shot: Shot, localTime: number) {
  const d = shotDur(shot);
  const hold = Math.max(0, Math.min(d - 0.1, shot.holdSec || 0));
  const move = Math.max(0.05, d - hold);
  return Math.max(0, Math.min(1, localTime / move));
}

export interface FlatShot {
  scene: StoryScene;
  shot: Shot;
  sceneIndex: number;
  shotIndex: number;
  start: number;
  dur: number;
}

// Aplana escenas+tomas en una línea de tiempo con los tiempos globales.
export function flatten(p: StoryProject): FlatShot[] {
  const out: FlatShot[] = [];
  let acc = 0;
  p.scenes.forEach((scene, sceneIndex) => {
    scene.shots.forEach((shot, shotIndex) => {
      const dur = shotDur(shot);
      out.push({ scene, shot, sceneIndex, shotIndex, start: acc, dur });
      acc += dur;
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
    transition: "fade",
    transitionDur: DEFAULT_TRANS_DUR,
    dialogues: [],
    sfx: [],
    audioOverrides: [],
    overlays: [],
  };
}

export function newScene(imageId: string, imgW: number, imgH: number): StoryScene {
  return { id: nanoid(6), imageId, imgW, imgH, shots: [newShot(imgW, imgH)] };
}

export function newDialogue(gapSec = 0.3): Dialogue {
  return { id: nanoid(6), text: "", dur: 0, gapSec, effect: "none", stale: false };
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
  };
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
      for (const o of sh.overlays) ids.add(o.imageId);
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

function normalizeOverlay(o: any): PngOverlay {
  return {
    id: o.id ?? nanoid(6),
    imageId: o.imageId,
    x: o.x ?? 0.35, y: o.y ?? 0.35, w: o.w ?? 0.3, h: o.h ?? 0.3,
    motion: o.motion ?? "fixed",
    toX: o.toX ?? o.x ?? 0.35, toY: o.toY ?? o.y ?? 0.35,
    toW: o.toW ?? o.w ?? 0.3, toH: o.toH ?? o.h ?? 0.3,
    transition: o.transition ?? "inherit",
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
    motionMode: s.motionMode ?? (hasFrames ? "free" : "preset"),
    preset: s.preset ?? defaultPreset(imgW, imgH),
    from: hasFrames ? s.from : base.from,
    to: hasFrames ? s.to : base.to,
    transition: s.transition ?? base.transition,
    transitionDur: s.transitionDur ?? base.transitionDur,
    dialogues: startsToGaps<Dialogue>((s.dialogues ?? []).map((d: any) => ({ ...d, effect: d.effect ?? "none", stale: !!d.stale }))),
    sfx: startsToGaps<ShotSfx>((s.sfx ?? []).map((x: any) => ({ ...x, dur: x.dur ?? 0, loop: x.loop ?? false }))),
    audioOverrides: s.audioOverrides ?? [],
    overlays: (s.overlays ?? []).map(normalizeOverlay),
  };
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
      })),
      audioLayers: raw.audioLayers ?? [],
      narrationVolume: typeof raw.narrationVolume === "number" ? raw.narrationVolume : 1,
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
        ? [{ id: nanoid(6), text: s.narration, audioId: s.audioId, dur: s.narrationDur ?? 0, gapSec: 0, effect: "none" as VoiceEffect, stale: false }]
        : [],
      overlays: (s.overlays ?? []).map(normalizeOverlay),
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
