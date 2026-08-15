"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, Repeat } from "lucide-react";
import type { LoopImagen } from "@/lib/story/medio";

/**
 * Visor de fotogramas de una escena o lámina, al estilo mesa de luz.
 * Play, fps, tira, regenerar un cuadro. El motor ya pinta el loop en el vídeo.
 */
export function MesaLuz({
  loop,
  urls,
  onFps,
  onRegenerar,
  regenerando,
}: {
  loop: LoopImagen;
  /** Object URLs, mismo orden que loop.imageIds. */
  urls: string[];
  onFps: (fps: number) => void;
  onRegenerar?: (indice: number) => void;
  regenerando?: number | null;
}) {
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(true);
  const iRef = useRef(0);
  iRef.current = i;

  useEffect(() => {
    if (!play || urls.length < 2) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % urls.length);
    }, Math.max(33, Math.round(1000 / loop.fps)));
    return () => window.clearInterval(id);
  }, [play, urls.length, loop.fps]);

  if (!urls.length) return null;

  return (
    <div className="mt-2 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium">Mesa de luz</span>
        <span className="text-[10px] text-muted">
          {urls.length} fotogramas · {loop.fps} fps
        </span>
      </div>
      <div className="mt-1.5 overflow-hidden rounded-md border border-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[Math.min(i, urls.length - 1)]} alt="" className="mx-auto max-h-48 w-auto" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setPlay((v) => !v)}>
          {play ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {play ? "Pausar" : "Play"}
        </button>
        <Repeat className="h-3 w-3 text-muted" />
        <label className="flex items-center gap-1 text-[10px] text-muted">
          fps
          <input
            type="range" min={1} max={16} step={1} value={loop.fps}
            onChange={(e) => onFps(Number(e.target.value))}
          />
          <span className="tabular-nums">{loop.fps}</span>
        </label>
      </div>
      <div className="mt-1.5 flex gap-1 overflow-x-auto">
        {urls.map((u, n) => (
          <button
            key={loop.imageIds[n] ?? n}
            type="button"
            onClick={() => { setPlay(false); setI(n); }}
            className={`relative shrink-0 overflow-hidden rounded border ${n === i ? "border-accent" : "border-border"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-12 w-16 object-cover" />
            {onRegenerar && (
              <span
                role="button"
                tabIndex={0}
                className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white"
                title="Regenerar este fotograma"
                onClick={(e) => { e.stopPropagation(); onRegenerar(n); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRegenerar(n); } }}
              >
                {regenerando === n
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
