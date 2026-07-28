// Modelo de "Historias narradas".
//
// Estructura: un proyecto tiene ESCENAS (una imagen cada una) y cada escena tiene
// una o varias SUB-ESCENAS o "tomas" (Shot). Cada toma define su propio encuadre
// de inicio y de fin sobre la misma imagen — así una sola imagen da varias tomas
// sin volver a importarla —, su duración, su transición de entrada (con velocidad
// propia), sus diálogos narrados (cada uno con su momento de inicio), sus efectos
// de sonido y sus stickers PNG.

import { nanoid } from "nanoid";

export type TransitionKind = "cut" | "fade" | "slide";
// Los stickers pueden seguir la transición de la toma o tener la suya propia.
export type OverlayTransition = "inherit" | TransitionKind;

// Encuadre: ventana recortada sobre la imagen, por centro (cx, cy) y ancho (w),
// todo normalizado 0..1 respecto a la imagen. El alto se deduce para mantener
// siempre 16:9 y no deformar.
export interface Frame {
  cx: number;
  cy: number;
  w: number;
}

export interface Dialogue {
  id: string;
  text: string; // texto oculto que narra la voz IA
  audioId?: string; // audio generado (IndexedDB)
  dur: number; // duración del audio (s), 0 si aún no se generó
  startSec: number; // cuándo arranca dentro de la toma
}

export interface ShotSfx {
  id: string;
  audioId: string;
  name: string;
  volume: number; // 0..1
  startSec: number; // cuándo suena dentro de la toma (0 = al entrar la transición)
}

export interface PngOverlay {
  id: string;
  imageId: string;
  x: number; y: number; w: number; h: number; // sobre el lienzo final, 0..1
  transition: OverlayTransition;
}

