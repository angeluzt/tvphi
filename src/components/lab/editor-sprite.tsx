"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Crosshair, Eraser,
  Eye, EyeOff, Loader2, Move, RotateCcw, Shuffle, SlidersHorizontal, Trash2, Undo2,
} from "lucide-react";
import { cargarImagen } from "@/lib/lab/quitar-fondo";
import {
  cajaDe, desplazamientoParaCentrar, fotogramaDeLienzo,
  type CeldaSprite, type Fotograma,
} from "@/lib/lab/sprites";
import {
  aQueSeParece, duplicar, invertir, mover as moverEnLista, quitar,
} from "@/lib/lab/orden-fotogramas";
import { RangoPreciso } from "./rango-preciso";

// Editor de los cuadros que salen de una hoja de sprites.
//
// El recorte automatico puede separar bien las celdas y aun asi dejar tres
// problemas que solo una persona puede decidir: que el cuerpo este descentrado
// en UN cuadro, que el modelo haya inventado una mancha, y —el mas comun— que
// los cuadros esten BIEN DIBUJADOS PERO EN MAL ORDEN: el paso 3 antes que el 2,
// o la misma pose repetida dos veces. Antes eso obligaba a tirar la imagen y
// volver a generarla, a pagarla otra vez, para arreglar algo que ya estaba
// dibujado. Aqui se corrige antes de componer la tira que se guarda.
//
// CADA CUADRO ARRASTRA SU CELDA. El fotograma recortado y la celda de la hoja
// de la que salio se guardan los dos, y la ruta rechaza el sprite si no hay
// tantas celdas como fotogramas. Moviendo uno sin el otro el sprite se veria
// bien en la tira y se recortaria mal al reabrirlo, un dia despues y sin forma
// de relacionarlo con esto. Por eso la celda viaja DENTRO del cuadro.

interface CuadroEditable {
  id: string;
  original: Fotograma;
  /** La celda de la hoja de la que se recorto. Viaja pegada al cuadro. */
  celda: CeldaSprite;
  /** PNG editable, todavia sin aplicar x/y. */
  fuente: string;
  ancho: number;
  alto: number;
  x: number;
  y: number;
}

/** Contador para que duplicar un cuadro no repita la clave de React. */
let siguienteId = 0;

/** Lado de la miniatura con la que se comparan dos cuadros. */
const LADO_FIRMA = 16;

/**
 * Cuántos de esos 256 puntos pueden diferir y aún llamarse la misma pose.
 *
 * Es DELIBERADAMENTE tacaño —un 2%—. Equivocarse por marcar de menos es que
 * falte un aviso que era una comodidad; equivocarse por marcar de más pinta un
 * «= 1» en los seis cuadros de un ciclo perfectamente correcto, y entonces el
 * aviso no dice nada y encima da miedo. Con 8×8 pasaba justo eso: una pierna
 * que se mueve nueve píxeles no llegaba a cambiar de casilla.
 */
const UMBRAL_FIRMA = 6;

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

/**
 * La firma visual de un cuadro: su silueta reducida a 16×16 claro/oscuro.
 *
 * Sirve para avisar de poses repetidas. Comparar los PNG byte a byte no vale:
 * cuando el modelo repite una pose casi nunca la dibuja idéntica —mueve un
 * píxel del pelo y ya son dos imágenes distintas—, así que el aviso no saltaría
 * nunca. Se mira el alfa porque lo que distingue una pose de otra es la
 * silueta, no el color.
 */
