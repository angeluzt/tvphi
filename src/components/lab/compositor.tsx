"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Play, Pause, Crosshair, Download, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  Package, FolderOpen, Loader2,
} from "lucide-react";
import { bajar } from "@/lib/lab/exportar";
import { bajarMontajeZip, leerMontajeZip } from "@/lib/lab/montaje-zip";
import { ANIM_OPCIONES, camaraAnim, type AnimParalaje } from "@/lib/lab/anim-paralaje";

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
  /** Cómo se consiguió el fondo transparente, si vino de la IA. */
  via?: "transparente" | "croma" | "opaca";
  vacio?: number;
}

export interface Semilla {
  nombre: string;
  url: string;
  via?: CapaImg["via"];
  vacio?: number;
}

let contador = 0;

export function Compositor({ semilla }: { semilla?: Semilla[] }) {
  const [capas, setCapas] = useState<CapaImg[]>([]);
  const [moviendo, setMoviendo] = useState(true);
  const [fuerza, setFuerza] = useState(55);
  const [anim, setAnim] = useState<AnimParalaje>("suave");
  const [aviso, setAviso] = useState("Carga primero el fondo y luego las capas PNG con transparencia.");
  const [busyZip, setBusyZip] = useState<"bajar" | "subir" | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const raton = useRef({ x: 0, y: 0 });
  const encima = useRef(false);
  const tam = useRef({ w: 1920, h: 1080 });
  const animRef = useRef(anim);
  const fuerzaRef = useRef(fuerza);
  const moviendoRef = useRef(moviendo);
  animRef.current = anim;
  fuerzaRef.current = fuerza;
  moviendoRef.current = moviendo;

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

  async function exportarZip() {
    if (!capas.length || busyZip) return;
    setBusyZip("bajar");
    try {
      await bajarMontajeZip({
        width: tam.current.w,
        height: tam.current.h,
        capas: capas.map((c) => ({
          nombre: c.nombre,
          depth: c.depth,
          escala: c.escala,
          opacidad: c.opacidad,
          via: c.via,
          vacio: c.vacio,
          img: c.img,
        })),
      });
      setAviso(`ZIP con ${capas.length} capas y montaje.json listo.`);
    } catch (e) {
      setAviso((e as Error).message || "No se pudo crear el ZIP.");
    } finally {
      setBusyZip(null);
    }
  }

  async function importarZip(file: File | null) {
    if (!file || busyZip) return;
    setBusyZip("subir");
    try {
      const pack = await leerMontajeZip(file);
      const nuevas: CapaImg[] = [];
      for (const c of pack.capas) {
        const img = await cargar(c.url);
        nuevas.push({
          ...hacerCapa(c.nombre, img, nuevas.length),
          depth: c.depth,
          escala: c.escala,
          opacidad: c.opacidad,
          via: c.via,
          vacio: c.vacio,
        });
      }
      if (!nuevas.length) throw new Error("El ZIP no trae capas.");
      // Tamaño del pack; si faltaba, el de la primera imagen.
      tam.current = {
        w: pack.width || nuevas[0].img.naturalWidth,
        h: pack.height || nuevas[0].img.naturalHeight,
      };
      if (!pack.width || !pack.height) {
        tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      }
      setCapas(nuevas);
      setAviso(`Importadas ${nuevas.length} capas del ZIP.`);
    } catch (e) {
      setAviso((e as Error).message || "No se pudo importar el ZIP.");
    } finally {
      setBusyZip(null);
    }
  }

  // Cargar las capas del mapa directamente, sin pasar por el disco: sirve para
  // ver cómo se moverá la escena antes de gastar nada en generar imágenes.
  useEffect(() => {
    if (!semilla?.length) return;
    let vivo = true;
    (async () => {
      const nuevas: CapaImg[] = [];
      for (const s of semilla) {
        try {
          nuevas.push({ ...hacerCapa(s.nombre, await cargar(s.url), nuevas.length), via: s.via, vacio: s.vacio });
        } catch {}
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

    const k = (fuerzaRef.current / 100) * 0.08;
    let ox = 0, oy = 0, zoom = 1;
    if (moviendoRef.current) {
      if (encima.current) {
        ox = raton.current.x * k;
        oy = raton.current.y * k * 0.5;
        zoom = 1;
      } else {
        ({ ox, oy, zoom } = camaraAnim(animRef.current, ms, k));
      }
    }

    for (const capa of capas) {
      if (!capa.visible) continue;
      const e = capa.escala * zoom;
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

  const pistaAnim = ANIM_OPCIONES.find((o) => o.id === anim)?.pista;

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
        <button onClick={() => void exportarZip()} disabled={!capas.length || !!busyZip} className="btn-ghost text-xs">
          {busyZip === "bajar" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <Package className="h-3.5 w-3.5 text-accent" />}
          Descargar ZIP
        </button>
        <label className={`btn-ghost cursor-pointer text-xs ${busyZip ? "pointer-events-none opacity-50" : ""}`}>
          {busyZip === "subir" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <FolderOpen className="h-3.5 w-3.5 text-accent" />}
          Importar ZIP
          <input
            type="file" accept=".zip,application/zip" className="hidden"
            onChange={(e) => { void importarZip(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
        </label>
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
              con transparencia, o taparán a las de atrás. También puedes importar un ZIP de un montaje previo.
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
              {c.via && (
                <p className={`text-[10px] ${c.via === "opaca" && i > 0 ? "text-gold" : "text-muted"}`}>
                  {c.via === "transparente" && "vino con transparencia"}
                  {c.via === "croma" && "se le quitó el color de fondo"}
                  {c.via === "opaca" && (i === 0 ? "fondo opaco, como debe ser" : "opaca y sin fondo plano que quitar: tapará a las de atrás")}
                  {typeof c.vacio === "number" ? ` · ${Math.round(c.vacio * 100)}% vacío` : ""}
                </p>
              )}
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted">
              Animación
              <select
                value={anim}
                onChange={(e) => setAnim(e.target.value as AnimParalaje)}
                className="input min-w-0 flex-1 py-1 text-[11px]"
                aria-label="Tipo de movimiento de cámara"
              >
                {ANIM_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          {pistaAnim && <p className="text-[10px] text-muted">{pistaAnim}. Con el ratón encima mandas tú.</p>}
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Fuerza
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
            onDrop={(e) => {
              e.preventDefault();
              const z = Array.from(e.dataTransfer.files).find((f) => /\.zip$/i.test(f.name));
              if (z) void importarZip(z);
              else void meter(e.dataTransfer.files);
            }}
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
