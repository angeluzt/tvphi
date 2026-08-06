"use client";

import { Move, Mic, Volume2, Sticker, Sparkles } from "lucide-react";

// Las secciones de una toma, en pestañas en vez de una detrás de otra.
//
// Abierta, una toma medía más de mil trescientos píxeles: cámara, tiempo,
// transición, diálogos, sonidos, imágenes encima y dos bloques de efectos, todo
// apilado. Para tocar los efectos había que pasar por delante de lo demás, y
// de tanto rodar la rueda se acababa arrastrando algo sin querer.
//
// Con pestañas se ve UNA sección cada vez. El número al lado dice lo que hay
// dentro sin tener que entrar, que es la mitad del motivo por el que se bajaba:
// mirar si esa toma tenía diálogo o efectos.

export type PestanaToma = "camara" | "voz" | "sonido" | "imagenes" | "efectos";

const PESTANAS: { id: PestanaToma; label: string; corto: string; Icono: typeof Move }[] = [
  { id: "camara", label: "Cámara y tiempo", corto: "Cámara", Icono: Move },
  { id: "voz", label: "Diálogos", corto: "Voz", Icono: Mic },
  { id: "sonido", label: "Sonidos", corto: "Sonido", Icono: Volume2 },
  { id: "imagenes", label: "Imágenes encima", corto: "PNG", Icono: Sticker },
  { id: "efectos", label: "Efectos", corto: "Efectos", Icono: Sparkles },
];

export function PestanasToma({
  activa,
  onCambiar,
  cuentas,
}: {
  activa: PestanaToma;
  onCambiar: (p: PestanaToma) => void;
  /** Cuántas cosas hay en cada sección, para verlo sin abrirla. */
  cuentas: Record<PestanaToma, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de la toma"
      // Se pega arriba dentro de la toma: al bajar por una sección larga, las
      // pestañas siguen a mano y se salta a otra sin volver a subir.
      className="sticky top-0 z-20 -mx-2.5 mb-2 flex gap-1 overflow-x-auto border-b border-border bg-surface/95 px-2.5 pb-1.5 pt-2 backdrop-blur"
    >
      {PESTANAS.map(({ id, label, corto, Icono }) => {
        const on = activa === id;
        const n = cuentas[id];
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            title={label}
            onClick={() => onCambiar(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              on
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icono className="h-3.5 w-3.5" />
            <span>{corto}</span>
            {n > 0 && (
              <span
                className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] tabular-nums ${
                  on ? "bg-accent/25 text-accent" : "bg-surface-2 text-muted"
                }`}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