async function firmaVisual(src: string): Promise<string> {
  const im = await cargarImagen(src);
  const n = LADO_FIRMA * LADO_FIRMA;
  const cv = crearLienzo(LADO_FIRMA, LADO_FIRMA);
  const c = cv.getContext("2d")!;
  c.drawImage(im, 0, 0, LADO_FIRMA, LADO_FIRMA);
  const d = c.getImageData(0, 0, LADO_FIRMA, LADO_FIRMA).data;
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    const alfa = d[i * 4 + 3] / 255;
    v.push((d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) * alfa);
  }
  const media = v.reduce((s, x) => s + x, 0) / n;
  return v.map((x) => (x > media ? "1" : "0")).join("");
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
  celdasIniciales,
  onChange,
}: {
  fotosIniciales: Fotograma[];
  /** Una por fotograma, en el mismo orden. Se devuelven reordenadas igual. */
  celdasIniciales: CeldaSprite[];
  onChange: (fotos: Fotograma[], celdas: CeldaSprite[]) => Promise<void> | void;
}) {
  const [cuadros, setCuadros] = useState<CuadroEditable[]>(() => fotosIniciales.map((f, i) => ({
    id: `c${siguienteId++}`,
    original: f,
    // Si faltara alguna celda —un ZIP viejo, una tira sin rejilla— se inventa
    // una del tamaño del fotograma en vez de dejar el hueco: un par a medias
    // hace que la ruta rechace el sprite entero al guardarlo.
    celda: celdasIniciales[i] ?? { x: 0, y: 0, ancho: f.ancho, alto: f.alto },
    fuente: f.url,
    ancho: f.ancho,
    alto: f.alto,
    x: 0,
    y: 0,
  })));
  const [firmas, setFirmas] = useState<Record<string, string>>({});
  const [elegido, setElegido] = useState(0);
  const [modo, setModo] = useState<"mover" | "borrar">("mover");
  const [pincel, setPincel] = useState(24);
  const [fantasma, setFantasma] = useState(true);
  const [avanzado, setAvanzado] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<CuadroEditable[][]>([]);

  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const anteriorRef = useRef<HTMLImageElement | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  const revisionRef = useRef(0);

  const actual = cuadros[elegido];
  // Cuántos cuadros admite la tira. Son DOS topes, y manda el más bajo: la
  // ruta guarda hasta 24, y además la tira no puede pasar de 16384 px de
  // ancho. Se comprueba aquí para no dejar duplicar algo que el servidor
  // rechazaría después, con el trabajo ya hecho.
  const anchoCuadro = Math.max(1, ...cuadros.map((q) => q.ancho));
  const topeCuadros = Math.max(1, Math.min(24, Math.floor(16384 / anchoCuadro)));
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

  // Las firmas se calculan aparte y sin prisa: sirven solo para AVISAR de una
  // pose repetida, así que si tardan no debe pararse nada. Se guardan por
  // fuente para no rehacerlas al reordenar, que es justo cuando más se usan.
  useEffect(() => {
    let vivo = true;
    const faltan = cuadros.map((q) => q.fuente).filter((f) => !(f in firmas));
    if (!faltan.length) return;
    void Promise.all([...new Set(faltan)].map(async (f) => [f, await firmaVisual(f)] as const))
      .then((pares) => {
        if (vivo) setFirmas((prev) => ({ ...prev, ...Object.fromEntries(pares) }));
      })
      .catch(() => { /* sin firmas simplemente no se avisa de repetidos */ });
    return () => { vivo = false; };
  }, [cuadros, firmas]);

  // Mientras falte una sola firma no se señala nada: media comparación diría
  // «el 4 es nuevo» cuando lo que pasa es que aún no se ha mirado.
  const todasLasFirmas = cuadros.map((q) => firmas[q.fuente]);
  const parecidoA: (number | null)[] = todasLasFirmas.every(Boolean)
    ? aQueSeParece(todasLasFirmas, UMBRAL_FIRMA)
    : cuadros.map(() => null);

  async function publicar(nuevos: CuadroEditable[]) {
    const revision = ++revisionRef.current;
    setProcesando(true);
    setError(null);
    try {
      const fotos = await materializar(nuevos);
      if (revision !== revisionRef.current) return;
      await onChange(fotos, nuevos.map((q) => q.celda));
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
    const nuevos = moverEnLista(cuadros, elegido, paso);
    // La misma lista significa que no se movió: recomponer la tira cuesta, y
    // hacerlo para nada deja el aviso «corregidos» sin que se haya corregido.
    if (nuevos === cuadros) return;
    setElegido(elegido + paso);
    aplicar(nuevos);
  }

  /** Borra el cuadro elegido. Nunca deja el sprite sin ninguno. */
  function borrarCuadro() {
    const nuevos = quitar(cuadros, elegido);
    if (nuevos === cuadros) return;
    setElegido(Math.min(elegido, nuevos.length - 1));
    aplicar(nuevos);
  }

  /** Repite el cuadro elegido justo detrás: alarga una pose sin dibujar nada. */
  function duplicarCuadro() {
    const nuevos = duplicar(cuadros, elegido, topeCuadros)
      .map((q, i) => (i === elegido + 1 && q === cuadros[elegido] ? { ...q, id: `c${siguienteId++}` } : q));
    if (nuevos.length === cuadros.length) {
      setError(`No caben más de ${topeCuadros} cuadros en una tira.`);
      return;
    }
    setElegido(elegido + 1);
    aplicar(nuevos);
  }

  /** Da la vuelta al ciclo entero: el «vuelve por donde vino» en un clic. */
  function invertirOrden() {
    const nuevos = invertir(cuadros);
    if (nuevos === cuadros) return;
    setElegido(cuadros.length - 1 - elegido);
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
            Cambia el orden o borra cuadros abajo. Arrastra para centrar y, en «Borrar»,
            pinta sobre lo que sobra. Si falta una pata, vuelve al paso 1.
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted">
          {procesando && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
          Cuadro {elegido + 1}/{cuadros.length} · x {actual.x} · y {actual.y}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {cuadros.map((q, i) => (
          <button
            type="button"
            key={q.id}
            onClick={() => setElegido(i)}
            className={`relative h-14 shrink-0 overflow-hidden rounded-md border bg-surface-2 ${i === elegido ? "border-accent ring-1 ring-accent" : parecidoA[i] !== null ? "border-gold" : "border-border"}`}
            style={{ aspectRatio: `${q.ancho}/${q.alto}` }}
            aria-label={`Elegir fotograma ${i + 1}${parecidoA[i] !== null ? `, igual que el ${parecidoA[i]! + 1}` : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.fuente}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              style={{ transform: `translate(${q.x / q.ancho * 100}%, ${q.y / q.alto * 100}%)` }}
            />
            <span className="absolute left-0 top-0 rounded-br bg-black/70 px-1 text-[9px] text-white">{i + 1}</span>
            {/* Una pose que el modelo dibujó dos veces. Se avisa, no se borra
                sola: repetir un cuadro a propósito es una pausa válida. */}
            {parecidoA[i] !== null && (
              <span className="absolute bottom-0 right-0 rounded-tl bg-gold px-1 text-[9px] font-semibold text-black">
                = {parecidoA[i]! + 1}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reordenar y borrar, a la vista y no escondido en «Más ajustes»: que un
          cuadro salga fuera de sitio o repetido es lo que más pasa, y el arreglo
          tiene que estar donde se ven las miniaturas. */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface/50 p-1.5">
        <span className="w-full text-[10px] text-muted">
          Orden del cuadro {elegido + 1} de {cuadros.length}
          {parecidoA[elegido] !== null && (
            <span className="text-gold"> · repite la pose del {parecidoA[elegido]! + 1}</span>
          )}
        </span>
        <button type="button" onClick={() => cambiarOrden(-1)} disabled={elegido === 0 || procesando}
          className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40" aria-label="Mover el cuadro antes">
          <ArrowLeft className="h-3 w-3" /> Antes
        </button>
        <button type="button" onClick={() => cambiarOrden(1)} disabled={elegido === cuadros.length - 1 || procesando}
          className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40" aria-label="Mover el cuadro después">
          Después <ArrowRight className="h-3 w-3" />
        </button>
        <button type="button" onClick={duplicarCuadro} disabled={cuadros.length >= topeCuadros || procesando}
          className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40" aria-label="Duplicar el cuadro"
          title="Repite este cuadro detrás, para alargar la pose">
          <Copy className="h-3 w-3 text-accent" /> Duplicar
        </button>
        <button type="button" onClick={invertirOrden} disabled={cuadros.length < 2 || procesando}
          className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40" aria-label="Invertir el orden de los cuadros">
          <Shuffle className="h-3 w-3 text-brand" /> Invertir
        </button>
        <button type="button" onClick={borrarCuadro} disabled={cuadros.length < 2 || procesando}
          className="btn-ghost ml-auto px-2 py-1 text-[10px] text-danger disabled:opacity-40"
          aria-label="Borrar el cuadro"
          title={cuadros.length < 2 ? "Un sprite necesita al menos un cuadro" : "Quita este cuadro de la animación"}>
          <Trash2 className="h-3 w-3" /> Borrar cuadro
        </button>
      </div>

      <div className="sticky top-12 z-20 grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface/95 p-1 backdrop-blur lg:static lg:grid-cols-2">
        <button type="button" onClick={() => setModo("mover")}
          className={modo === "mover" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <Move className="h-3.5 w-3.5" /> Mover
        </button>
        <button type="button" onClick={() => setModo("borrar")}
          className={modo === "borrar" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <Eraser className="h-3.5 w-3.5" /> Borrar
        </button>
        <button type="button" onClick={() => setAvanzado((v) => !v)}
          className="btn-ghost px-2 py-1 text-xs lg:hidden">
          <SlidersHorizontal className="h-3.5 w-3.5" /> {avanzado ? "Ocultar" : "Más ajustes"}
        </button>
      </div>

      {modo === "borrar" && (
        <label className="block rounded-lg border border-border bg-surface/50 p-2">
          <span className="text-[10px] text-muted">Pincel: {pincel}px</span>
          <RangoPreciso valor={Math.min(pincel, maxPincel)} min={2} max={maxPincel} paso={1}
            onCambio={setPincel} etiqueta="pincel" className="mt-1" />
        </label>
      )}

      <div className="grid grid-cols-2 gap-1 lg:hidden">
        <button type="button" onClick={() => void centrarUno()} disabled={procesando}
          className="btn-ghost px-2 py-1 text-xs">
          <Crosshair className="h-3.5 w-3.5 text-accent" /> Centrar este
        </button>
        <button type="button" onClick={() => void centrarTodos()} disabled={procesando}
          className="btn-ghost px-2 py-1 text-xs">
          <Crosshair className="h-3.5 w-3.5 text-brand" /> Centrar todos
        </button>
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
            className={`max-h-[52vh] max-w-full touch-none rounded lg:max-h-[28rem] ${modo === "mover" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
            aria-label={`Editar fotograma ${elegido + 1}`}
          />
        </div>

        <div className={`${avanzado ? "space-y-2" : "hidden"} lg:block lg:space-y-2`}>
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
        </div>
      </div>

      {error && <p className="text-[10px] text-danger">{error}</p>}

    </div>
  );
}
