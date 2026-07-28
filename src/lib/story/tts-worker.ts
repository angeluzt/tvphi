/// <reference lib="webworker" />

// Worker de voz: aquí corre la inferencia de transformers.js. Se hace fuera del
// hilo principal porque el cálculo dura segundos y, si se hiciera en la página,
// el navegador no podría repintar ni atender clics (parecería colgada).
//
// Los encargos se procesan de uno en uno: el modelo es único y encadenarlos
// evita cargarlo dos veces a la vez.

import { pipeline, env } from "@xenova/transformers";

const ctx = self as unknown as Worker;

env.allowLocalModels = false;

type Req = { id: string; text: string; model: string };

const pipes: Record<string, any> = {};
const queue: Req[] = [];
let working = false;

ctx.onmessage = (e: MessageEvent<Req>) => {
  queue.push(e.data);
  ctx.postMessage({ id: e.data.id, type: "queued", pending: queue.length });
  void drain();
};

async function drain() {
  if (working) return;
  working = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      if (!pipes[job.model]) {
        ctx.postMessage({ id: job.id, type: "loading", pct: 0 });
        pipes[job.model] = await pipeline("text-to-speech", job.model, {
          progress_callback: (p: any) => {
            if (p?.status === "progress" && typeof p.progress === "number") {
              ctx.postMessage({ id: job.id, type: "loading", pct: p.progress });
            }
          },
        });
      }
      ctx.postMessage({ id: job.id, type: "generating" });
      const out: any = await pipes[job.model](job.text.trim() || " ");
      const blob = encodeWav(out.audio as Float32Array, out.sampling_rate as number);
      ctx.postMessage({ id: job.id, type: "done", blob });
    } catch (err: any) {
      // Si falló la carga del modelo no se deja en caché, para poder reintentar.
      delete pipes[job.model];
      ctx.postMessage({ id: job.id, type: "error", message: String(err?.message ?? err) });
    }
  }
  working = false;
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
