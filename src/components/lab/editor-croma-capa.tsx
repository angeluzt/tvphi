"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, Droplets, MousePointer2, RotateCcw, SquareDashed, Undo2, X,
} from "lucide-react";
import {
  cargarImagen, colorDominanteEnArea, parseHex, quitarColorDePixeles,
} from "@/lib/lab/quitar-fondo";

type RGB = [number, number, number];
type Punto = { x: number; y: number };
type Gesto = { puntero: number; inicio: Punto; fin: Punto };

export interface CromaCorregido {
  url: string;
  vacio: number;
  colores: RGB[];
  eliminados: number;
}

const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function puntoCanvas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
  const r = e.currentTarget.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / Math.max(1, r.width)) * e.currentTarget.width,
    y: ((e.clientY - r.top) / Math.max(1, r.height)) * e.currentTarget.height,
  };
}

export function EditorCromaCapa({
  nombre,
  url,
  colorInicial = "#FF00FF",
  onCerrar,
  onAplicar,
}: {
  nombre: string;
  url: string;
  colorInicial?: string;
  onCerrar: () => void;
  onAplicar: (resultado: CromaCorregido) => Promise<void> | void;
}) {
  const inicial = parseHex(colorInicial) ?? [255, 0, 255] as RGB;
  const [modo, setModo] = useState<"punto" | "area">("punto");
  const [colores, setColores] = useState<RGB[]>([inicial]);
  const [gesto, setGesto] = useState<Gesto | null>(null);
  const [revision, setRevision] = useState(0);
  const [listo, setListo] = useState(false);
  const [mostrarOriginal, setMostrarOriginal] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ vacio: 0, eliminados: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  const trabajoRef = useRef<ImageData | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarImagen(url).then((img) => {
      if (!vivo) return;
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const c = cv.getContext("2d", { willReadFrequently: true })!;
      c.drawImage(img, 0, 0);
      originalRef.current = c.getImageData(0, 0, cv.width, cv.height);
      setListo(true);
    }).catch(() => setError("No se pudo abrir esta capa."));
    return () => { vivo = false; };
  }, [url]);

  const recalcular = useCallback((seleccionados: RGB[]) => {
    const original = originalRef.current;
    if (!original) return;
    const datos = new Uint8ClampedArray(original.data);
    let eliminados = 0;
    for (const color of seleccionados) {
      eliminados += quitarColorDePixeles(datos, original.width, original.height, color).eliminados;
    }
    let vacios = 0;
    for (let i = 3; i < datos.length; i += 4) if (datos[i] < 16) vacios++;
    trabajoRef.current = new ImageData(datos, original.width, original.height);
    setStats({ vacio: vacios / Math.max(1, original.width * original.height), eliminados });
    setRevision((v) => v + 1);
  }, []);

  useEffect(() => {
    if (listo) recalcular(colores);
  }, [colores, listo, recalcular]);

  useEffect(() => {
    const cv = canvasRef.current;
    const imagen = mostrarOriginal ? originalRef.current : trabajoRef.current;
    if (!cv || !imagen) return;
    if (cv.width !== imagen.width || cv.height !== imagen.height) {
      cv.width = imagen.width; cv.height = imagen.height;
    }
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.putImageData(imagen, 0, 0);
    if (gesto) {
      c.save();
      c.strokeStyle = "#22d3ee";
      c.lineWidth = Math.max(2, Math.min(cv.width, cv.height) / 400);
      c.setLineDash([12, 8]);
      c.strokeRect(
        gesto.inicio.x, gesto.inicio.y,
        gesto.fin.x - gesto.inicio.x, gesto.fin.y - gesto.inicio.y,
      );
      c.restore();
    }
  }, [gesto, mostrarOriginal, revision]);

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [onCerrar]);

  function agregar(color: RGB | null) {
    if (!color) return;
    setColores((actuales) => {
      if (actuales.some((c) => Math.hypot(c[0] - color[0], c[1] - color[1], c[2] - color[2]) < 8)) {
        return actuales;
      }
      return [...actuales, color];
    });
  }

  function seleccionarPunto(p: Punto) {
    const original = originalRef.current;
    if (!original) return;
    agregar(colorDominanteEnArea(
      original.data, original.width, original.height,
      { x: p.x - 5, y: p.y - 5 }, { x: p.x + 5, y: p.y + 5 },
    ));
  }

  async function aplicar() {
    const imagen = trabajoRef.current;
    if (!imagen) return;
    setAplicando(true); setError(null);
    try {
      const cv = document.createElement("canvas");
      cv.width = imagen.width; cv.height = imagen.height;
      cv.getContext("2d")!.putImageData(imagen, 0, 0);
      await onAplicar({
        url: cv.toDataURL("image/png"),
        vacio: stats.vacio,
        colores,
        eliminados: stats.eliminados,
      });
    } catch (e) {
      setError((e as Error).message || "No se pudo aplicar la limpieza.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog" aria-modal="true" aria-label={`Corregir fondo de ${nombre}`}>
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Droplets className="h-4 w-4 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Corregir fondo · {nombre}</p>
            <p className="text-[10px] text-muted">Toca el rosa o encierra una zona; la vista cambia al instante.</p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost px-2 py-1" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
          <button type="button" onClick={() => setModo("punto")}
            className={modo === "punto" ? "btn-brand text-[10px]" : "btn-ghost text-[10px]"}>
            <MousePointer2 className="h-3.5 w-3.5" /> Tocar color
          </button>
          <button type="button" onClick={() => setModo("area")}
            className={modo === "area" ? "btn-brand text-[10px]" : "btn-ghost text-[10px]"}>
            <SquareDashed className="h-3.5 w-3.5" /> Seleccionar área
          </button>
          <button type="button" onClick={() => agregar([255, 0, 255])} className="btn-ghost text-[10px]">
            <span className="h-3.5 w-3.5 rounded-sm border border-white/50 bg-[#ff00ff]" /> Magenta estándar
          </button>
          <button type="button" onClick={() => setColores((c) => c.slice(0, -1))}
            disabled={!colores.length} className="btn-ghost text-[10px] disabled:opacity-30">
            <Undo2 className="h-3.5 w-3.5" /> Deshacer color
          </button>
          <button type="button" onClick={() => setColores([])} className="btn-ghost text-[10px]">
            <RotateCcw className="h-3.5 w-3.5" /> Original
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
            <input type="checkbox" checked={mostrarOriginal} onChange={(e) => setMostrarOriginal(e.target.checked)} />
            Ver original
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(#222_0_25%,#303030_0_50%)] bg-[length:18px_18px] p-1">
          {!listo && !error && <p className="p-8 text-center text-xs text-muted">Abriendo capa…</p>}
          <canvas
            ref={canvasRef}
            className={`block h-auto max-h-[65vh] w-full touch-none object-contain ${modo === "punto" ? "cursor-crosshair" : "cursor-cell"}`}
            onPointerDown={(e) => {
              if (!listo) return;
              const p = puntoCanvas(e);
              e.currentTarget.setPointerCapture(e.pointerId);
              if (modo === "punto") seleccionarPunto(p);
              else setGesto({ puntero: e.pointerId, inicio: p, fin: p });
            }}
            onPointerMove={(e) => {
              if (!gesto || gesto.puntero !== e.pointerId) return;
              setGesto({ ...gesto, fin: puntoCanvas(e) });
            }}
            onPointerUp={(e) => {
              if (!gesto || gesto.puntero !== e.pointerId) return;
              const fin = puntoCanvas(e);
              const original = originalRef.current;
              if (original) agregar(colorDominanteEnArea(
                original.data, original.width, original.height, gesto.inicio, fin,
              ));
              setGesto(null);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => setGesto(null)}
          />
        </div>

        <div className="space-y-2 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted">Colores marcados:</span>
            {colores.length === 0 && <span className="text-[10px] text-muted">ninguno</span>}
            {colores.map((c, i) => (
              <span key={`${hex(c)}-${i}`} className="chip gap-1 bg-surface-2 text-[9px] text-muted">
                <span className="h-3 w-3 rounded-sm border border-white/30" style={{ backgroundColor: hex(c) }} />
                {hex(c)}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-accent">
              {Math.round(stats.vacio * 1000) / 10}% transparente · {stats.eliminados.toLocaleString("es-MX")} píxeles corregidos
            </span>
          </div>
          <p className="text-[10px] leading-snug text-muted">
            Selecciona únicamente el color de fondo. Si algo importante desaparece, usa “Deshacer color” antes de aplicar.
          </p>
          {error && <p className="text-[10px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className="btn-ghost text-xs">Cancelar</button>
            <button type="button" onClick={() => void aplicar()} disabled={!listo || aplicando} className="btn-brand text-xs">
              <Check className="h-3.5 w-3.5" /> {aplicando ? "Aplicando…" : "Aplicar corrección"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
