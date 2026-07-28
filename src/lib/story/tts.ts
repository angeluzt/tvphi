"use client";

// Voz (TTS) on-device con transformers.js. Gratis, sin servidor ni API key, y el
// audio resultante (WAV) se puede incrustar en el video exportado. Suena algo
// robótico (temporal); para voces más realistas se puede añadir un provider de
// nube (OpenAI/ElevenLabs) vía /api/tts sin cambiar el resto.
//
// El cálculo ocurre en un Web Worker (ver tts-worker.ts) para que la página siga
// respondiendo mientras se genera: se pueden encolar varias voces y seguir
// editando. Los encargos se atienden de uno en uno dentro del worker.

export interface Voice {
  id: string;
  label: string;
  model: string;
}

// MMS-TTS de Meta: un modelo por idioma (buena cobertura, gratis).
export const VOICES: Voice[] = [
  { id: "es", label: "Español", model: "Xenova/mms-tts-spa" },
  { id: "en", label: "English", model: "Xenova/mms-tts-eng" },
  { id: "pt", label: "Português", model: "Xenova/mms-tts-por" },
  { id: "fr", label: "Français", model: "Xenova/mms-tts-fra" },
];

// Estado de un encargo de voz, para poder mostrarlo en la interfaz.
export type VoiceStage = "queued" | "loading" | "generating";
export interface VoiceStatus {
  stage: VoiceStage;
  pct: number; // progreso de la descarga del modelo (0..100)
}

interface Pending {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
  onStatus?: (s: VoiceStatus) => void;
}

let worker: Worker | null = null;
const pending = new Map<string, Pending>();
let seq = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./tts-worker.ts", import.meta.url));
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<any>) => {
    const msg = e.data;
    const job = pending.get(msg?.id);
    if (!job) return;
    if (msg.type === "queued") job.onStatus?.({ stage: "queued", pct: 0 });
    else if (msg.type === "loading") job.onStatus?.({ stage: "loading", pct: msg.pct ?? 0 });
    else if (msg.type === "generating") job.onStatus?.({ stage: "generating", pct: 100 });
    else if (msg.type === "done") {
      pending.delete(msg.id);
      job.resolve(msg.blob as Blob);
    } else if (msg.type === "error") {
      pending.delete(msg.id);
      job.reject(new Error(friendlyError(msg.message)));
    }
  };
  worker.onerror = () => {
    // Si el worker muere, se rechaza todo lo pendiente y se reintentará con uno nuevo.
    for (const [, job] of pending) job.reject(new Error("el generador de voz se detuvo. Inténtalo de nuevo."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function friendlyError(message: string) {
  if (/fetch|network|Failed to load|ENOTFOUND|tunnel/i.test(message)) {
    return "no se pudo descargar el modelo de voz. Revisa tu conexión (se descarga desde huggingface.co) e inténtalo de nuevo.";
  }
  return message;
}

// Encarga la narración de un texto. Devuelve una promesa con el WAV; mientras
// tanto la página sigue usable y se pueden encolar más encargos.
export function synthesize(
  text: string,
  voiceId: string,
  onStatus?: (s: VoiceStatus) => void,
): Promise<Blob> {
  const v = VOICES.find((x) => x.id === voiceId) ?? VOICES[0];
  const w = getWorker();
  if (!w) return Promise.reject(new Error("este navegador no admite la generación de voz."));
  const id = `v${++seq}`;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus });
    onStatus?.({ stage: "queued", pct: 0 });
    w.postMessage({ id, text, model: v.model });
  });
}

// Cuántos encargos de voz siguen en marcha.
export function pendingVoices() {
  return pending.size;
}

// Duración (s) de un blob de audio, decodificándolo.
export async function audioDuration(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } finally {
    ctx.close().catch(() => {});
  }
}
