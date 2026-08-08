"use client";

/**
 * Deslizador con pasos exactos para ratón y móvil.
 *
 * El rango sigue permitiendo cambios rápidos; −/+ hace posible corregir un
 * solo píxel o una centésima sin pelearse con un control estrecho.
 */
export function RangoPreciso({
  valor, min, max, paso = 1, onCambio, disabled, etiqueta, className = "",
}: {
  valor: number;
  min: number;
  max: number;
  paso?: number;
  onCambio: (valor: number) => void;
  disabled?: boolean;
  etiqueta?: string;
  className?: string;
}) {
  const limite = Math.max(min, max);
  const decimales = Math.min(6, Math.max(0, (String(paso).split(".")[1] ?? "").length));
  const acotar = (n: number) => Math.max(min, Math.min(limite, n));
  const mover = (direccion: -1 | 1) => {
    const siguiente = acotar(valor + paso * direccion);
    onCambio(Number(siguiente.toFixed(decimales)));
  };
  const nombre = etiqueta || "valor";

  return (
    <span className={`flex min-w-0 flex-1 items-center gap-1 ${className}`}>
      <button
        type="button"
        disabled={disabled || valor <= min}
        onClick={() => mover(-1)}
        className="h-7 w-7 shrink-0 rounded border border-border bg-surface/60 text-sm leading-none text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
        aria-label={`Disminuir ${nombre}`}
      >
        −
      </button>
      <input
        type="range"
        min={min}
        max={limite}
        step={paso}
        value={acotar(valor)}
        disabled={disabled}
        onChange={(e) => onCambio(Number(e.target.value))}
        className="min-w-0 flex-1"
        aria-label={nombre}
      />
      <button
        type="button"
        disabled={disabled || valor >= limite}
        onClick={() => mover(1)}
        className="h-7 w-7 shrink-0 rounded border border-border bg-surface/60 text-sm leading-none text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
        aria-label={`Aumentar ${nombre}`}
      >
        +
      </button>
    </span>
  );
}
