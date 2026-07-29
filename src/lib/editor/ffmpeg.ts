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
    // Se sirve desde el propio sitio (scripts/copy-ffmpeg.mjs lo deja en
    // /public). Si por lo que sea no estuviera, se recurre al CDN.
    const fuentes = ["/ffmpeg", "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd"];
    let ultimo: unknown = null;
    for (const base of fuentes) {
      try {
        await f.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });
        instance = f;
        return f;
      } catch (e) { ultimo = e; }
    }
    loading = null; // que se pueda reintentar
    throw ultimo instanceof Error ? ultimo : new Error("no se pudo cargar el conversor de video");
  })();
  return loading;
}

export type ConvertTarget = "mp4" | "gif" | "mp3";

// Lo que sale del grabador del navegador no lleva escrita su duración (el móvil
// marca 0:00 y no se puede avanzar), y el MP4 sale "fragmentado", que es lo que
// rechazan sitios como YouTube. Aquí se vuelve a empaquetar SIN recodificar
// (-c copy): es rápido, no pierde calidad, y deja un archivo normal y corriente
// con su duración, su índice y la cabecera al principio.
export async function remux(
  blob: Blob,
  target: "webm" | "mp4",
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const f = await getFfmpeg();
  const onProg = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  f.on("progress", onProg);
  const inName = blob.type.includes("mp4") ? "rec.mp4" : "rec.webm";
  const out = `fix.${target}`;
  try {
    await f.writeFile(inName, await fetchFile(blob));
    const args = ["-fflags", "+genpts", "-i", inName, "-c", "copy"];
    if (target === "mp4") args.push("-movflags", "+faststart");
    args.push(out);
    await f.exec(args);
    const data = (await f.readFile(out)) as Uint8Array;
    if (!data?.length) throw new Error("empaquetado vacío");
    return new Blob([new Uint8Array(data)], { type: target === "mp4" ? "video/mp4" : "video/webm" });
  } finally {
    f.off("progress", onProg);
    await f.deleteFile(inName).catch(() => {});
    await f.deleteFile(out).catch(() => {});
  }
}

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
      // faststart: la cabecera va al principio, como esperan los reproductores
      // y las webs de video.
      args = ["-i", inName, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
              "-c:a", "aac", "-movflags", "+faststart", out];
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
