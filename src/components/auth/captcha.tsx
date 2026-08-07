"use client";

import { useEffect, useRef, useState } from "react";

// El widget de Cloudflare Turnstile.
//
// Se monta a mano en vez de con una librería porque son treinta líneas y una
// dependencia menos. El guion se carga UNA vez para toda la pestaña: si se
// mete dos veces, Turnstile se queja y no pinta nada.
//
// Casi siempre no se ve nada más que una casilla que se marca sola; solo
// enseña un reto cuando algo huele raro. Por eso el hueco reservado es
// pequeño: no hay que dejar sitio para un tablero de semáforos.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let cargando: Promise<void> | null = null;

function cargarGuion(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise<void>((listo, falla) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => listo();
    s.onerror = () => { cargando = null; falla(new Error("no se pudo cargar")); };
    document.head.appendChild(s);
  });
  return cargando;
}

export function Captcha({
  claveSitio,
  reintento,
  onToken,
}: {
  claveSitio: string;
  /** Cambia para pedir un token nuevo: los de Turnstile se gastan al usarlos. */
  reintento: number;
  onToken: (t: string) => void;
}) {
  const caja = useRef<HTMLDivElement | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let id: string | null = null;
    let vivo = true;

    void cargarGuion()
      .then(() => {
        if (!vivo || !caja.current || !window.turnstile) return;
        caja.current.innerHTML = "";
        id = window.turnstile.render(caja.current, {
          sitekey: claveSitio,
          theme: "dark",
          language: "es",
          callback: (t: string) => onToken(t),
          // Caducado o fallido: se limpia el token para que el botón se
          // bloquee, en vez de dejar enviar algo que el servidor va a tirar.
          "expired-callback": () => onToken(""),
          "error-callback": () => { onToken(""); setFallo(true); },
        });
      })
      .catch(() => { if (vivo) setFallo(true); });

    return () => {
      vivo = false;
      if (id && window.turnstile) {
        try { window.turnstile.remove(id); } catch { /* ya no estaba */ }
      }
    };
    // onToken viene de un useState del padre, que es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSitio, reintento]);

  return (
    <div>
      <div ref={caja} className="min-h-[65px]" />
      {fallo && (
        <p className="text-xs text-danger">
          No se pudo cargar la comprobación de seguridad. Revisa si tienes un bloqueador puesto.
        </p>
      )}
    </div>
  );
}
