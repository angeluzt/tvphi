"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, type RefObject } from "react";
import { X, Play, Pause, RotateCcw, SkipBack, SkipForward } from "lucide-react";

/** Overlay a pantalla completa que copia el canvas del montaje (útil en móvil). */
export function VistaPreviaFlotante({
  abierto,
  canvasOrigen,
  reproduciendo,
  progreso,
  onCerrar,
  onPlayPause,
  onReset,
  onSeek,
  onPaso,
}: {
  abierto: boolean;
  canvasOrigen: RefObject<HTMLCanvasElement | null>;
  reproduciendo: boolean;
  progreso: number;
  onCerrar: () => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (frac: number) => void;
  onPaso: (delta: -1 | 1) => void;
}) {
  const dest = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let id = 0;
    const tick = () => {
      const src = canvasOrigen.current;
      const d = dest.current;
      if (src && d && src.width && src.height) {
        if (d.width !== src.width || d.height !== src.height) {
          d.width = src.width;
          d.height = src.height;
        }
        const c = d.getContext("2d");
        if (c) {
          c.clearRect(0, 0, d.width, d.height);
          c.drawImage(src, 0, 0);
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [abierto, canvasOrigen]);

  useEffect(() => {
    if (!abierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [abierto]);

  if (!abierto || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/92" role="dialog" aria-modal aria-label="Vista previa de la animación">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">Vista previa</p>
        <button type="button" className="rounded-lg border border-white/20 p-2 text-white" onClick={onCerrar} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas ref={dest} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="space-y-2 border-t border-white/10 bg-black/80 px-3 py-3">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(Math.max(0, Math.min(1, progreso)) * 1000)}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="w-full accent-brand"
          aria-label="Posición en la animación"
        />
        <div className="flex items-center justify-center gap-2">
          <button type="button" className="rounded-lg border border-white/20 p-2.5 text-white" onClick={() => onPaso(-1)} aria-label="Paso anterior">
            <SkipBack className="h-5 w-5" />
          </button>
          <button type="button" className="rounded-lg bg-brand px-4 py-2.5 text-white" onClick={onPlayPause} aria-label={reproduciendo ? "Pausar" : "Reproducir"}>
            {reproduciendo ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button type="button" className="rounded-lg border border-white/20 p-2.5 text-white" onClick={() => onPaso(1)} aria-label="Paso siguiente">
            <SkipForward className="h-5 w-5" />
          </button>
          <button type="button" className="rounded-lg border border-white/20 p-2.5 text-white" onClick={onReset} aria-label="Reiniciar">
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
