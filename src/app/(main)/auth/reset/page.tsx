"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto mt-10 max-w-md">
        <div className="card p-8">
          <Logo className="mb-6" />
          <p className="text-sm text-muted">Cargando…</p>
        </div>
      </div>
    }>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        if (alive) { setValid(false); setChecking(false); }
        return;
      }
      const res = await fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!alive) return;
      setValid(!!data.ok);
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [token]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        nueva: form.get("nueva"),
        confirmar: form.get("confirmar"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "No se pudo guardar");
    router.replace("/auth/login?reset=1");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <Logo className="mb-6" />
        <h1 className="text-xl font-bold">Nueva contraseña</h1>

        {checking && (
          <p className="mt-4 text-sm text-muted">Comprobando el enlace…</p>
        )}

        {!checking && !valid && (
          <>
            <p className="mt-2 text-sm text-danger">
              Este enlace no es válido o ya caducó.
            </p>
            <p className="mt-4 text-sm text-muted">
              <Link href="/auth/forgot" className="text-accent hover:underline">
                Pedir un enlace nuevo
              </Link>
              {" · "}
              <Link href="/auth/login" className="text-accent hover:underline">
                Entrar
              </Link>
            </p>
          </>
        )}

        {!checking && valid && (
          <>
            <p className="mt-1 text-sm text-muted">
              Elige una contraseña nueva. Después tendrás que entrar con ella.
            </p>
            <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
              <div>
                <label className="label">Nueva contraseña</label>
                <input
                  name="nueva"
                  type="password"
                  className="input mt-1"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label">Repetir contraseña</label>
                <input
                  name="confirmar"
                  type="password"
                  className="input mt-1"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <button className="btn-brand w-full" disabled={loading}>
                {loading ? "Guardando…" : "Guardar y ir a entrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
