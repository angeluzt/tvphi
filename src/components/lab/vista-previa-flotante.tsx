"use client";

import { createPortal } from "react-dom";
import { useEffect, type RefObject } from "react";
import { X, Play, Pause, RotateCcw, SkipBack, SkipForward } from "lucide-react";

// La escena a pantalla completa.
//
// NO ES UNA COPIA DEL LIENZO PEQUEÑO. Antes lo era: cada fotograma se hacía un
// drawImage del lienzo incrustado a este. Y como el incrustado se dimensiona
// con el ancho de su caja —en un móvil, 320 px— lo que se veía aquí era ese
// cuadro de 320 px estirado a pantalla completa. Borroso, y sin un solo detalle
// más del que ya se veía sin abrirlo: exactamente la queja de que «el play no
// muestra la escena bien».
//
// Ahora este componente solo APORTA EL LIENZO, y el bucle de dibujo del
// compositor pinta aquí directamente mientras esté abierto —a la resolución que
// dé la pantalla—. Solo hay un lienzo delante en cada momento, así que no se
// pinta dos veces.

export function VistaPreviaFlotante({
  abierto,
  canvasRef,
  cajaRef,
  reproduciendo,
  progreso,
  titulo,
  onCerrar,
  onPlayPause,
  onReset,
  onSeek,
  onPaso,
}: {
  abierto: boolean;
  /** Lo rellena el compositor: es su superficie de dibujo mientras esté abierto. */
  canvasRef: RefObject<HTMLCanvasElement>;
  cajaRef: RefObject<HTMLDivElement>;
  reproduciendo: boolean;
  progreso: number;
  titulo?: string;
  onCerrar: () => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (frac: number) => void;
  onPaso: (delta: -1 | 1) => void;
}) {
  useEffect(() => {
    if (!abierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [abierto]);

  // Escape cierra. En una vista que tapa la pantalla entera, tener que buscar
  // la X es una pequeña trampa.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === " " || e.key === "k") { e.preventDefault(); onPlayPause(); }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto, onCerrar, onPlayPause]);

  if (!abierto || typeof document === "undefined") return null;

  // OPACO del todo. Con el 92% de antes se transparentaba la cabecera del
  // sitio justo detrás de esta barra: se veían dos títulos y dos botones
  // superpuestos, y parecía que el cerrar estuviera «arriba de la página».
  // El `safe-area-inset-top` lo baja del notch, que era el otro sitio donde
  // quedaba fuera del alcance.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#05070d]" role="dialog" aria-modal aria-label="Vista previa de la animación">
      <div
        className="flex items-center gap-2 border-b border-white/10 px-3 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {titulo ?? "Vista previa"}
        </p>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-white hover:bg-white/20"
          onClick={onCerrar}
          aria-label="Cerrar la vista previa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={cajaRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
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
