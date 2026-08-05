"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Play, Pause, Crosshair, Download, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
} from "lucide-react";
import { bajar } from "@/lib/lab/exportar";

// Paso 2: apilar las capas ya generadas y moverlas con profundidad.
//
// La primera imagen manda: fija el tamaño del lienzo y se toma como fondo
// opaco. Las siguientes deben ser PNG con transparencia. Cada una lleva su
// profundidad, y al mover la cámara cada capa se desplaza en proporción: el
// fondo casi nada, el primer plano mucho. Eso es lo que da la sensación de que
// la escena tiene fondo, con imágenes que son planas.

interface CapaImg {
  id: string;
  nombre: string;
  img: HTMLImageElement;
  depth: number;
  visible: boolean;
  /** Cuánto se agranda, para que al desplazarse no asome el borde. */
  escala: number;
  opacidad: number;
}

let contador = 0;

export function Compositor({ semilla }: { semilla?: { nombre: string; url: string }[] }) {
  const [capas, setCapas] = useState<CapaImg[]>([]);
  const [moviendo, setMoviendo] = useState(true);
  const [fuerza, setFuerza] = useState(55);
  const [aviso, setAviso] = useState("Carga primero el fondo y luego las capas PNG con transparencia.");
  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const raton = useRef({ x: 0, y: 0 });
  const encima = useRef(false);
  const tam = useRef({ w: 1920, h: 1080 });

  async function meter(archivos: FileList | null) {
    if (!archivos?.length) return;
    const nuevas: CapaImg[] = [];
    for (const f of Array.from(archivos)) {
      const url = URL.createObjectURL(f);
      try {
        const img = await cargar(url);
        nuevas.push(hacerCapa(f.name.replace(/\.[a-z0-9]+$/i, ""), img, capas.length + nuevas.length));
      } catch { setAviso(`No se pudo leer «${f.name}».`); }
    }
    if (!nuevas.length) return;
    setCapas((prev) => {
      const todas = [...prev, ...nuevas];
      if (!prev.length) tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      return repartirProfundidad(todas);
    });
    setAviso(`${nuevas.length} imagen${nuevas.length > 1 ? "es" : ""} añadida${nuevas.length > 1 ? "s" : ""}. Ajusta la profundidad de cada una.`);
  }

  // Cargar las capas del mapa directamente, sin pasar por el disco: sirve para
  // ver cómo se moverá la escena antes de gastar nada en generar imágenes.
  useEffect(() => {
    if (!semilla?.length) return;
    let vivo = true;
    (async () => {
      const nuevas: CapaImg[] = [];
      for (const s of semilla) {
        try { nuevas.push(hacerCapa(s.nombre, await cargar(s.url), nuevas.length)); } catch {}
      }
      if (!vivo || !nuevas.length) return;
      tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      setCapas(repartirProfundidad(nuevas));
      setAviso("Capas del mapa cargadas. Es el mapa, no la imagen final: sirve para ver el movimiento.");
    })();
    return () => { vivo = false; };
  }, [semilla]);

  useEffect(() => {
    let vivo = true;
    const t0 = performance.now();
    const paso = (t: number) => {
      if (!vivo) return;
      pintar(t - t0);
      requestAnimationFrame(paso);
    };
    const id = requestAnimationFrame(paso);
    return () => { vivo = false; cancelAnimationFrame(id); };
  });

  function pintar(ms: number) {
    const cv = canvas.current;
    if (!cv) return;
    const ancho = Math.max(320, Math.min(1200, caja.current?.clientWidth ?? 900));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(ancho * dpr);
    const h = Math.round((w * tam.current.h) / tam.current.w);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#05070d";
    c.fillRect(0, 0, w, h);

    const k = (fuerza / 100) * 0.08;
    let ox = 0, oy = 0;
    if (moviendo) {
      if (encima.current) { ox = raton.current.x * k; oy = raton.current.y * k * 0.5; }
      else { const s = ms / 3000; ox = Math.sin(s) * k; oy = Math.cos(s * 0.75) * k * 0.35; }
    }

    for (const capa of capas) {
      if (!capa.visible) continue;
      const e = capa.escala;
      const dw = w * e, dh = h * e;
      c.save();
      c.globalAlpha = capa.opacidad;
      c.drawImage(
        capa.img,
        -(dw - w) / 2 + ox * capa.depth * w,
        -(dh - h) / 2 + oy * capa.depth * h,
        dw, dh,
      );
      c.restore();
    }
  }

  async function exportarPng() {
    const cv = canvas.current;
    if (!cv || !capas.length) return;
    const out = document.createElement("canvas");
    out.width = tam.current.w; out.height = tam.current.h;
    const c = out.getContext("2d");
    if (!c) return;
    for (const capa of capas) {
      if (!capa.visible) continue;
      const e = capa.escala;
      const dw = out.width * e, dh = out.height * e;
      c.globalAlpha = capa.opacidad;
      c.drawImage(capa.img, -(dw - out.width) / 2, -(dh - out.height) / 2, dw, dh);
    }
    const b = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (b) bajar(b, "montaje.png");
  }

  const upd = (id: string, p: Partial<CapaImg>) =>
    setCapas((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const mover = (i: number, d: -1 | 1) =>
    setCapas((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const n = [...cs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-brand cursor-pointer text-xs">
          <Upload className="h-3.5 w-3.5" /> Añadir imágenes
          <input
            type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
            onChange={(e) => { void meter(e.target.files); e.target.value = ""; }}
          />
        </label>
        <button onClick={() => setMoviendo((v) => !v)} className="btn-ghost text-xs">
          {moviendo ? <Pause className="h-3.5 w-3.5 text-accent" /> : <Play className="h-3.5 w-3.5 text-accent" />}
          {moviendo ? "Parar el movimiento" : "Mover"}
        </button>
        <button onClick={() => { encima.current = false; raton.current = { x: 0, y: 0 }; }} className="btn-ghost text-xs">
          <Crosshair className="h-3.5 w-3.5 text-accent" /> Centrar
        </button>
        <button onClick={() => void exportarPng()} disabled={!capas.length} className="btn-ghost text-xs">
          <Download className="h-3.5 w-3.5 text-accent" /> Montaje PNG
        </button>
        <button onClick={() => { setCapas([]); setAviso("Vacío."); }} disabled={!capas.length} className="btn-ghost text-xs text-danger">
          <Trash2 className="h-3.5 w-3.5" /> Vaciar
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card space-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="label">Capas</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{capas.length}</span>
          </div>
          {!capas.length && (
            <p className="text-[11px] text-muted">
              La primera imagen fija el tamaño y hace de fondo. Las siguientes tienen que ser PNG
              con transparencia, o taparán a las de atrás.
            </p>
          )}
          {capas.map((c, i) => (
            <div key={c.id} className="space-y-1.5 rounded-lg border border-border bg-surface-2/50 p-2">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.nombre}</span>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted hover:text-fg disabled:opacity-30" title="Atrás"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === capas.length - 1} className="text-muted hover:text-fg disabled:opacity-30" title="Adelante"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => upd(c.id, { visible: !c.visible })} className="text-muted hover:text-fg">
                  {c.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setCapas((cs) => cs.filter((x) => x.id !== c.id))} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <Barra etiqueta="Profundidad" valor={c.depth} max={1} paso={0.01}
                onCambio={(v) => upd(c.id, { depth: v })} formato={(v) => v.toFixed(2)} />
              <Barra etiqueta="Zoom" valor={c.escala} min={1} max={1.4} paso={0.01}
                onCambio={(v) => upd(c.id, { escala: v })} formato={(v) => `${Math.round((v - 1) * 100)}%`} />
              <Barra etiqueta="Opacidad" valor={c.opacidad} max={1} paso={0.01}
                onCambio={(v) => upd(c.id, { opacidad: v })} formato={(v) => `${Math.round(v * 100)}%`} />
            </div>
          ))}
          {!!capas.length && (
            <p className="text-[10px] text-muted">
              El zoom agranda la capa por encima del cuadro para que al desplazarse no asome el borde.
              Cuanta más profundidad, más zoom hace falta.
            </p>
          )}
        </div>

        <div className="card space-y-2 p-3">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Movimiento
            <input type="range" min={0} max={100} value={fuerza} onChange={(e) => setFuerza(Number(e.target.value))} className="min-w-0 flex-1" />
            <span className="w-8 tabular-nums">{fuerza}%</span>
          </label>
          <div
            ref={caja}
            className="overflow-hidden rounded-xl border border-border bg-black"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              raton.current = {
                x: ((e.clientX - r.left) / r.width - 0.5) * 2,
                y: ((e.clientY - r.top) / r.height - 0.5) * 2,
              };
              encima.current = true;
            }}
            onPointerLeave={() => { encima.current = false; }}
            onDrop={(e) => { e.preventDefault(); void meter(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
          >
            <canvas ref={canvas} className="block h-auto w-full" />
          </div>
          <p className="text-[11px] text-muted">{aviso}</p>
        </div>
      </div>
    </div>
  );
}

function Barra({ etiqueta, valor, min = 0, max, paso, onCambio, formato }: {
  etiqueta: string; valor: number; min?: number; max: number; paso: number;
  onCambio: (v: number) => void; formato: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="w-16 shrink-0">{etiqueta}</span>
      <input type="range" min={min} max={max} step={paso} value={valor}
        onChange={(e) => onCambio(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}

const cargar = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("imagen ilegible"));
    i.src = url;
  });

function hacerCapa(nombre: string, img: HTMLImageElement, i: number): CapaImg {
  return {
    id: `c${++contador}`, nombre, img,
    depth: 0, visible: true, escala: 1, opacidad: 1,
  };
}

// Profundidades repartidas de atrás hacia delante, con su zoom. Es un punto de
// partida razonable: quien monta la escena ya sabe el orden en que la cargó, y
// tener que poner cinco números a mano antes de ver nada desanima.
function repartirProfundidad(cs: CapaImg[]): CapaImg[] {
  return cs.map((c, i) => {
    const d = cs.length === 1 ? 0 : (i / (cs.length - 1)) ** 1.4;
    return { ...c, depth: Math.round(d * 100) / 100, escala: 1 + d * 0.12 };
  });
}
