"use client";

import { useEffect, useState } from "react";
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
  /**
   * Una URL por fotograma, EN EL MISMO ORDEN que `loop.imageIds`. `null` es un
   * cuadro que no está en este navegador: su hueco se conserva porque el índice
   * de la miniatura es lo que viaja al regenerar.
   */
  urls: (string | null)[];
  onFps: (fps: number) => void;
  onRegenerar?: (indice: number) => void;
  regenerando?: number | null;
}) {
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(true);

  useEffect(() => {
    if (!play || urls.length < 2) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % urls.length);
    }, Math.max(33, Math.round(1000 / loop.fps)));
    return () => window.clearInterval(id);
  }, [play, urls.length, loop.fps]);

  // Si el loop se acorta —se regenera con menos cuadros— el índice de antes
  // puede caer fuera. Se recoloca en vez de dejar el visor en blanco.
  useEffect(() => { setI((n) => (n < urls.length ? n : 0)); }, [urls.length]);

  if (!urls.length) return null;
  const actual = urls[Math.min(i, urls.length - 1)];

  return (
    <div className="mt-2 rounded-lg border border-border p-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium">Mesa de luz</span>
          <span className="text-[10px] text-muted">
            {urls.length} fotos enteras · {loop.fps} fps
          </span>
      </div>
      <div className="mt-1.5 grid min-h-[3rem] place-items-center overflow-hidden rounded-md border border-border bg-black">
        {actual
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={actual} alt="" className="mx-auto max-h-48 w-auto" />
          : <span className="p-4 text-[10px] text-muted">Este fotograma no está en este navegador.</span>}
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
            {u
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={u} alt="" className="h-12 w-16 object-cover" />
              : <span className="grid h-12 w-16 place-items-center bg-surface-2 text-[9px] text-muted">falta</span>}
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
