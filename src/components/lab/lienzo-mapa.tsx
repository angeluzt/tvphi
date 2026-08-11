"use client";

import { useEffect, useRef } from "react";
import { dibujarEscena } from "@/lib/lab/dibujar";
import {
  ESQUINAS, cajaArrastrando, cajaDeObjeto, cambiarObjeto, moverObjeto, objetoEn,
  puntoDeEsquina, redimensionarObjeto,
  type Caja, type Esquina, type Golpe,
} from "@/lib/lab/geometria-mapa";
import type { Escena } from "@/lib/lab/escena";

// El lienzo del mapa, y ahora también sus manos.
//
// Hasta aquí el mapa era una imagen: se veía y no se tocaba. Para mover un
// árbol había que bajar al cuadro de JSON, encontrar el objeto entre otros
// treinta, cambiar dos números a ojo, darle a «Aplicar» y volver a mirar. Nadie
// que no programe iba a hacer eso, y quien programa tampoco quería.
//
// DOS MODOS, Y NO ES UN CAPRICHO. El paralaje de la vista previa desplaza cada
// capa según su profundidad, así que la forma NO está donde se dibuja: para
// acertarla habría que deshacer ese desplazamiento en cada toque, y aun así se
// estaría intentando agarrar algo que se mueve solo. Mientras se editan formas
// el paralaje se congela; para verlo, se sale del modo edición. Además se
// entiende sin explicarlo: si algo se mueve, no se puede coger.

const TIRADOR = 7;

export function LienzoMapa({
  esc, seleccion, onSeleccion, onEscena, editando,
  etiquetas, rejilla, paralaje, fuerza,
}: {
  esc: Escena;
  seleccion: Golpe | null;
  onSeleccion: (g: Golpe | null) => void;
  onEscena: (e: Escena) => void;
  /** Con formas: se puede coger, arrastrar y estirar. Sin formas: solo mirar. */
  editando: boolean;
  etiquetas: boolean;
  rejilla: boolean;
  paralaje: boolean;
  fuerza: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const raton = useRef({ x: 0, y: 0 });
  const encima = useRef(false);

  // El bucle de dibujo no puede depender del render de React —se pintan sesenta
  // fotogramas por segundo—, así que todo lo que consulta vive en refs.
  const escRef = useRef(esc);
  const selRef = useRef(seleccion);
  const editandoRef = useRef(editando);
  escRef.current = esc;
  selRef.current = seleccion;
  editandoRef.current = editando;

  /** Qué se está arrastrando ahora mismo, si algo. */
  const gesto = useRef<
    | { tipo: "mover"; golpe: Golpe; x: number; y: number }
    | { tipo: "estirar"; golpe: Golpe; esquina: Esquina }
    | null
  >(null);

  const coords = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  /** La caja de lo seleccionado, o null si ya no existe. */
  function cajaSel(): Caja | null {
    const s = selRef.current;
    if (!s) return null;
    const o = escRef.current.layers
      .find((c) => c.id === s.capaId)?.objects.find((x) => x.id === s.objetoId);
    return o ? cajaDeObjeto(o) : null;
  }

  useEffect(() => {
    let vivo = true;
    const t0 = performance.now();
    const paso = (t: number) => {
      if (!vivo) return;
      const cv = canvas.current;
      const escena = escRef.current;
      if (cv && escena) {
        const ancho = Math.max(320, Math.min(1200, caja.current?.clientWidth ?? 900));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(ancho * dpr);
        const h = Math.round((w * escena.scene.height) / escena.scene.width);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        let ox = 0, oy = 0;
        // Congelado mientras se editan formas: ver arriba.
        if (paralaje && !editandoRef.current) {
          const k = (fuerza / 100) * 0.06;
          if (encima.current) { ox = raton.current.x * k; oy = raton.current.y * k * 0.55; }
          else {
            const s = (t - t0) / 3200;
            ox = Math.sin(s) * k; oy = Math.cos(s * 0.8) * k * 0.4;
          }
        }
        dibujarEscena(cv, escena, { offsetX: ox, offsetY: oy, etiquetas, rejilla });
        if (editandoRef.current) pintarSeleccion(cv, cajaSel());
      }
      requestAnimationFrame(paso);
    };
    const id = requestAnimationFrame(paso);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, [etiquetas, rejilla, paralaje, fuerza]);

  return (
    <div
      ref={caja}
      className={`overflow-hidden rounded-xl border bg-black ${
        editando ? "cursor-crosshair touch-none border-accent/60" : "border-border"
      }`}
      onPointerMove={(e) => {
        const p = coords(e);
        if (!editando) {
          raton.current = { x: (p.x - 0.5) * 2, y: (p.y - 0.5) * 2 };
          encima.current = true;
          return;
        }
        const g = gesto.current;
        if (!g) return;
        e.preventDefault();
        if (g.tipo === "mover") {
          onEscena(cambiarObjeto(escRef.current, g.golpe.capaId, g.golpe.objetoId,
            (o) => moverObjeto(o, p.x - g.x, p.y - g.y)));
          gesto.current = { ...g, x: p.x, y: p.y };
          return;
        }
        const c = cajaSel();
        if (!c) return;
        onEscena(cambiarObjeto(escRef.current, g.golpe.capaId, g.golpe.objetoId,
          (o) => redimensionarObjeto(o, cajaArrastrando(c, g.esquina, p.x, p.y))));
      }}
      onPointerLeave={() => { encima.current = false; }}
      onPointerDown={(e) => {
        if (!editando) return;
        const p = coords(e);
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ratón viejo */ }

        // Primero los tiradores de lo YA seleccionado. Si se mirara antes qué
        // forma hay debajo, un tirador que cae encima de otra forma
        // seleccionaría esa otra y no habría manera de estirar nada apilado.
        const c = cajaSel();
        const sel = selRef.current;
        if (c && sel) {
          const r = e.currentTarget.getBoundingClientRect();
          const cercaX = (TIRADOR + 6) / Math.max(1, r.width);
          const cercaY = (TIRADOR + 6) / Math.max(1, r.height);
          for (const esquina of ESQUINAS) {
            const q = puntoDeEsquina(c, esquina);
            if (Math.abs(p.x - q.x) < cercaX && Math.abs(p.y - q.y) < cercaY) {
              gesto.current = { tipo: "estirar", golpe: sel, esquina };
              return;
            }
          }
        }

        const golpe = objetoEn(escRef.current, p.x, p.y);
        onSeleccion(golpe);
        gesto.current = golpe ? { tipo: "mover", golpe, x: p.x, y: p.y } : null;
      }}
      onPointerUp={() => { gesto.current = null; }}
      onPointerCancel={() => { gesto.current = null; }}
    >
      <canvas ref={canvas} className="block h-auto w-full" />
    </div>
  );
}

/** El marco y los cuatro tiradores de lo que está cogido. */
function pintarSeleccion(cv: HTMLCanvasElement, c: Caja | null) {
  if (!c) return;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width, H = cv.height;
  const x = c.x * W, y = c.y * H, w = c.w * W, h = c.h * H;
  ctx.save();
  // Dos trazos, uno oscuro debajo: el mapa tiene colores chillones y un marco
  // de un solo color desaparece justo encima del que le toca.
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  const escala = Math.max(1, W / 900);
  for (const e of ESQUINAS) {
    const q = puntoDeEsquina(c, e);
    ctx.beginPath();
    ctx.arc(q.x * W, q.y * H, TIRADOR * escala, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  }
  ctx.restore();
}
