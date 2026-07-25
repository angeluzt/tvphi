"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trimVideo } from "@/lib/studio/trim";
import { Recorder } from "@/lib/studio/recorder";
import { Download, RotateCcw, X } from "lucide-react";

function fmt(s: number) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
function downloadBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}

export function ExportPanel({
  blob,
  durationSec,
  onClose,
  onRetake,
}: {
  blob: Blob;
  durationSec: number;
  onClose: () => void;
  onRetake: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  const mp4Mime = useMemo(() => Recorder.pickMp4(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(durationSec || 0);
  const [inSec, setInSec] = useState(0);
  const [outSec, setOutSec] = useState(durationSec || 0);
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  function onMeta() {
    const d = videoRef.current?.duration;
    if (d && isFinite(d) && d > 0) {
      setDur(d);
      setOutSec((o) => (o > 0 && isFinite(o) ? Math.min(o, d) : d));
    }
  }

  const canTrim = dur > 0 && (inSec > 0.1 || outSec < dur - 0.1);
  const ext = format === "mp4" ? "mp4" : "webm";

  async function download() {
    const ts = Date.now();
    // WebM sin recorte: descarga directa (instantánea).
    if (format === "webm" && !canTrim) {
      downloadBlob(blob, `tvphi-${ts}.webm`);
      return;
    }
    // Recorte y/o conversión de formato: re-graba el rango con el mime elegido.
    setBusy(true);
    setProgress(0);
    try {
      const mime = format === "mp4" ? mp4Mime : Recorder.pickMime();
      const start = canTrim ? inSec : 0;
      const end = canTrim ? outSec : dur || durationSec;
      const out = await trimVideo(blob, start, end, { mimeType: mime, onProgress: setProgress });
      downloadBlob(out, `tvphi-${ts}.${ext}`);
    } catch (e: any) {
      alert("No se pudo exportar: " + (e?.message ?? ""));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Tu grabación</h3>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <video ref={videoRef} src={url} controls playsInline onLoadedMetadata={onMeta} className="aspect-video w-full rounded-xl bg-black" />

        {dur > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Recorte: {fmt(inSec)} → {fmt(outSec)}</span>
              <span>Duración: {fmt(dur)}</span>
            </div>
            <label className="block">
              <span className="text-xs text-muted">Inicio</span>
              <input type="range" min={0} max={dur} step={0.1} value={inSec}
                onChange={(e) => setInSec(Math.min(Number(e.target.value), outSec - 0.2))} className="w-full" />
            </label>
            <label className="block">
              <span className="text-xs text-muted">Fin</span>
              <input type="range" min={0} max={dur} step={0.1} value={outSec}
                onChange={(e) => setOutSec(Math.max(Number(e.target.value), inSec + 0.2))} className="w-full" />
            </label>
          </div>
        )}

        {busy && (
          <p className="mt-2 text-sm text-accent">
            Exportando… {Math.round(progress * 100)}% (se reproduce el audio durante el proceso)
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button className="btn-ghost mr-auto" onClick={onRetake} disabled={busy}>
            <RotateCcw className="h-4 w-4" /> Grabar de nuevo
          </button>
          <div>
            <label className="label">Formato</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as "webm" | "mp4")} disabled={busy} className="input mt-1 max-w-[10rem]">
              <option value="webm">WebM (recomendado)</option>
              {mp4Mime && <option value="mp4">MP4 (H.264)</option>}
            </select>
          </div>
          <button className="btn-brand self-end" onClick={download} disabled={busy}>
            <Download className="h-4 w-4" /> Descargar {ext.toUpperCase()}
          </button>
        </div>
        {!mp4Mime && (
          <p className="mt-2 text-right text-[11px] text-muted">
            Tu navegador no graba MP4 nativo; WebM funciona en YouTube. (MP4 universal llegará con conversión.)
          </p>
        )}
      </div>
    </div>
  );
}
