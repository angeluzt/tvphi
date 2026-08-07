"use client";

import { useState } from "react";
import { Loader2, Mail, Check, AlertTriangle } from "lucide-react";

/** Botón de «no me llegó». Se usa en la página del enlace y en el aviso del editor. */
export function ReenviarVerificacion({ compacto }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<"" | "yendo" | "hecho">("");
  const [error, setError] = useState<string | null>(null);
  const [donde, setDonde] = useState<string | null>(null);

  async function pedir() {
    setEstado("yendo"); setError(null);
    try {
      const r = await fetch("/api/auth/verify/reenviar", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo enviar");
      setDonde(j.enviadoA ?? null);
      setEstado("hecho");
    } catch (e) {
      setError((e as Error).message);
      setEstado("");
    }
  }

  if (estado === "hecho") {
    return (
      <p className="flex items-start gap-1.5 text-xs text-accent">
        <Check className="mt-px h-3.5 w-3.5 shrink-0" />
        Enlace enviado{donde ? ` a ${donde}` : ""}. Si no aparece, mira en spam.
      </p>
    );
  }

  return (
    <div className={compacto ? "" : "space-y-1"}>
      <button
        onClick={() => void pedir()}
        disabled={estado === "yendo"}
        className={compacto ? "btn-ghost text-xs" : "btn-ghost text-sm"}
      >
        {estado === "yendo"
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Mail className="h-3.5 w-3.5 text-accent" />}
        Mandarme otro enlace
      </button>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
