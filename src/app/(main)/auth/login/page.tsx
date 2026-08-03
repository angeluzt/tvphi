"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailOrUsername: form.get("emailOrUsername"),
        password: form.get("password"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Error");
    router.push("/story");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <Logo className="mb-6" />
        <h1 className="text-xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted">Bienvenido de vuelta.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email o usuario</label>
            <input name="emailOrUsername" className="input mt-1" autoComplete="username" required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input name="password" type="password" className="input mt-1" autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-brand w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          ¿No tienes cuenta?{" "}
          <Link href="/auth/register" className="text-accent hover:underline">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
