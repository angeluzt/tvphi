"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Error");
    setMessage(data.message ?? "Revisa tu correo.");
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <Logo className="mb-6" />
        <h1 className="text-xl font-bold">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-muted">
          Escribe el email de tu cuenta. Si existe, te enviaremos un enlace (válido 1 hora).
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              name="email"
              type="email"
              className="input mt-1"
              autoComplete="email"
              required
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {message && <p className="text-sm text-accent">{message}</p>}
          <button className="btn-brand w-full" disabled={loading}>
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          <Link href="/auth/login" className="text-accent hover:underline">
            Volver a entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
