"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

export function CupoIaForm({ inicial }: { inicial: number }) {
  const [valor, setValor] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/cupo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: valor }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudo guardar");
      setValor(j.limite ?? valor);
      setMsg(`Guardado: ${j.limite} historias con IA cada 24 h.`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void guardar(e)} className="card space-y-3 p-4">
      <div>
        <p className="text-sm font-medium">Cupo de historias con IA</p>
        <p className="mt-1 text-[11px] text-muted">
          Cuántos capítulos pueden generar los usuarios normales en 24 horas.
          Los correos de <code className="text-[10px]">STORY_QUOTA_EXEMPT_EMAILS</code> no tienen límite.
          Los videos a mano no cuentan.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[8rem]">
          <span className="text-[11px] text-muted">Por usuario / 24 h</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            className="input mt-1 w-28 tabular-nums"
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn-brand" disabled={busy || !Number.isFinite(valor) || valor < 1}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>
      {msg && <p className="text-xs text-accent">{msg}</p>}
      {err && <p className="text-xs text-danger">{err}</p>}
    </form>
  );
}
