"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// La pantalla mientras se genera el vídeo.
//
// Tapa todo a propósito. El vídeo se graba MIENTRAS se reproduce —no hay otra
// forma en un navegador—, así que cualquier cosa que el usuario toque durante
// esos minutos sale grabada. Tapando la pantalla no hay nada que tocar, y de
// paso queda claro que hay que esperar.
//
// Sobre irse a otra pestaña: es verdad que rompe el vídeo. El lienzo se pinta
// con requestAnimationFrame, y el navegador lo frena o lo para en las pestañas
// que no se ven; el audio, en cambio, sigue corriendo por su cuenta. Resultado:
// la imagen se congela y el sonido continúa. Por eso se avisa, y por eso si
// pasa se dice al acabar en vez de entregar un archivo roto sin más.

export function PantallaRender({
  canvas,
  progreso,
  etapa,
  segundos,
  onCancelar,
}: {
  /** El lienzo del motor, que se mueve aquí mientras dura la grabación. */
  canvas: HTMLCanvasElement | null;
  progreso: number;      // 0..1
  etapa: string | null;  // "Cerrando el archivo…", "Convirtiendo a MP4…"
  segundos: number;      // lo que dura el vídeo
  onCancelar: () => void;
}) {
  const hueco = useRef<HTMLDivElement | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [seFue, setSeFue] = useState(false);

  // El lienzo del motor se trae aquí; al cerrar, quien lo puso lo recoloca.
  useEffect(() => {
    if (!canvas || !hueco.current) return;
    canvas.className = "h-full w-full object-contain";
    hueco.current.appendChild(canvas);
  }, [canvas]);

  // Si la pestaña se va al fondo, el vídeo se congela. Se apunta para poder
  // decirlo, porque el archivo saldrá con la imagen parada.
  useEffect(() => {
    const ver = () => { if (document.hidden) setSeFue(true); };
    document.addEventListener("visibilitychange", ver);
    return () => document.removeEventListener("visibilitychange", ver);
  }, []);

  const pct = Math.round(Math.max(0, Math.min(1, progreso)) * 100);
  const quedan = Math.max(0, Math.round(segundos * (1 - progreso)));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Generando el vídeo…</p>
            <p className="text-xs text-muted">
              {etapa ?? `Se está grabando mientras se reproduce. Queda ${mmss(quedan)}.`}
            </p>
          </div>
          <span className="shrink-0 text-2xl font-bold tabular-nums text-brand">{pct}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        {/* El vídeo, sin un solo control: tocarlo saldría en la grabación. */}
        <div ref={hueco} className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-black" />

        <p className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[12.5px] leading-relaxed text-gold">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No cambies de pestaña ni bloquees el móvil. Si esta ventana deja de verse, la imagen se
            congela y el sonido sigue: el vídeo saldría con una foto fija.
          </span>
        </p>

        {seFue && (
          <p className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            Has salido de la pestaña durante la grabación. Es muy probable que el vídeo tenga la
            imagen congelada en ese tramo. Cancela y vuelve a empezar.
          </p>
        )}

        {/* Hueco para lo que vaya aquí el día de mañana. Vacío a propósito:
            mientras no haya nada que enseñar, no se enseña nada. */}
        <div className="hidden min-h-[60px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 sm:flex">
          <span className="text-[11px] text-muted/50">—</span>
        </div>

        {confirmar ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2">
            <span className="flex-1 text-[12.5px] text-fg">
              ¿Cancelar? Se pierde lo grabado y hay que empezar de nuevo.
            </span>
            <button onClick={onCancelar} className="btn-ghost border-danger/60 px-3 py-1 text-xs text-danger">
              Sí, cancelar
            </button>
            <button onClick={() => setConfirmar(false)} className="btn-ghost px-3 py-1 text-xs">
              Seguir grabando
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmar(true)} className="btn-ghost self-center px-4 py-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
