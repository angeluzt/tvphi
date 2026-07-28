"use client";

// Voz (TTS) on-device con transformers.js. Gratis, sin servidor ni API key, y el
// audio resultante (WAV) se puede incrustar en el video exportado. Suena algo
// robótico (temporal); para voces más realistas se puede añadir un provider de
// nube (OpenAI/ElevenLabs) vía /api/tts sin cambiar el resto.

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

const pipes: Record<string, Promise<any>> = {};

function getPipe(model: string, onProgress?: (pct: number) => void): Promise<any> {
  if (!pipes[model]) {
    pipes[model] = (async () => {
      const mod: any = await import("@xenova/transformers");
      mod.env.allowLocalModels = false;
      return mod.pipeline("text-to-speech", model, {
        progress_callback: (p: any) => {
          if (p?.status === "progress" && typeof p.progress === "number") onProgress?.(p.progress);
        },
      });
    })();
  }
  return pipes[model];
}

// Genera la narración de un texto y la devuelve como WAV (Blob).
export async function synthesize(
  text: string,
  voiceId: string,
  onStatus?: (s: string) => void,
): Promise<Blob> {
  const v = VOICES.find((x) => x.id === voiceId) ?? VOICES[0];
  onStatus?.("Cargando voz (la 1ª vez descarga el modelo)…");
  let pipe: any;
  try {
    pipe = await getPipe(v.model, (pct) => onStatus?.(`Descargando la voz… ${Math.round(pct)}%`));
  } catch (e: any) {
    // Si falla la descarga (sin conexión o red que bloquea huggingface.co), se
    // reintenta la próxima vez en vez de dejar la promesa fallida en caché.
    delete pipes[v.model];
    throw new Error(
      "no se pudo descargar el modelo de voz. Revisa tu conexión (se descarga desde huggingface.co) e inténtalo de nuevo.",
    );
  }
  onStatus?.("Generando voz…");
  const out = await pipe(text.trim() || " ");
  return encodeWav(out.audio as Float32Array, out.sampling_rate as number);
}

// Codifica PCM float32 mono a WAV de 16 bits.
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
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
