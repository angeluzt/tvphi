// Conversión de formatos con ffmpeg.wasm (se carga bajo demanda ~30MB).
// Usa el core single-thread (sin SharedArrayBuffer), por lo que no requiere
// cabeceras COOP/COEP.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;
  loading = (async () => {
    const f = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await f.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    instance = f;
    return f;
  })();
  return loading;
}

export type ConvertTarget = "mp4" | "gif" | "mp3";

export async function convert(
  blob: Blob,
  target: ConvertTarget,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const f = await getFfmpeg();
  const onProg = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  f.on("progress", onProg);
  try {
    const inName = "in.webm";
    await f.writeFile(inName, await fetchFile(blob));
    const out = `out.${target}`;
    let args: string[];
    if (target === "gif") {
      args = ["-i", inName, "-vf", "fps=12,scale=640:-1:flags=lanczos", out];
    } else if (target === "mp3") {
      args = ["-i", inName, "-vn", "-q:a", "4", out];
    } else {
      args = ["-i", inName, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", out];
    }
    await f.exec(args);
    const data = (await f.readFile(out)) as Uint8Array;
    const mime = target === "gif" ? "image/gif" : target === "mp3" ? "audio/mpeg" : "video/mp4";
    // Copia a un Uint8Array respaldado por ArrayBuffer (evita el tipo SharedArrayBuffer).
    return new Blob([new Uint8Array(data)], { type: mime });
  } finally {
    f.off("progress", onProg);
  }
}
