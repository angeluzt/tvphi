"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Campo de número con botones − y +.
//
// Se escribe con un texto propio mientras el campo está enfocado, en vez de
// reescribirlo en cada tecla: así se puede borrarlo entero y teclear otra cifra.
// Antes, al vaciarlo, el valor mínimo volvía a aparecer al instante y había que
// pelearse con el cursor para poner un número.
//
// Al salir del campo (o al pulsar Enter) se ajusta a lo permitido; vacío = el
// mínimo, que normalmente es 0.
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 0.5,
  decimals = 1,
  unit = "s",
  label,
  hint,
  disabled = false,
  disabledHint,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  disabledHint?: string; // por qué está apagado
}) {
  const redondea = (v: number) => Number(v.toFixed(decimals));
  const ajusta = (v: number) => redondea(Math.max(min, Math.min(max, v)));
  const muestra = (v: number) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));

  const [txt, setTxt] = useState(() => muestra(value));
  const escribiendo = useRef(false);

  // Mientras se escribe no se pisa lo tecleado; el resto del tiempo el campo
  // refleja el valor real (por ejemplo si lo cambian los botones o el modo).
  useEffect(() => {
    if (!escribiendo.current) setTxt(muestra(value));
  }, [value, decimals]);

  function confirma(t: string) {
    const n = Number(t.replace(",", "."));
    const v = t.trim() === "" || !isFinite(n) ? min : ajusta(n);
    setTxt(muestra(v));
    if (v !== value) onChange(v);
  }
  function set(v: number) {
    const n = ajusta(v);
    setTxt(muestra(n));
    if (n !== value) onChange(n);
  }

  return (
    <label className="block space-y-0.5 text-xs">
      {label && <span className={disabled ? "text-muted/60" : "text-muted"}>{label}</span>}
      <span className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={disabled || value <= min}
          className="grid w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Quitar ${step}${unit}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          inputMode="decimal"
          className="input min-w-0 flex-1 px-2 text-center tabular-nums"
          value={disabled ? muestra(value) : txt}
          disabled={disabled}
          onFocus={(e) => { escribiendo.current = true; e.currentTarget.select(); }}
          onChange={(e) => {
            const t = e.target.value;
            if (!/^[0-9]*[.,]?[0-9]*$/.test(t)) return; // solo cifras y un separador
            setTxt(t);
            // Se avisa en cuanto es un número válido, para ver el cambio al momento.
            const n = Number(t.replace(",", "."));
            if (t.trim() !== "" && isFinite(n) && n >= min && n <= max) onChange(redondea(n));
          }}
          onBlur={(e) => { escribiendo.current = false; confirma(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { escribiendo.current = false; confirma((e.target as HTMLInputElement).value); }
            if (e.key === "ArrowUp") { e.preventDefault(); set(value + step); }
            if (e.key === "ArrowDown") { e.preventDefault(); set(value - step); }
          }}
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={disabled || value >= max}
          className="grid w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Añadir ${step}${unit}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </span>
      {(disabled ? disabledHint : hint) && (
        <span className={`block text-[10px] ${disabled ? "text-gold/80" : "text-muted/80"}`}>
          {disabled ? disabledHint : hint}
        </span>
      )}
    </label>
  );
}
