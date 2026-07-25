import { Recorder } from "./recorder";

// Recorta un blob de video a [inSec, outSec] re-grabando el rango.
// 100% en el navegador, sin librerías pesadas. Es una pasada en tiempo real
// (el audio se reproduce mientras dura el recorte).
export function trimVideo(
  blob: Blob,
  inSec: number,
  outSec: number,
  opts?: { onProgress?: (p: number) => void; videoBitsPerSecond?: number },
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);

    video.onerror = () => {
      cleanup();
      reject(new Error("No se pudo leer el video"));
    };

    video.onloadedmetadata = async () => {
      try {
        const end = Math.min(outSec, video.duration || outSec);
        const start = Math.max(0, Math.min(inSec, end - 0.05));

        const stream: MediaStream = (video as any).captureStream
          ? (video as any).captureStream()
          : (video as any).mozCaptureStream();

        const mime = Recorder.pickMime();
        const chunks: Blob[] = [];
        const mr = new MediaRecorder(stream, {
          mimeType: mime || undefined,
          videoBitsPerSecond: opts?.videoBitsPerSecond ?? 10_000_000,
        });
        mr.ondataavailable = (e) => {
          if (e.data?.size) chunks.push(e.data);
        };
        mr.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mime || "video/webm" }));
        };

        await seek(video, start);
        mr.start(1000);
        await video.play();

        const tick = () => {
          if (video.currentTime >= end || video.ended) {
            video.pause();
            if (mr.state !== "inactive") mr.stop();
            return;
          }
          opts?.onProgress?.(Math.min(1, (video.currentTime - start) / Math.max(0.001, end - start)));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      res();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
  });
}
