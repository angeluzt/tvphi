"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Eraser,
  Eye, EyeOff, Loader2, Move, RotateCcw, Undo2,
} from "lucide-react";
import { cargarImagen } from "@/lib/lab/quitar-fondo";
import {
  cajaDe, desplazamientoParaCentrar, fotogramaDeLienzo, type Fotograma,
} from "@/lib/lab/sprites";

// Editor de los cuadros que salen de una hoja de sprites.
//
// El recorte automatico puede separar bien las celdas y aun asi dejar dos
// problemas que solo una persona puede decidir: que el cuerpo este descentrado
// en UN cuadro, o que el modelo haya inventado una mancha. Aqui se corrigen
// antes de componer la tira que se guarda en la biblioteca.

interface CuadroEditable {
  id: string;
  original: Fotograma;
  /** PNG editable, todavia sin aplicar x/y. */
  fuente: string;
  ancho: number;
  alto: number;
  x: number;
  y: number;
}

type Gesto =
  | {
    tipo: "mover";
    puntero: number;
    inicioX: number;
    inicioY: number;
    baseX: number;
    baseY: number;
    x: number;
    y: number;
    antes: CuadroEditable[];
  }
  | {
    tipo: "borrar";
    puntero: number;
    ultimoX: number;
    ultimoY: number;
    trabajo: HTMLCanvasElement;
    antes: CuadroEditable[];
  };

const crearLienzo = (ancho: number, alto: number) => {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(ancho));
  cv.height = Math.max(1, Math.round(alto));
  return cv;
};

function pintarTablero(c: CanvasRenderingContext2D, ancho: number, alto: number) {
  const p = Math.max(6, Math.round(Math.min(ancho, alto) / 24));
  for (let y = 0; y < alto; y += p) {
    for (let x = 0; x < ancho; x += p) {
      c.fillStyle = ((x / p + y / p) % 2 === 0) ? "#171d20" : "#0f1416";
      c.fillRect(x, y, p, p);
    }
  }
}

function puntoEnLienzo(e: React.PointerEvent<HTMLCanvasElement>) {
  const cv = e.currentTarget;
  const r = cv.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * cv.width / Math.max(1, r.width),
    y: (e.clientY - r.top) * cv.height / Math.max(1, r.height),
  };
}

function borrarTrazo(
  cv: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tam: number,
) {
  const c = cv.getContext("2d")!;
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = tam;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1 + 0.01, y1 + 0.01);
  c.stroke();
  c.restore();
}

async function materializar(cuadros: CuadroEditable[]): Promise<Fotograma[]> {
  return Promise.all(cuadros.map(async (q) => {
    const im = await cargarImagen(q.fuente);
    const cv = crearLienzo(q.ancho, q.alto);
    cv.getContext("2d")!.drawImage(im, q.x, q.y);
    return fotogramaDeLienzo(cv);
  }));
}

async function centroDe(q: CuadroEditable) {
  const im = await cargarImagen(q.fuente);
  const cv = crearLienzo(q.ancho, q.alto);
  const c = cv.getContext("2d")!;
  c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const caja = cajaDe(d, cv.width, cv.height);
  return caja ? desplazamientoParaCentrar(caja, cv.width, cv.height) : { x: 0, y: 0 };
}

