"use client";

import { Play, Pause, RotateCcw, Maximize2, SkipBack, SkipForward } from "lucide-react";

/**
 * Controles siempre visibles: reproducir, saltar y abrir vista previa grande.
 *
 * `encima` es para la línea de tiempo. Va DENTRO de este bloque y no encima en
 * el flujo normal porque el lienzo se queda pegado arriba con z-20: cualquier
 * cosa que se ponga justo debajo acaba tapada en cuanto se desplaza la página.
 * Metiéndola aquí comparten el único sitio que siempre se ve.
 */
export function BarraTransporte({
  encima,
  reproduciendo,
  progreso,
  onPlayPause,
  onReset,
  onSeek,
  onPaso,
  onAbrirPreview,
  disabled,
}: {
  encima?: React.ReactNode;
  reproduciendo: boolean;
  progreso: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (frac: number) => void;
  onPaso: (delta: -1 | 1) => void;
  onAbrirPreview: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="sticky bottom-2 z-40 space-y-2 rounded-xl border border-accent/40 bg-surface/95 p-2 shadow-lg shadow-black/30 backdrop-blur">
      {encima}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onPlayPause}
          className="btn-brand disabled:opacity-40"
          title={reproduciendo ? "Pausar" : "Reproducir animación"}
        >
          {reproduciendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span className="hidden sm:inline">{reproduciendo ? "Pausar" : "Play"}</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => onPaso(-1)} className="btn-ghost p-2 disabled:opacity-40" title="Paso anterior">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" disabled={disabled} onClick={() => onPaso(1)} className="btn-ghost p-2 disabled:opacity-40" title="Paso siguiente">
          <SkipForward className="h-4 w-4" />
        </button>
        <button type="button" disabled={disabled} onClick={onReset} className="btn-ghost p-2 disabled:opacity-40" title="Reiniciar">
          <RotateCcw className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          disabled={disabled}
          value={Math.round(Math.max(0, Math.min(1, progreso)) * 1000)}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="min-w-[8rem] flex-1 accent-brand disabled:opacity-40"
          aria-label="Posición"
        />
        <button type="button" disabled={disabled} onClick={onAbrirPreview} className="btn-ghost text-xs disabled:opacity-40" title="Vista previa grande">
          <Maximize2 className="h-4 w-4" /> <span className="hidden sm:inline">Vista</span>
        </button>
      </div>
    </div>
  );
}
