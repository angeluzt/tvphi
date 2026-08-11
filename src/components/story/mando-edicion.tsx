"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";

// El puesto de mando del reproductor: ahora con los controles DENTRO.
//
// QUÉ HACÍA ANTES. Botones que te llevaban con scroll a la sección de abajo.
// Sonaba bien y en la práctica era el viaje completo: estabas mirando la
// ventana de reproducción —que es donde se ve si el sonido entra a tiempo—, le
// dabas a «Sonido», la página bajaba, tocabas el volumen, y para volver a ver
// el resultado tenías que subir otra vez. Cada ajuste, dos viajes.
//
// LO QUE HACE AHORA. Trae los controles de verdad aquí, junto a la imagen que
// estás mirando. No son controles nuevos: son los MISMOS, montados aquí dentro.
// Escribir una versión reducida «para el mando» es lo que garantiza que en un
// mes las dos se comporten distinto y nadie sepa cuál manda.
//
// TRES ÁMBITOS, porque hay tres reproductores y cada uno edita lo suyo:
//   · toma   → cámara, diálogos, sonidos, imágenes encima y efectos del plano
//   · escena → los efectos que comparten todas sus tomas
//   · global → música de fondo y volumen de la narración
// Antes solo la toma tenía algo, y encima solo el salto.

export type AmbitoMando = "toma" | "escena" | "global";

const TITULO: Record<AmbitoMando, string> = {
  toma: "Editar esta toma",
  escena: "Editar esta escena",
  global: "Editar todo el video",
};

export function MandoEdicion({
  ambito,
  nav,
  children,
  abiertoPorDefecto = false,
  onAbierto,
  pie,
}: {
  ambito: AmbitoMando;
  /** Saltar de toma sin bajar a la lista. Solo tiene sentido en una toma. */
  nav?: {
    puesto: number;
    total: number;
    onSaltar: (dir: -1 | 1) => void;
  };
  children: ReactNode;
  abiertoPorDefecto?: boolean;
  /** Para que la ventana le haga sitio encogiendo la imagen. */
  onAbierto?: (v: boolean) => void;
  /** Una línea al final: «esto mismo está abajo», atajos, lo que sea. */
  pie?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  return (
    <div className="mt-2">
      {nav && nav.total > 1 && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            onClick={() => nav.onSaltar(-1)}
            disabled={nav.puesto <= 1}
            className="btn-ghost shrink-0 px-2 py-1 text-[11px] disabled:opacity-40"
            title="Toma anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </button>
          <span className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-muted">
            Toma <span className="text-fg">{nav.puesto}</span> de {nav.total}
          </span>
          <button
            onClick={() => nav.onSaltar(1)}
            disabled={nav.puesto >= nav.total}
            className="btn-ghost shrink-0 px-2 py-1 text-[11px] disabled:opacity-40"
            title="Toma siguiente"
          >
            Siguiente <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => { onAbierto?.(!v); return !v; })}
        aria-expanded={abierto}
        className={`btn-ghost w-full justify-center py-1 text-[11px] ${
          abierto ? "border-brand/60 text-brand" : ""
        }`}
      >
        {abierto ? <X className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
        {abierto ? "Cerrar los controles" : TITULO[ambito]}
      </button>

      {abierto && (
        // Con su propio scroll y un tope de alto: los controles de una toma son
        // largos, y sin esto la ventana crecía hasta tapar la pantalla entera
        // —justo lo que se venía arreglando—.
        <div className="mt-1.5 max-h-[52vh] overflow-y-auto overscroll-contain rounded-lg border border-brand/40 bg-surface/60 p-2">
          {children}
          {pie && <div className="mt-2 border-t border-border pt-1.5">{pie}</div>}
        </div>
      )}
    </div>
  );
}
