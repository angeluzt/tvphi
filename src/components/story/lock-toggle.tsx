"use client";

import { Lock, Unlock } from "lucide-react";

// Casilla para bloquear una escena o una toma y no cambiarla sin querer.
export function LockToggle({
  checked,
  onChange,
  label = "Bloquear",
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  title?: string;
}) {
  return (
    <label
      title={title ?? (checked ? "Desbloquear para poder editar" : "Bloquear para no cambiarlo sin querer")}
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
        checked ? "border-gold/60 bg-gold/10 text-gold" : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 accent-current"
      />
      {checked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </label>
  );
}
