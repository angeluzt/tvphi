"use client";

import { ChevronLeft, ChevronRight, Move, Mic, Volume2, Sticker, Sparkles } from "lucide-react";
import type { PestanaToma } from "./pestanas-toma";

// El puesto de mando de la ventana de reproducción.
//
// La ventana ya se queda fija mientras editas; lo que le faltaba era poder
// MOVERSE desde ella. Antes, para pasar a la toma siguiente había que bajar
// hasta encontrarla en la lista, y para cambiar de sección —de los diálogos a
// los efectos— bajar otra vez. Con esto se salta de toma y de sección sin tocar
// la rueda: la lista de abajo va detrás sola y trae la toma a la vista.

const SECCIONES: { id: PestanaToma; corto: string; Icono: typeof Move }[] = [
  { id: "camara", corto: "Cámara", Icono: Move },
  { id: "voz", corto: "Voz", Icono: Mic },
  { id: "sonido", corto: "Sonido", Icono: Volume2 },
  { id: "imagenes", corto: "PNG", Icono: Sticker },
  { id: "efectos", corto: "Efectos", Icono: Sparkles },
];

export function MandoTramo({
  puesto,
  total,
  pestana,
  onSaltar,
  onPestana,
}: {
  /** Qué número de toma es, empezando en 1. 0 si no se está viendo una toma. */
  puesto: number;
  total: number;
  pestana: PestanaToma;
  onSaltar: (dir: -1 | 1) => void;
  onPestana: (p: PestanaToma) => void;
}) {
  if (!puesto) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onSaltar(-1)}
          disabled={puesto <= 1}
          className="btn-ghost shrink-0 px-2 py-1 text-[11px] disabled:opacity-40"
          title="Toma anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
        </button>
        <span className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-muted">
          Toma <span className="text-fg">{puesto}</span> de {total}
        </span>
        <button
          onClick={() => onSaltar(1)}
          disabled={puesto >= total}
          className="btn-ghost shrink-0 px-2 py-1 text-[11px] disabled:opacity-40"
          title="Toma siguiente"
        >
          Siguiente <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Las mismas secciones que la toma, para abrirlas desde aquí arriba. */}
      <div className="flex gap-1 overflow-x-auto">
        {SECCIONES.map(({ id, corto, Icono }) => {
          const on = pestana === id;
          return (
            <button
              key={id}
              onClick={() => onPestana(id)}
              title={`Abrir ${corto} de esta toma`}
              aria-pressed={on}
              className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-colors ${
                on ? "border-brand bg-brand/15 text-brand"
                   : "border-border text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icono className="h-3 w-3" />
              {corto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