export function EditorSprite({
  fotosIniciales,
  onChange,
}: {
  fotosIniciales: Fotograma[];
  onChange: (fotos: Fotograma[]) => Promise<void> | void;
}) {
  const [cuadros, setCuadros] = useState<CuadroEditable[]>(() => fotosIniciales.map((f, i) => ({
    id: `${i}-${f.ancho}x${f.alto}`,
    original: f,
    fuente: f.url,
    ancho: f.ancho,
    alto: f.alto,
    x: 0,
    y: 0,
  })));
  const [elegido, setElegido] = useState(0);
  const [modo, setModo] = useState<"mover" | "borrar">("mover");
  const [pincel, setPincel] = useState(24);
  const [fantasma, setFantasma] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<CuadroEditable[][]>([]);

  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const anteriorRef = useRef<HTMLImageElement | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  const revisionRef = useRef(0);

  const actual = cuadros[elegido];
  const anterior = cuadros.length > 1
    ? cuadros[(elegido - 1 + cuadros.length) % cuadros.length]
    : null;

  const pintar = useCallback((fuente?: CanvasImageSource, posicion?: { x: number; y: number }) => {
    const cv = lienzoRef.current;
    const q = cuadros[elegido];
    if (!cv || !q) return;
    if (cv.width !== q.ancho || cv.height !== q.alto) {
      cv.width = q.ancho;
      cv.height = q.alto;
    }
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    pintarTablero(c, cv.width, cv.height);

    if (fantasma && anterior && anteriorRef.current) {
      c.save();
      c.globalAlpha = 0.22;
      c.drawImage(anteriorRef.current, anterior.x, anterior.y);
      c.restore();
    }

    const im = fuente ?? imagenRef.current;
    if (im) c.drawImage(im, posicion?.x ?? q.x, posicion?.y ?? q.y);

    // Cruz central: es la referencia estable que permite ver el salto aunque
    // las alas, patas o humo cambien mucho de forma entre cuadros.
    c.save();
    c.strokeStyle = "rgba(251,146,60,.72)";
    c.lineWidth = Math.max(1, Math.min(cv.width, cv.height) / 500);
    c.setLineDash([Math.max(4, cv.width / 80), Math.max(4, cv.width / 80)]);
    c.beginPath();
    c.moveTo(cv.width / 2, 0); c.lineTo(cv.width / 2, cv.height);
    c.moveTo(0, cv.height / 2); c.lineTo(cv.width, cv.height / 2);
    c.stroke();
    c.restore();
  }, [anterior, cuadros, elegido, fantasma]);

  useEffect(() => {
    let vivo = true;
    imagenRef.current = null;
    anteriorRef.current = null;
    if (!actual) return;

    const cargas: Promise<void>[] = [
      cargarImagen(actual.fuente).then((im) => { if (vivo) imagenRef.current = im; }),
    ];
    if (fantasma && anterior) {
      cargas.push(cargarImagen(anterior.fuente).then((im) => { if (vivo) anteriorRef.current = im; }));
    }
    Promise.all(cargas).then(() => { if (vivo) pintar(); }).catch(() => {
      if (vivo) setError("No se pudo abrir uno de los fotogramas.");
    });
    return () => { vivo = false; };
  }, [actual, anterior, fantasma, pintar]);

  async function publicar(nuevos: CuadroEditable[]) {
    const revision = ++revisionRef.current;
    setProcesando(true);
    setError(null);
    try {
      const fotos = await materializar(nuevos);
      if (revision !== revisionRef.current) return;
      await onChange(fotos);
    } catch (e) {
      if (revision === revisionRef.current) {
        setError((e as Error).message || "No se pudo aplicar la corrección.");
      }
    } finally {
      if (revision === revisionRef.current) setProcesando(false);
    }
  }

  function aplicar(nuevos: CuadroEditable[], antes = cuadros) {
    setHistorial((h) => [...h.slice(-19), antes]);
    setCuadros(nuevos);
    void publicar(nuevos);
  }

  function deshacer() {
    const previos = historial[historial.length - 1];
    if (!previos) return;
    setHistorial((h) => h.slice(0, -1));
    setCuadros(previos);
    setElegido((i) => Math.min(i, previos.length - 1));
    void publicar(previos);
  }

  function mover(dx: number, dy: number) {
    aplicar(cuadros.map((q, i) => i === elegido ? { ...q, x: q.x + dx, y: q.y + dy } : q));
  }

  async function centrarUno() {
    if (!actual) return;
    setProcesando(true);
    try {
      const p = await centroDe(actual);
      aplicar(cuadros.map((q, i) => i === elegido ? { ...q, ...p } : q));
    } catch (e) {
      setError((e as Error).message);
      setProcesando(false);
    }
  }

  async function centrarTodos() {
    setProcesando(true);
    try {
      const centros = await Promise.all(cuadros.map(centroDe));
      aplicar(cuadros.map((q, i) => ({ ...q, ...centros[i] })));
    } catch (e) {
      setError((e as Error).message);
      setProcesando(false);
    }
  }

  function restaurar() {
    if (!actual) return;
    aplicar(cuadros.map((q, i) => i === elegido
      ? { ...q, fuente: q.original.url, x: 0, y: 0 }
      : q));
  }

  function cambiarOrden(paso: -1 | 1) {
    const destino = elegido + paso;
    if (destino < 0 || destino >= cuadros.length) return;
    const nuevos = [...cuadros];
    [nuevos[elegido], nuevos[destino]] = [nuevos[destino], nuevos[elegido]];
    setElegido(destino);
    aplicar(nuevos);
  }

  function alBajar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!actual || !imagenRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = puntoEnLienzo(e);
    if (modo === "mover") {
      gestoRef.current = {
        tipo: "mover", puntero: e.pointerId,
        inicioX: p.x, inicioY: p.y,
        baseX: actual.x, baseY: actual.y,
        x: actual.x, y: actual.y, antes: cuadros,
      };
      return;
    }

    const trabajo = crearLienzo(actual.ancho, actual.alto);
    trabajo.getContext("2d")!.drawImage(imagenRef.current, 0, 0);
    const x = p.x - actual.x, y = p.y - actual.y;
    borrarTrazo(trabajo, x, y, x, y, pincel);
    gestoRef.current = {
      tipo: "borrar", puntero: e.pointerId,
      ultimoX: x, ultimoY: y, trabajo, antes: cuadros,
    };
    pintar(trabajo);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestoRef.current;
    if (!g || g.puntero !== e.pointerId || !actual) return;
    e.preventDefault();
    const p = puntoEnLienzo(e);
    if (g.tipo === "mover") {
      g.x = Math.round(g.baseX + p.x - g.inicioX);
      g.y = Math.round(g.baseY + p.y - g.inicioY);
      pintar(undefined, { x: g.x, y: g.y });
      return;
    }

    const x = p.x - actual.x, y = p.y - actual.y;
    borrarTrazo(g.trabajo, g.ultimoX, g.ultimoY, x, y, pincel);
    g.ultimoX = x; g.ultimoY = y;
    pintar(g.trabajo);
  }

  function terminar(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestoRef.current;
    if (!g || g.puntero !== e.pointerId) return;
    gestoRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (g.tipo === "mover") {
      if (g.x === g.baseX && g.y === g.baseY) { pintar(); return; }
      const nuevos = g.antes.map((q, i) => i === elegido ? { ...q, x: g.x, y: g.y } : q);
      aplicar(nuevos, g.antes);
      return;
    }
    const nuevos = g.antes.map((q, i) => i === elegido
      ? { ...q, fuente: g.trabajo.toDataURL("image/png") }
      : q);
    aplicar(nuevos, g.antes);
  }

  if (!actual) return null;

  const maxPincel = Math.max(32, Math.round(Math.min(actual.ancho, actual.alto) / 3));

  return (
    <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <span className="block text-xs font-semibold text-fg">3 · Corregir y alinear fotogramas</span>
          <span className="block text-[10px] text-muted">
            Arrastra para centrar. En «Borrar», pinta sobre lo que sobra. Si falta una pata, vuelve al paso 1.
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          {procesando && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
          Cuadro {elegido + 1}/{cuadros.length} · x {actual.x} · y {actual.y}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg border border-border bg-black/30 p-2">
          <canvas
            ref={lienzoRef}
            width={actual.ancho}
            height={actual.alto}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            className={`max-h-[28rem] max-w-full touch-none rounded ${modo === "mover" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
            aria-label={`Editar fotograma ${elegido + 1}`}
          />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setModo("mover")}
              className={modo === "mover" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
              <Move className="h-3.5 w-3.5" /> Mover
            </button>
            <button type="button" onClick={() => setModo("borrar")}
              className={modo === "borrar" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
              <Eraser className="h-3.5 w-3.5" /> Borrar
            </button>
          </div>

          {modo === "borrar" && (
            <label className="block rounded-lg border border-border bg-surface/50 p-2">
              <span className="text-[10px] text-muted">Pincel: {pincel}px</span>
              <input type="range" min={2} max={maxPincel} value={Math.min(pincel, maxPincel)}
                onChange={(e) => setPincel(Number(e.target.value))} className="mt-1 w-full" />
            </label>
          )}

          <div className="grid grid-cols-3 gap-1" aria-label="Mover un pixel">
            <span />
            <button type="button" onClick={() => mover(0, -1)} className="btn-ghost px-2 py-1" aria-label="Mover arriba">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <span />
            <button type="button" onClick={() => mover(-1, 0)} className="btn-ghost px-2 py-1" aria-label="Mover izquierda">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => mover(0, 1)} className="btn-ghost px-2 py-1" aria-label="Mover abajo">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => mover(1, 0)} className="btn-ghost px-2 py-1" aria-label="Mover derecha">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button type="button" onClick={() => void centrarUno()} disabled={procesando}
            className="btn-ghost w-full px-2 py-1 text-xs">
            <Crosshair className="h-3.5 w-3.5 text-accent" /> Centrar este
          </button>
          <button type="button" onClick={() => void centrarTodos()} disabled={procesando}
            className="btn-ghost w-full px-2 py-1 text-xs">
            <Crosshair className="h-3.5 w-3.5 text-brand" /> Centrar todos
          </button>
          <button type="button" onClick={() => setFantasma((v) => !v)} className="btn-ghost w-full px-2 py-1 text-xs">
            {fantasma ? <Eye className="h-3.5 w-3.5 text-brand" /> : <EyeOff className="h-3.5 w-3.5" />}
            Cuadro anterior
          </button>

          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={deshacer} disabled={!historial.length}
              className="btn-ghost px-2 py-1 text-[10px]">
              <Undo2 className="h-3 w-3" /> Deshacer
            </button>
            <button type="button" onClick={restaurar} className="btn-ghost px-2 py-1 text-[10px]">
              <RotateCcw className="h-3 w-3" /> Restaurar
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface/50 p-2">
            <span className="block text-[10px] text-muted">Cambiar orden del cuadro</span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button type="button" onClick={() => cambiarOrden(-1)} disabled={elegido === 0}
                className="btn-ghost px-2 py-1 text-[10px]">
                <ArrowLeft className="h-3 w-3" /> Antes
              </button>
              <button type="button" onClick={() => cambiarOrden(1)} disabled={elegido === cuadros.length - 1}
                className="btn-ghost px-2 py-1 text-[10px]">
                Después <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-[10px] text-danger">{error}</p>}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {cuadros.map((q, i) => (
          <button
            type="button"
            key={q.id}
            onClick={() => setElegido(i)}
            className={`relative h-16 shrink-0 overflow-hidden rounded-md border bg-surface-2 ${i === elegido ? "border-accent ring-1 ring-accent" : "border-border"}`}
            style={{ aspectRatio: `${q.ancho}/${q.alto}` }}
            aria-label={`Elegir fotograma ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.fuente}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              style={{ transform: `translate(${q.x / q.ancho * 100}%, ${q.y / q.alto * 100}%)` }}
            />
            <span className="absolute left-0 top-0 rounded-br bg-black/70 px-1 text-[9px] text-white">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
