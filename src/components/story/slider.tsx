"use client";

import { Minus, Plus } from "lucide-react";

// Barra con etiqueta, valor y un − a la izquierda y un + a la derecha.
//
// La barra sirve para acercarse de un manotazo al sitio y los dos botones para
// afinar sin pelearse con el dedo: cada toque mueve un paso exacto. Es lo que
// hace la barra usable en móvil, donde un píxel de más manda el valor lejos.
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  const shown = format ? format(value) : value.toFixed(2);
  // Se redondea al paso para que sumar y restar no acabe arrastrando decimales.
  const mover = (dir: -1 | 1) => {
    const v = Math.max(min, Math.min(max, value + dir * step));
    const n = Math.round(v / step) * step;
    onChange(Number(n.toFixed(6)));
  };
  const btn =
    "grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border text-muted " +
    "hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-[11px] text-muted">
        {label}
        <span className="ml-auto tabular-nums text-fg/80">{shown}</span>
      </span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); mover(-1); }}
          disabled={value <= min}
          className={btn}
          aria-label={`${label}: quitar un paso`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1"
          aria-label={label}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); mover(1); }}
          disabled={value >= max}
          className={btn}
          aria-label={`${label}: añadir un paso`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </span>
      {hint && <span className="block text-[10px] text-muted/80">{hint}</span>}
    </label>
  );
}
