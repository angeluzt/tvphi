"use client";

import { useEffect, useRef } from "react";
import { Layers3, X } from "lucide-react";

/**
 * El editor de paralaje, en una ventana aparte.
 *
 * POR QUÉ NO VA EN LÍNEA. Partir una escena en láminas trae consigo un mapa,
 * una lista de capas, mandos de profundidad y una vista previa: es un editor
 * entero. Metido dentro de la tarjeta de una escena, en un capítulo de ocho
 * escenas la página se convertía en un tobogán de varios miles de píxeles y
 * había que pasar por delante de todo eso para llegar a la escena siguiente,
 * la usaras o no.
 *
 * Aquí se abre encima, ocupa la pantalla mientras trabajas y se cierra. La
 * página de historias se queda como estaba.
 */
export function VentanaCapas({
  titulo,
  subtitulo,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);

  // Escape cierra, y mientras está abierta la página de detrás no se desplaza:
  // si no, al hacer scroll dentro de la ventana se movía el capítulo entero y
  // al cerrar habías perdido el sitio donde estabas.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caja.current?.focus();
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      // Solo el fondo cierra. Un clic dentro del editor no debe tirar el
      // trabajo, y aquí dentro se arrastra mucho: sin esta comprobación, soltar
      // el ratón fuera del panel cerraba la ventana a media faena.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div
        ref={caja}
        tabIndex={-1}
        className="flex h-full w-full flex-col overflow-hidden rounded-none border border-border bg-surface shadow-2xl outline-none sm:h-[92vh] sm:max-w-5xl sm:rounded-xl"
      >
        <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-2">
          <Layers3 className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{titulo}</p>
            {subtitulo && <p className="truncate text-[11px] text-muted">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="btn-ghost px-2 py-1 text-xs"
            aria-label="Cerrar el editor de paralaje"
          >
            <X className="h-4 w-4" /> Cerrar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
