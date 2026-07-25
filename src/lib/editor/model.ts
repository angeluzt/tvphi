// Modelo del editor de video (post-producción, 100% en el navegador).
// V1: una fuente de video (la grabación) con varios segmentos (cortes), overlays
// de imagen/texto con rango de tiempo, una pista de música y volumen del audio base.

import { nanoid } from "nanoid";

export interface Source {
  id: string;
  url: string; // object URL del blob
  duration: number; // segundos
}

// Un segmento [inSec, outSec] de la fuente; el orden en el array define la secuencia.
export interface Clip {
  id: string;
  inSec: number;
  outSec: number;
}

export type Overlay =
  | {
      id: string;
      kind: "image";
      src: string; // data URL
      startSec: number;
      endSec: number;
      x: number; y: number; w: number; h: number; // 0..1
    }
  | {
      id: string;
      kind: "text";
      text: string;
      color: string;
      fontSize: number; // px sobre lienzo 1280x720
      startSec: number;
      endSec: number;
      x: number; y: number; w: number; h: number;
    };

export interface MusicTrack {
  url: string;
  name: string;
  volume: number; // 0..1
  startSec: number;
}

export interface EditorProject {
  source: Source;
  clips: Clip[];
  overlays: Overlay[];
  music: MusicTrack | null;
  baseVolume: number; // volumen del audio de la grabación (cámara/mic) 0..1
}

export function clipDur(c: Clip) {
  return Math.max(0, c.outSec - c.inSec);
}
export function totalDuration(p: EditorProject) {
  return p.clips.reduce((a, c) => a + clipDur(c), 0);
}

// Mapea un tiempo global (de la línea de tiempo) a (índice de clip, tiempo en la fuente).
export function locate(p: EditorProject, tGlobal: number): { clipIndex: number; sourceTime: number; clipStart: number } | null {
  let acc = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const d = clipDur(p.clips[i]);
    if (tGlobal < acc + d || i === p.clips.length - 1) {
      const within = Math.max(0, Math.min(d, tGlobal - acc));
      return { clipIndex: i, sourceTime: p.clips[i].inSec + within, clipStart: acc };
    }
    acc += d;
  }
  return null;
}

// Inicio (global) de cada clip.
export function clipStarts(p: EditorProject): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const c of p.clips) {
    out.push(acc);
    acc += clipDur(c);
  }
  return out;
}

export function newProject(source: Source): EditorProject {
  return {
    source,
    clips: [{ id: nanoid(6), inSec: 0, outSec: source.duration }],
    overlays: [],
    music: null,
    baseVolume: 1,
  };
}

// Divide el clip que contiene tGlobal en dos, en ese punto.
export function splitAt(p: EditorProject, tGlobal: number): EditorProject {
  const loc = locate(p, tGlobal);
  if (!loc) return p;
  const c = p.clips[loc.clipIndex];
  const cut = loc.sourceTime;
  if (cut <= c.inSec + 0.05 || cut >= c.outSec - 0.05) return p; // muy al borde
  const left: Clip = { id: nanoid(6), inSec: c.inSec, outSec: cut };
  const right: Clip = { id: nanoid(6), inSec: cut, outSec: c.outSec };
  const clips = [...p.clips];
  clips.splice(loc.clipIndex, 1, left, right);
  return { ...p, clips };
}

export function removeClip(p: EditorProject, id: string): EditorProject {
  if (p.clips.length <= 1) return p;
  return { ...p, clips: p.clips.filter((c) => c.id !== id) };
}
export function moveClip(p: EditorProject, id: string, dir: -1 | 1): EditorProject {
  const i = p.clips.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.clips.length) return p;
  const clips = [...p.clips];
  [clips[i], clips[j]] = [clips[j], clips[i]];
  return { ...p, clips };
}

export function createTextOverlay(startSec: number, endSec: number): Overlay {
  return { id: nanoid(6), kind: "text", text: "Texto", color: "#ffffff", fontSize: 56, startSec, endSec, x: 0.1, y: 0.1, w: 0.8, h: 0.2 };
}
export function createImageOverlay(src: string, startSec: number, endSec: number): Overlay {
  return { id: nanoid(6), kind: "image", src, startSec, endSec, x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
}
