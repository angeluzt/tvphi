"use client";

import {
  ChevronDown, ChevronUp, Maximize2, Pause, Play, RotateCcw, SkipBack, SkipForward,
} from "lucide-react";

/**
 * Controles de reproducción: play, saltar, repetir y abrir la vista grande.
 *
 * VA EN EL FLUJO DE LA PÁGINA, no pegado abajo. Antes iba `sticky bottom-2`
 * para tenerlo siempre a mano, y en un móvil eso significaba una barra clavada
 * sobre el contenido: al desplazar tapaba justo lo que se estaba leyendo y
 * comía un trozo de una pantalla que ya venía justa. Ahora sube y baja con la
 * página, y quien no lo esté usando puede plegarlo.
 *
 * `encima` es para la línea de tiempo, que se pliega con el resto: son la misma
 * herramienta —dónde está la escena y cómo moverla— y plegar solo la mitad
 * dejaba un hueco raro entre el lienzo y los mandos.
 */
export function BarraTransporte({
  encima,
  debajo,
  reproduciendo,
  progreso,
  onPlayPause,
  onReset,
  onSeek,
  onPaso,
  onAbrirPreview,
  disabled,
  plegado,
  onPlegar,
}: {
  encima?: React.ReactNode;
  /**
   * Lo que sale JUSTO debajo de la línea de tiempo: los ajustes de la barra que
   * se acaba de pulsar. Va aquí y no al final de la página porque si no, para
   * tocar lo que has seleccionado hay que perder de vista dónde lo pulsaste.
   */
  debajo?: React.ReactNode;
  reproduciendo: boolean;
  progreso: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (frac: number) => void;
  onPaso: (delta: -1 | 1) => void;
  onAbrirPreview: () => void;
  disabled?: boolean;
  plegado?: boolean;
  onPlegar?: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-surface/95 p-2 shadow-lg shadow-black/30">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-accent">Reproducción</span>
        {plegado && (
          <button
            type="button"
            disabled={disabled}
            onClick={onPlayPause}
            className="btn-ghost px-1.5 py-1 text-[10px] disabled:opacity-40"
            title={reproduciendo ? "Pausar" : "Reproducir animación"}
          >
            {reproduciendo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {reproduciendo ? "Pausar" : "Play"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onPlegar?.(!plegado)}
          aria-expanded={!plegado}
          className="ml-auto rounded border border-border px-1.5 py-1 text-[10px] text-muted hover:text-fg"
          title={plegado ? "Mostrar los controles" : "Plegar los controles"}
        >
          {plegado ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span className="ml-1">{plegado ? "Mostrar" : "Plegar"}</span>
        </button>
      </div>

      {!plegado && (
        <>
          {encima}
          {debajo}
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
        </>
      )}
    </div>
  );
}
