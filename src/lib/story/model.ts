// Modelo de "Historias narradas": video de imágenes con voz, movimiento (Ken Burns),
// transiciones, stickers PNG y capas de audio (narración + música + SFX).

import { nanoid } from "nanoid";

export type PanDir = "none" | "up" | "down" | "left" | "right";
export type ZoomKind = "none" | "in" | "out";
export type TransitionKind = "cut" | "fade" | "slide";

export interface PngOverlay {
  id: string;
  imageId: string; // clave en el store de imágenes (IndexedDB)
  x: number; y: number; w: number; h: number; // 0..1
}

export interface StorySlide {
  id: string;
  imageId: string; // clave en el store de imágenes
  narration: string; // texto oculto que se narra
  audioId?: string; // clave del audio de narración generado (IndexedDB)
  narrationDur: number; // duración del audio de narración (s), 0 si no generado
  pan: PanDir;
  zoom: ZoomKind;
  transition: TransitionKind;
  overlays: PngOverlay[];
}

export interface AudioLayer {
  id: string;
  kind: "music" | "sfx";
  audioId: string; // clave en el store de audios (IndexedDB)
  name: string;
  volume: number; // 0..1
  startSec: number; // inicio global
  loop: boolean;
}

export interface StoryProject {
  slides: StorySlide[];
  audioLayers: AudioLayer[];
  narrationVolume: number; // 0..1
}

// Duración mínima por slide si no hay narración (para que se vea el movimiento).
export const MIN_SLIDE = 2.5;
const TRANSITION_SEC = 0.6;

export function slideDur(s: StorySlide) {
  return Math.max(MIN_SLIDE, s.narrationDur || 0) + 0.3;
}
export function totalDuration(p: StoryProject) {
  return p.slides.reduce((a, s) => a + slideDur(s), 0);
}
export function slideStarts(p: StoryProject): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const s of p.slides) {
    out.push(acc);
    acc += slideDur(s);
  }
  return out;
}
// Tiempo global -> índice de slide + progreso (0..1) dentro del slide.
export function locate(p: StoryProject, t: number): { index: number; progress: number; start: number } | null {
  let acc = 0;
  for (let i = 0; i < p.slides.length; i++) {
    const d = slideDur(p.slides[i]);
    if (t < acc + d || i === p.slides.length - 1) {
      return { index: i, progress: d ? Math.max(0, Math.min(1, (t - acc) / d)) : 0, start: acc };
    }
    acc += d;
  }
  return null;
}

export const TRANSITION_DUR = TRANSITION_SEC;

export function newSlide(imageId: string): StorySlide {
  return {
    id: nanoid(6),
    imageId,
    narration: "",
    narrationDur: 0,
    pan: "none",
    zoom: "in",
    transition: "fade",
    overlays: [],
  };
}
export function emptyProject(): StoryProject {
  return { slides: [], audioLayers: [], narrationVolume: 1 };
}

export function moveSlide(p: StoryProject, id: string, dir: -1 | 1): StoryProject {
  const i = p.slides.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.slides.length) return p;
  const slides = [...p.slides];
  [slides[i], slides[j]] = [slides[j], slides[i]];
  return { ...p, slides };
}
