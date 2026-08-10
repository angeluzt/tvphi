"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { RangoPreciso } from "./rango-preciso";

// Mandos sueltos del montaje: la palanca, las flechas, un número y una barra.
//
// Viven aparte porque no saben NADA del montaje: reciben un valor y devuelven
// otro. Estaban al final del compositor solo por costumbre, y allí engordaban
// un archivo que ya costaba de leer sin aportarle nada.

export function Palanca({ onMover, disabled, etiqueta }: {
  onMover: (dx: number, dy: number) => void;
  disabled?: boolean;
  etiqueta: string;
}) {
  const R = 30;
  const caja = useRef<HTMLDivElement>(null);
  const vec = useRef({ x: 0, y: 0 });
  const lazo = useRef<number | null>(null);
  const [pomo, setPomo] = useState({ x: 0, y: 0 });

  const parar = () => {
    if (lazo.current !== null) cancelAnimationFrame(lazo.current);
    lazo.current = null;
    vec.current = { x: 0, y: 0 };
    setPomo({ x: 0, y: 0 });
  };
  useEffect(() => parar, []);

  const apuntar = (e: React.PointerEvent) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / R) / d;   // dirección, con módulo de 0 a 1
    vec.current = { x: dx * k, y: dy * k };
    setPomo({ x: vec.current.x * R, y: vec.current.y * R });
  };

  return (
    <div
      ref={caja}
      role="application"
      aria-label={etiqueta}
      title={etiqueta}
      className={`relative shrink-0 touch-none rounded-full border border-border bg-surface-2/70 ${
        disabled ? "opacity-40" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{ width: R * 2 + 12, height: R * 2 + 12 }}
      onPointerDown={(e) => {
        if (disabled) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        apuntar(e);
        if (lazo.current === null) {
          const tic = () => {
            // Empujar la palanca ARRIBA tiene que subir la toma, o sea llevar
            // la escena hacia abajo: por eso el signo va cambiado.
            onMover(-vec.current.x * 0.014, -vec.current.y * 0.014);
            lazo.current = requestAnimationFrame(tic);
          };
          lazo.current = requestAnimationFrame(tic);
        }
      }}
      onPointerMove={(e) => { if (lazo.current !== null) apuntar(e); }}
      onPointerUp={parar}
      onPointerCancel={parar}
      onLostPointerCapture={parar}
    >
      <span className="pointer-events-none absolute inset-0 m-auto h-px w-4 self-center bg-border" style={{ top: "50%" }} />
      <span
        className="pointer-events-none absolute rounded-full bg-accent/80 shadow"
        style={{
          width: 20, height: 20,
          left: `calc(50% - 10px + ${pomo.x}px)`,
          top: `calc(50% - 10px + ${pomo.y}px)`,
        }}
      />
    </div>
  );
}

/**
 * Botón de flecha que repite mientras se mantiene pulsado.
 *
 * Un clic por cada 6% de cuadro sería un martilleo para cruzar la escena; con
 * mantener pulsado se coloca la toma de un tirón, que es como se usa esto.
 */
export function Flecha({ etiqueta, onPulsa, disabled, children }: {
  etiqueta: string; onPulsa: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  const timers = useRef<{ retardo?: ReturnType<typeof setTimeout>; repite?: ReturnType<typeof setInterval> }>({});
  const parar = () => {
    if (timers.current.retardo) clearTimeout(timers.current.retardo);
    if (timers.current.repite) clearInterval(timers.current.repite);
    timers.current = {};
  };
  useEffect(() => parar, []);
  return (
    <button
      type="button" disabled={disabled} title={etiqueta} aria-label={etiqueta}
      onPointerDown={() => {
        if (disabled) return;
        onPulsa();
        timers.current.retardo = setTimeout(() => {
          timers.current.repite = setInterval(onPulsa, 40);
        }, 300);
      }}
      onPointerUp={parar}
      onPointerLeave={parar}
      className="rounded border border-border p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Campo numérico que se deja escribir.
 *
 * El de antes recortaba al rango EN CADA TECLA sobre un valor controlado: al
 * borrarlo saltaba solo a un número, escribir «12» pasaba por «1» y se comía el
 * primer dígito, y no había manera de dejarlo vacío para teclear otra cosa.
 * Aquí se guarda lo tecleado tal cual mientras se escribe y solo se recorta al
 * salir del campo, que es cuando ya se sabe lo que quería poner. Y con ± para
 * no tener que teclear.
 */
export function Num({ etiqueta, valor, min, max, paso, onCambio, disabled, sufijo, ancho = "w-20" }: {
  etiqueta: string; valor: number; min: number; max: number; paso: number;
  onCambio: (v: number) => void; disabled?: boolean; sufijo?: string; ancho?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const acotar = (v: number) => Math.max(min, Math.min(max, v));
  // Decimales según el paso, para que 0.5 no acabe en 4.300000000000001.
  const limpio = (v: number) => String(Number(v.toFixed(paso < 1 ? 2 : 0)));
  const empujar = (d: number) => { setTexto(null); onCambio(acotar(valor + d * paso)); };

  return (
    <label className={`text-[11px] text-muted ${disabled ? "opacity-50" : ""}`}>
      {etiqueta}
      <span className="mt-0.5 flex items-center gap-0.5">
        <button
          type="button" disabled={disabled || valor <= min} onClick={() => empujar(-1)}
          className="rounded border border-border px-1.5 py-1 leading-none hover:bg-surface-2 disabled:opacity-30"
          aria-label={`Bajar ${etiqueta}`}
        >−</button>
        <input
          type="text" inputMode="decimal" disabled={disabled}
          value={texto ?? limpio(valor)}
          onChange={(e) => {
            const t = e.target.value;
            setTexto(t);
            // Se avisa en cuanto lo escrito es un número válido, para que la
            // vista previa responda mientras se teclea; lo que no vale se deja
            // en pantalla sin tocar el valor.
            const n = Number(t.replace(",", "."));
            if (t.trim() !== "" && Number.isFinite(n)) onCambio(acotar(n));
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setTexto(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setTexto(null); e.currentTarget.blur(); }
            if (e.key === "ArrowUp") { e.preventDefault(); empujar(1); }
            if (e.key === "ArrowDown") { e.preventDefault(); empujar(-1); }
          }}
          className={`input ${ancho} py-1 text-center text-[11px] tabular-nums`}
        />
        <button
          type="button" disabled={disabled || valor >= max} onClick={() => empujar(1)}
          className="rounded border border-border px-1.5 py-1 leading-none hover:bg-surface-2 disabled:opacity-30"
          aria-label={`Subir ${etiqueta}`}
        >+</button>
        {sufijo && <span className="ml-0.5 text-[10px] opacity-70">{sufijo}</span>}
      </span>
    </label>
  );
}

/** Dibuja A, destinos, pausas y posición viva sin contaminar ninguna exportación. */

export function Barra({ etiqueta, valor, min = 0, max, paso, onCambio, formato, disabled }: {
  etiqueta: string; valor: number; min?: number; max: number; paso: number;
  onCambio: (v: number) => void; formato: (v: number) => string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-1.5 text-[10px] text-muted ${disabled ? "opacity-55" : ""}`}>
      <span className="w-16 shrink-0">{etiqueta}</span>
      <RangoPreciso valor={valor} min={min} max={max} paso={paso}
        onCambio={onCambio} etiqueta={etiqueta} disabled={disabled} />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}
