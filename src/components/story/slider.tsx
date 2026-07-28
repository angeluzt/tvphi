"use client";

// Barra con etiqueta y valor. Es la forma cómoda de ajustar posiciones y tamaños
// sin arrastrar, sobre todo en móvil.
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
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-[11px] text-muted">
        {label}
        <span className="ml-auto tabular-nums text-fg/80">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 w-full"
        aria-label={label}
      />
      {hint && <span className="block text-[10px] text-muted/80">{hint}</span>}
    </label>
  );
}