export interface Shot {
  id: string;
  durationSec: number; // duración explícita
  autoDuration: boolean; // si true, se calcula a partir de los diálogos
  from: Frame; // encuadre al empezar
  to: Frame; // encuadre al terminar (el movimiento va de uno a otro)
  transition: TransitionKind; // transición de entrada
  transitionDur: number; // velocidad de esa transición (s)
  dialogues: Dialogue[];
  sfx: ShotSfx[];
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

export interface StoryProject {
  scenes: StoryScene[];
  audioLayers: AudioLayer[]; // música/efectos globales de todo el video
  narrationVolume: number; // 0..1
}

export const MIN_SHOT = 2; // duración mínima de una toma sin diálogos
export const TAIL = 0.4; // margen tras el último diálogo
export const DEFAULT_TRANS_DUR = 0.6;
export const TARGET_ASPECT = 16 / 9;

// --------------------------------------------------------------------------
// Encuadres
// --------------------------------------------------------------------------

// Alto (0..1 sobre la imagen) que corresponde a un ancho dado para quedar en 16:9.
export function frameH(w: number, imgW: number, imgH: number) {
  if (!imgW || !imgH) return w;
  return (w * imgW) / (TARGET_ASPECT * imgH);
}

// Ancho máximo que cabe en la imagen manteniendo 16:9.
export function maxFrameW(imgW: number, imgH: number) {
  if (!imgW || !imgH) return 1;
  return Math.min(1, (imgH * TARGET_ASPECT) / imgW);
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

export type MotionPreset = "fixed" | "in" | "out" | "left" | "right" | "up" | "down";

// Rellena from/to a partir de un movimiento típico, respetando el tamaño de la imagen.
export function applyPreset(shot: Shot, preset: MotionPreset, imgW: number, imgH: number): Shot {
  const base = coverFrame(imgW, imgH);
  const zoomed = clampFrame({ ...base, w: base.w * 0.72 }, imgW, imgH);
  const mid = clampFrame({ ...base, w: base.w * 0.85 }, imgW, imgH);
  const shift = (f: Frame, dx: number, dy: number) =>
    clampFrame({ ...f, cx: f.cx + dx, cy: f.cy + dy }, imgW, imgH);
  const d = 0.12;

  switch (preset) {
    case "fixed": return { ...shot, from: base, to: base };
    case "in": return { ...shot, from: base, to: zoomed };
    case "out": return { ...shot, from: zoomed, to: base };
    case "left": return { ...shot, from: shift(mid, d, 0), to: shift(mid, -d, 0) };
    case "right": return { ...shot, from: shift(mid, -d, 0), to: shift(mid, d, 0) };
    case "up": return { ...shot, from: shift(mid, 0, d), to: shift(mid, 0, -d) };
    case "down": return { ...shot, from: shift(mid, 0, -d), to: shift(mid, 0, d) };
  }
}

// Zoom dirigido: la toma acaba centrada en un punto concreto de la imagen.
export function zoomToPoint(shot: Shot, px: number, py: number, imgW: number, imgH: number): Shot {
  const base = coverFrame(imgW, imgH);
  return {
    ...shot,
    from: base,
    to: clampFrame({ cx: px, cy: py, w: base.w * 0.5 }, imgW, imgH),
  };
}

// --------------------------------------------------------------------------
// Duraciones y recorrido del tiempo
// --------------------------------------------------------------------------

export function shotDur(s: Shot) {
  if (!s.autoDuration) return Math.max(0.3, s.durationSec);
  let end = 0;
  for (const d of s.dialogues) end = Math.max(end, d.startSec + (d.dur || 0));
  return Math.max(MIN_SHOT, end + (end > 0 ? TAIL : 0));
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

// Índice de la toma activa en un instante dado.
export function locate(flat: FlatShot[], t: number): number {
  if (!flat.length) return -1;
  for (let i = 0; i < flat.length; i++) {
    if (t < flat[i].start + flat[i].dur) return i;
  }
  return flat.length - 1;
}

// --------------------------------------------------------------------------
// Constructores
// --------------------------------------------------------------------------

export function newShot(imgW: number, imgH: number, preset: MotionPreset = "in"): Shot {
  const base: Shot = {
    id: nanoid(6),
    durationSec: 4,
    autoDuration: true,
    from: coverFrame(imgW, imgH),
    to: coverFrame(imgW, imgH),
    transition: "fade",
    transitionDur: DEFAULT_TRANS_DUR,
    dialogues: [],
    sfx: [],
    overlays: [],
  };
  return applyPreset(base, preset, imgW, imgH);
}

export function newScene(imageId: string, imgW: number, imgH: number): StoryScene {
  return { id: nanoid(6), imageId, imgW, imgH, shots: [newShot(imgW, imgH)] };
}

export function newDialogue(startSec = 0): Dialogue {
  return { id: nanoid(6), text: "", dur: 0, startSec };
}

export function emptyProject(): StoryProject {
  return { scenes: [], audioLayers: [], narrationVolume: 1 };
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
// Compatibilidad con proyectos guardados con el modelo anterior (slides planos)
// --------------------------------------------------------------------------

export function migrateProject(raw: any): StoryProject {
  if (!raw || typeof raw !== "object") return emptyProject();
  if (Array.isArray(raw.scenes)) return raw as StoryProject;
  if (!Array.isArray(raw.slides)) return emptyProject();

  const presetOf = (pan: string, zoom: string): MotionPreset => {
    if (pan && pan !== "none") return pan as MotionPreset;
    if (zoom === "in" || zoom === "out") return zoom;
    return "fixed";
  };
  const scenes: StoryScene[] = raw.slides.map((s: any) => {
    // No conocemos el tamaño original: 16:9 deja el encuadre completo.
    const imgW = 16, imgH = 9;
    const base = newShot(imgW, imgH, presetOf(s.pan, s.zoom));
    const shot: Shot = {
      ...base,
      transition: s.transition ?? "fade",
      dialogues: s.narration
        ? [{ id: nanoid(6), text: s.narration, audioId: s.audioId, dur: s.narrationDur ?? 0, startSec: 0 }]
        : [],
      overlays: (s.overlays ?? []).map((o: any) => ({ ...o, transition: "inherit" as OverlayTransition })),
    };
    return { id: s.id ?? nanoid(6), imageId: s.imageId, imgW, imgH, shots: [shot] };
  });
  return {
    scenes,
    audioLayers: raw.audioLayers ?? [],
    narrationVolume: typeof raw.narrationVolume === "number" ? raw.narrationVolume : 1,
  };
}
