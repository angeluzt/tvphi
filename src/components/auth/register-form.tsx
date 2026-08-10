"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Captcha } from "./captcha";

export function RegisterForm({ claveCaptcha }: { claveCaptcha: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  // Sube cada vez que hay que pedirle otro token al widget: el de Turnstile se
  // gasta al usarlo, así que tras un fallo el siguiente envío iría con uno
  // muerto y volvería a fallar, pareciendo que el captcha está roto.
  const [intento, setIntento] = useState(0);

  const faltaCaptcha = !!claveCaptcha && !token;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          username: form.get("username"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          captcha: token || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToken("");
        setIntento((n) => n + 1);
        setLoading(false);
        return setError(data.error ?? "Error");
      }
      router.push("/story");
      router.refresh();
    } catch {
      setLoading(false);
      setToken("");
      setIntento((n) => n + 1);
      setError("No se pudo conectar. Revisa tu conexión.");
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <Logo className="mb-6" />
        <h1 className="text-xl font-bold">Crea tu canal</h1>
        <p className="mt-1 text-sm text-muted">Empieza a transmitir en minutos, sin OBS.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Nombre a mostrar <span className="text-muted">(opcional)</span></label>
            <input name="displayName" className="input mt-1" placeholder="Tu nombre" />
          </div>
          <div>
            <label className="label">Usuario</label>
            <input name="username" className="input mt-1" placeholder="tucanal" required />
            <p className="mt-1 text-xs text-muted">Tu canal será tvphi.com/tucanal</p>
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input mt-1" required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input name="password" type="password" className="input mt-1" minLength={8} required />
          </div>

          {!!claveCaptcha && (
            <Captcha claveSitio={claveCaptcha} reintento={intento} onToken={setToken} />
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-brand w-full" disabled={loading || faltaCaptcha}>
            {loading ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
