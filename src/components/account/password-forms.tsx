"use client";

import { useState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";

export function PasswordAccountForms() {
  return (
    <div className="space-y-4">
      <CambiarContrasena />
      <EnviarReset />
    </div>
  );
}

function CambiarContrasena() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual: data.get("actual"),
        nueva: data.get("nueva"),
        confirmar: data.get("confirmar"),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(j.error ?? "No se pudo cambiar");
    form.reset();
    setOk("Contraseña actualizada.");
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-bold">Cambiar contraseña</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Si conoces tu contraseña actual, cámbiala aquí.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label className="label">Contraseña actual</label>
          <input name="actual" type="password" className="input mt-1" autoComplete="current-password" required />
        </div>
        <div>
          <label className="label">Nueva contraseña</label>
          <input name="nueva" type="password" className="input mt-1" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label">Repetir nueva</label>
          <input name="confirmar" type="password" className="input mt-1" autoComplete="new-password" minLength={8} required />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {ok && <p className="text-sm text-accent">{ok}</p>}
        <button type="submit" className="btn-brand" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}

function EnviarReset() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enviar() {
    setError(null);
    setOk(null);
    setLoading(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(j.error ?? "No se pudo enviar");
    setOk(j.message ?? "Revisa tu correo. El enlace caduca en 1 hora.");
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-brand" />
        <h2 className="text-lg font-bold">Restablecer por correo</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Te mandamos un enlace a tu email para elegir una nueva contraseña.
        Al terminar te pediremos entrar de nuevo.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-3 text-sm text-accent">{ok}</p>}
      <button type="button" onClick={() => void enviar()} className="btn-ghost mt-4" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {loading ? "Enviando…" : "Enviar enlace a mi correo"}
      </button>
    </div>
  );
}
