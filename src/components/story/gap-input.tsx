"use client";

import { Minus, Plus } from "lucide-react";

// Pausa antes de un audio, en segundos. Con botones + y − porque se ajusta a
// menudo y a pasos pequeños; escribir el número a mano es lo incómodo.
export function GapInput({
  value,
  onChange,
  label = "Pausa antes",
  step = 0.5,
  max = 60,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  step?: number;
  max?: number;
}) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Number(v.toFixed(2)))));
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted">
      {label}
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= 0}
        className="grid h-6 w-6 place-items-center rounded border border-border text-muted hover:bg-surface-2 disabled:opacity-40"
        aria-label={`${label}: quitar ${step}s`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-10 text-center tabular-nums text-fg/80">{value.toFixed(1)}s</span>
      <button
        type="button"
        onClick={() => set(value + step)}
        className="grid h-6 w-6 place-items-center rounded border border-border text-muted hover:bg-surface-2"
        aria-label={`${label}: añadir ${step}s`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  );
}
