"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Copy, Crosshair, Loader2,
  Hand, Minimize2, Paintbrush, PenTool, RotateCcw, SquareDashed, Trash2, Undo2,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { cargarImagen, colorDelFondo, huecoDe, parseHex } from "@/lib/lab/quitar-fondo";
import {
  acotarMovimientoSeleccion, seleccionarComponenteHoja, seleccionarLazoHoja,
  seleccionarRectanguloHoja, type MascaraHoja, type PuntoHoja,
} from "@/lib/lab/seleccion-hoja-sprite";
import type { CeldaSprite } from "@/lib/lab/sprites";
import { RangoPreciso } from "./rango-preciso";

type Modo = "navegar" | "automatico" | "rectangulo" | "lazo" | "pincel";

interface SeleccionVisual extends MascaraHoja {
  lienzo: HTMLCanvasElement;
}

type Gesto =
  | { tipo: "mover"; puntero: number; inicio: PuntoHoja; dx: number; dy: number }
  | { tipo: "rectangulo"; puntero: number; inicio: PuntoHoja; fin: PuntoHoja }
  | { tipo: "lazo"; puntero: number; puntos: PuntoHoja[] }
  | { tipo: "pincel"; puntero: number; puntos: PuntoHoja[] };

interface PasoHistoria {
  x: number;
  y: number;
  datos: ImageData;
}

const crearLienzo = (ancho: number, alto: number) => {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(ancho));
  cv.height = Math.max(1, Math.round(alto));
  return cv;
};

const blobDeLienzo = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => {
  cv.toBlob((blob) => blob ? res(blob) : rej(new Error("No se pudo guardar la hoja corregida.")), "image/png");
});

function cubrirSeleccionConFondo(
  c: CanvasRenderingContext2D,
  s: MascaraHoja,
  margen: number,
  fondo: [number, number, number],
  usarCroma: boolean,
) {
  const x0 = Math.max(0, s.x - margen), y0 = Math.max(0, s.y - margen);
  const x1 = Math.min(c.canvas.width, s.x + s.ancho + margen);
  const y1 = Math.min(c.canvas.height, s.y + s.alto + margen);
  const ancho = x1 - x0, alto = y1 - y0;
  if (ancho < 1 || alto < 1) return;
  const parche = c.getImageData(x0, y0, ancho, alto);
  for (let y = 0; y < s.alto; y++) {
    for (let x = 0; x < s.ancho; x++) {
      if (!s.mascara[y * s.ancho + x]) continue;
      const gx = s.x + x, gy = s.y + y;
      for (let my = Math.max(y0, gy - margen); my <= Math.min(y1 - 1, gy + margen); my++) {
        for (let mx = Math.max(x0, gx - margen); mx <= Math.min(x1 - 1, gx + margen); mx++) {
          const o = ((my - y0) * ancho + mx - x0) * 4;
          parche.data[o] = fondo[0];
          parche.data[o + 1] = fondo[1];
          parche.data[o + 2] = fondo[2];
          parche.data[o + 3] = usarCroma ? 255 : 0;
        }
      }
    }
  }
  c.putImageData(parche, x0, y0);
}

function pintarFondo(
  c: CanvasRenderingContext2D,
  puntos: PuntoHoja[],
  tam: number,
  fondo: [number, number, number],
  usarCroma: boolean,
) {
  if (!puntos.length) return;
  c.save();
  c.globalCompositeOperation = usarCroma ? "source-over" : "destination-out";
  c.strokeStyle = `rgb(${fondo[0]} ${fondo[1]} ${fondo[2]})`;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = tam;
  c.beginPath();
  c.moveTo(puntos[0].x, puntos[0].y);
  for (const p of puntos.slice(1)) c.lineTo(p.x, p.y);
  if (puntos.length === 1) c.lineTo(puntos[0].x + 0.01, puntos[0].y + 0.01);
  c.stroke();
  c.restore();
}

export function EditorHojaSprite({
  hojaUrl,
  anchoHoja,
  altoHoja,
  croma,
  celdas,
  procesando,
  bloqueado = false,
  onAplicar,
  onPendiente,
}: {
  /** Se toma una sola vez; el componente se remonta al abrir otra hoja. */
  hojaUrl: string;
  anchoHoja: number;
  altoHoja: number;
  croma: string;
  celdas: CeldaSprite[];
  procesando: boolean;
  bloqueado?: boolean;
  onAplicar: (hoja: Blob) => Promise<void> | void;
  onPendiente?: (pendiente: boolean) => void;
}) {
  // Si el padre reemplaza hojaUrl después de «Aplicar», este editor conserva
  // su canvas e historial. Una hoja nueva lo remonta con una key distinta.
  const [fuenteInicial] = useState(hojaUrl);
  const [modo, setModo] = useState<Modo>("automatico");
  const [tolerancia, setTolerancia] = useState(52);
  const [pincelFondo, setPincelFondo] = useState(16);
  const [margenLimpieza, setMargenLimpieza] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [seleccion, setSeleccion] = useState<SeleccionVisual | null>(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [borrador, setBorrador] = useState<Gesto | null>(null);
  const [historial, setHistorial] = useState<PasoHistoria[]>([]);
  const [sucio, setSucio] = useState(false);
  const [listo, setListo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fondo, setFondo] = useState<[number, number, number]>(parseHex(croma) ?? [255, 0, 255]);
  const [usarCroma, setUsarCroma] = useState(true);
  const [revision, setRevision] = useState(0);

  const vistaRef = useRef<HTMLCanvasElement | null>(null);
  const trabajoRef = useRef<HTMLCanvasElement | null>(null);
  const inicialRef = useRef<ImageData | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  const pendienteRef = useRef(onPendiente);
  pendienteRef.current = onPendiente;

  useEffect(() => {
    let vivo = true;
    setListo(false);
    cargarImagen(fuenteInicial).then((img) => {
      if (!vivo) return;
      const cv = crearLienzo(anchoHoja, altoHoja);
      const c = cv.getContext("2d")!;
      c.drawImage(img, 0, 0, anchoHoja, altoHoja);
      const inicial = c.getImageData(0, 0, anchoHoja, altoHoja);
      trabajoRef.current = cv;
      inicialRef.current = inicial;
      setFondo(colorDelFondo(inicial.data, anchoHoja, altoHoja) ?? parseHex(croma) ?? [255, 0, 255]);
      setUsarCroma(huecoDe(inicial.data) <= 0.02);
      setListo(true);
      setRevision((v) => v + 1);
    }).catch(() => {
      if (vivo) setError("No se pudo abrir la hoja para editar sus elementos.");
    });
    return () => { vivo = false; };
  }, [fuenteInicial, anchoHoja, altoHoja, croma]);

  const pintar = useCallback(() => {
    const vista = vistaRef.current;
    const trabajo = trabajoRef.current;
    if (!vista || !trabajo || !listo) return;
    if (vista.width !== anchoHoja || vista.height !== altoHoja) {
      vista.width = anchoHoja;
      vista.height = altoHoja;
    }
    const c = vista.getContext("2d")!;
    c.clearRect(0, 0, vista.width, vista.height);
    c.drawImage(trabajo, 0, 0);

    if (seleccion) {
      const destinoX = seleccion.x + dx;
      const destinoY = seleccion.y + dy;
      if (dx || dy) {
        cubrirSeleccionConFondo(c, seleccion, margenLimpieza, fondo, usarCroma);
        c.drawImage(seleccion.lienzo, destinoX, destinoY);
      }
      c.save();
      c.globalAlpha = 0.3;
      c.drawImage(seleccion.lienzo, destinoX, destinoY);
      c.restore();
    }

    if (borrador?.tipo === "pincel") {
      pintarFondo(c, borrador.puntos, pincelFondo, fondo, usarCroma);
    }

    // La rejilla solo es una guía: nunca se hornea en la hoja guardada.
    c.save();
    c.lineWidth = Math.max(1, Math.min(anchoHoja, altoHoja) / 600);
    c.font = `${Math.max(12, Math.round(Math.min(anchoHoja, altoHoja) / 38))}px sans-serif`;
    celdas.forEach((celda, i) => {
      c.strokeStyle = "rgba(255,255,255,.78)";
      c.setLineDash([]);
      c.strokeRect(celda.x + 0.5, celda.y + 0.5, celda.ancho - 1, celda.alto - 1);
      c.fillStyle = "rgba(0,0,0,.72)";
      const texto = String(i + 1);
      const tw = c.measureText(texto).width + 10;
      c.fillRect(celda.x + 1, celda.y + 1, tw, Math.max(18, Math.min(anchoHoja, altoHoja) / 28));
      c.fillStyle = "white";
      c.fillText(texto, celda.x + 6, celda.y + Math.max(14, Math.min(anchoHoja, altoHoja) / 38));
    });
    c.restore();

    if (seleccion) {
      c.save();
      c.strokeStyle = "#22d3ee";
      c.lineWidth = Math.max(2, Math.min(anchoHoja, altoHoja) / 450);
      c.setLineDash([10, 7]);
      c.strokeRect(
        seleccion.x + dx + 0.5,
        seleccion.y + dy + 0.5,
        seleccion.ancho - 1,
        seleccion.alto - 1,
      );
      c.restore();
    }

    if (borrador?.tipo === "rectangulo") {
      c.save();
      c.strokeStyle = "#fb923c";
      c.lineWidth = 3;
      c.setLineDash([9, 6]);
      c.strokeRect(
        borrador.inicio.x,
        borrador.inicio.y,
        borrador.fin.x - borrador.inicio.x,
        borrador.fin.y - borrador.inicio.y,
      );
      c.restore();
    } else if (borrador?.tipo === "lazo" && borrador.puntos.length > 1) {
      c.save();
      c.strokeStyle = "#fb923c";
      c.lineWidth = 3;
      c.setLineDash([9, 6]);
      c.beginPath();
      c.moveTo(borrador.puntos[0].x, borrador.puntos[0].y);
      borrador.puntos.slice(1).forEach((p) => c.lineTo(p.x, p.y));
      c.stroke();
      c.restore();
    }
  }, [altoHoja, anchoHoja, borrador, celdas, dx, dy, fondo, listo, margenLimpieza,
    pincelFondo, revision, seleccion, usarCroma]);

  useEffect(() => { pintar(); }, [pintar]);

  function punto(e: React.PointerEvent<HTMLCanvasElement>): PuntoHoja {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(anchoHoja - 1, Math.round((e.clientX - r.left) * anchoHoja / Math.max(1, r.width)))),
      y: Math.max(0, Math.min(altoHoja - 1, Math.round((e.clientY - r.top) * altoHoja / Math.max(1, r.height)))),
    };
  }

  function opcionesFondo() {
    return { color: fondo, tolerancia, usarCroma };
  }

  function convertirSeleccion(mascara: MascaraHoja | null) {
    const trabajo = trabajoRef.current;
    if (!mascara || !trabajo) {
      setSeleccion(null);
      setError("No encontré píxeles del elemento dentro de esa selección.");
      return;
    }
    const origen = trabajo.getContext("2d")!.getImageData(
      mascara.x, mascara.y, mascara.ancho, mascara.alto,
    );
    for (let p = 0; p < mascara.mascara.length; p++) {
      if (mascara.mascara[p]) continue;
      origen.data[p * 4 + 3] = 0;
    }
    const lienzo = crearLienzo(mascara.ancho, mascara.alto);
    lienzo.getContext("2d")!.putImageData(origen, 0, 0);
    setSeleccion({ ...mascara, lienzo });
    setDx(0); setDy(0); setError(null);
  }

  function seleccionarAutomatico(p: PuntoHoja) {
    const trabajo = trabajoRef.current;
    if (!trabajo) return;
    const d = trabajo.getContext("2d")!.getImageData(0, 0, anchoHoja, altoHoja).data;
    convertirSeleccion(seleccionarComponenteHoja(
      d, anchoHoja, altoHoja, p.x, p.y, opcionesFondo(),
    ));
  }

  function enSeleccion(p: PuntoHoja) {
    return !!seleccion
      && p.x >= seleccion.x + dx && p.x < seleccion.x + dx + seleccion.ancho
      && p.y >= seleccion.y + dy && p.y < seleccion.y + dy + seleccion.alto;
  }

  function alBajar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!listo || procesando || aplicando || bloqueado) return;
    if (modo === "navegar") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = punto(e);
    let gesto: Gesto;
    if (modo === "pincel") {
      setSeleccion(null); setDx(0); setDy(0);
      gesto = { tipo: "pincel", puntero: e.pointerId, puntos: [p] };
    } else if (enSeleccion(p)) {
      gesto = { tipo: "mover", puntero: e.pointerId, inicio: p, dx, dy };
    } else if (modo === "automatico") {
      seleccionarAutomatico(p);
      return;
    } else if (modo === "rectangulo") {
      setSeleccion(null); setDx(0); setDy(0);
      gesto = { tipo: "rectangulo", puntero: e.pointerId, inicio: p, fin: p };
    } else {
      setSeleccion(null); setDx(0); setDy(0);
      gesto = { tipo: "lazo", puntero: e.pointerId, puntos: [p] };
    }
    gestoRef.current = gesto;
    setBorrador(gesto);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestoRef.current;
    if (!g || g.puntero !== e.pointerId) return;
    e.preventDefault();
    const p = punto(e);
    if (g.tipo === "mover" && seleccion) {
      const m = acotarMovimientoSeleccion(
        seleccion,
        g.dx + p.x - g.inicio.x,
        g.dy + p.y - g.inicio.y,
        anchoHoja,
        altoHoja,
      );
      setDx(m.dx); setDy(m.dy);
    } else if (g.tipo === "rectangulo") {
      g.fin = p;
      setBorrador({ ...g });
    } else if (g.tipo === "lazo" || g.tipo === "pincel") {
      const ultimo = g.puntos[g.puntos.length - 1];
      const distanciaMinima = g.tipo === "pincel" ? 1 : 9;
      if ((p.x - ultimo.x) ** 2 + (p.y - ultimo.y) ** 2 >= distanciaMinima) {
        g.puntos.push(p);
        setBorrador({ ...g, puntos: [...g.puntos] });
      }
    }
  }

  function terminar(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestoRef.current;
    if (!g || g.puntero !== e.pointerId) return;
    gestoRef.current = null;
    setBorrador(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.tipo === "mover") return;
    const trabajo = trabajoRef.current;
    if (!trabajo) return;
    if (g.tipo === "pincel") {
      const radio = Math.ceil(pincelFondo / 2) + 1;
      const xs = g.puntos.map((p) => p.x), ys = g.puntos.map((p) => p.y);
      const x0 = Math.min(...xs) - radio, y0 = Math.min(...ys) - radio;
      const x1 = Math.max(...xs) + radio, y1 = Math.max(...ys) + radio;
      guardarPaso(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      pintarFondo(trabajo.getContext("2d")!, g.puntos, pincelFondo, fondo, usarCroma);
      marcarCambio();
      return;
    }
    const d = trabajo.getContext("2d")!.getImageData(0, 0, anchoHoja, altoHoja).data;
    convertirSeleccion(g.tipo === "rectangulo"
      ? seleccionarRectanguloHoja(d, anchoHoja, altoHoja, g.inicio, g.fin, opcionesFondo())
      : seleccionarLazoHoja(d, anchoHoja, altoHoja, g.puntos, opcionesFondo()));
  }

  function limpiarMascara(c: CanvasRenderingContext2D, s: SeleccionVisual) {
    cubrirSeleccionConFondo(c, s, margenLimpieza, fondo, usarCroma);
  }

  function guardarPaso(x: number, y: number, ancho: number, alto: number) {
    const trabajo = trabajoRef.current;
    if (!trabajo) return;
    const px = Math.max(0, x), py = Math.max(0, y);
    const pw = Math.min(anchoHoja - px, ancho - (px - x));
    const ph = Math.min(altoHoja - py, alto - (py - y));
    if (pw < 1 || ph < 1) return;
    const paso = { x: px, y: py, datos: trabajo.getContext("2d")!.getImageData(px, py, pw, ph) };
    // Ocho parches dan un deshacer útil sin retener decenas de hojas completas
    // en la memoria de un teléfono cuando el movimiento fue muy largo.
    setHistorial((h) => [...h.slice(-7), paso]);
  }

  function marcarCambio() {
    setSucio(true);
    pendienteRef.current?.(true);
    setRevision((v) => v + 1);
  }

  function fijar(copiar: boolean) {
    const trabajo = trabajoRef.current;
    if (!trabajo || !seleccion || (!dx && !dy)) return;
    const x0 = Math.min(seleccion.x, seleccion.x + dx);
    const y0 = Math.min(seleccion.y, seleccion.y + dy);
    const x1 = Math.max(seleccion.x + seleccion.ancho, seleccion.x + dx + seleccion.ancho);
    const y1 = Math.max(seleccion.y + seleccion.alto, seleccion.y + dy + seleccion.alto);
    guardarPaso(x0 - margenLimpieza, y0 - margenLimpieza,
      x1 - x0 + margenLimpieza * 2, y1 - y0 + margenLimpieza * 2);
    const c = trabajo.getContext("2d")!;
    if (!copiar) limpiarMascara(c, seleccion);
    c.drawImage(seleccion.lienzo, seleccion.x + dx, seleccion.y + dy);
    setSeleccion(null); setDx(0); setDy(0);
    marcarCambio();
  }

  function borrarSeleccion() {
    const trabajo = trabajoRef.current;
    if (!trabajo || !seleccion) return;
    guardarPaso(seleccion.x - margenLimpieza, seleccion.y - margenLimpieza,
      seleccion.ancho + margenLimpieza * 2, seleccion.alto + margenLimpieza * 2);
    limpiarMascara(trabajo.getContext("2d")!, seleccion);
    setSeleccion(null); setDx(0); setDy(0);
    marcarCambio();
  }

  function encajarSeleccion() {
    const trabajo = trabajoRef.current;
    if (!trabajo || !seleccion || !celdas.length) return;
    const sx = seleccion.x + dx, sy = seleccion.y + dy;
    const areaComun = (c: CeldaSprite) => Math.max(0,
      Math.min(sx + seleccion.ancho, c.x + c.ancho) - Math.max(sx, c.x),
    ) * Math.max(0,
      Math.min(sy + seleccion.alto, c.y + c.alto) - Math.max(sy, c.y),
    );
    const centroX = sx + seleccion.ancho / 2, centroY = sy + seleccion.alto / 2;
    const distancia = (c: CeldaSprite) =>
      (centroX - c.x - c.ancho / 2) ** 2 + (centroY - c.y - c.alto / 2) ** 2;
    const celda = [...celdas].sort((a, b) =>
      areaComun(b) - areaComun(a) || distancia(a) - distancia(b),
    )[0];
    const margen = Math.max(2, Math.round(Math.min(celda.ancho, celda.alto) * 0.05));
    const disponibleX = Math.max(1, celda.ancho - margen * 2);
    const disponibleY = Math.max(1, celda.alto - margen * 2);
    const escala = Math.min(1, disponibleX / seleccion.ancho, disponibleY / seleccion.alto);
    const ancho = Math.max(1, Math.round(seleccion.ancho * escala));
    const alto = Math.max(1, Math.round(seleccion.alto * escala));
    const destinoX = Math.round(celda.x + (celda.ancho - ancho) / 2);
    const destinoY = Math.round(celda.y + (celda.alto - alto) / 2);
    const x0 = Math.min(seleccion.x - margenLimpieza, destinoX);
    const y0 = Math.min(seleccion.y - margenLimpieza, destinoY);
    const x1 = Math.max(seleccion.x + seleccion.ancho + margenLimpieza, destinoX + ancho);
    const y1 = Math.max(seleccion.y + seleccion.alto + margenLimpieza, destinoY + alto);
    guardarPaso(x0, y0, x1 - x0, y1 - y0);
    const c = trabajo.getContext("2d")!;
    limpiarMascara(c, seleccion);
    c.save();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(seleccion.lienzo, destinoX, destinoY, ancho, alto);
    c.restore();
    setSeleccion(null); setDx(0); setDy(0); setError(null);
    marcarCambio();
  }

  function moverUnPixel(mx: number, my: number) {
    if (!seleccion) return;
    const m = acotarMovimientoSeleccion(seleccion, dx + mx, dy + my, anchoHoja, altoHoja);
    setDx(m.dx); setDy(m.dy);
  }

  function deshacer() {
    const trabajo = trabajoRef.current;
    const paso = historial[historial.length - 1];
    if (!trabajo || !paso) return;
    trabajo.getContext("2d")!.putImageData(paso.datos, paso.x, paso.y);
    setHistorial((h) => h.slice(0, -1));
    setSeleccion(null); setDx(0); setDy(0);
    marcarCambio();
  }

  function restaurar() {
    const trabajo = trabajoRef.current;
    const inicial = inicialRef.current;
    if (!trabajo || !inicial) return;
    guardarPaso(0, 0, anchoHoja, altoHoja);
    trabajo.getContext("2d")!.putImageData(inicial, 0, 0);
    setSeleccion(null); setDx(0); setDy(0);
    marcarCambio();
  }

  async function aplicar() {
    const trabajo = trabajoRef.current;
    if (!trabajo || !sucio || procesando || aplicando || bloqueado || (seleccion && (dx || dy))) return;
    setAplicando(true); setError(null);
    try {
      await onAplicar(await blobDeLienzo(trabajo));
      setSucio(false);
      pendienteRef.current?.(false);
    } catch (e) {
      setError((e as Error).message || "No se pudo aplicar la hoja corregida.");
    } finally {
      setAplicando(false);
    }
  }

  const ocupado = procesando || aplicando || bloqueado;

  return (
    <div className="space-y-3 rounded-xl border border-cyan-400/35 bg-cyan-400/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <span className="block text-xs font-semibold text-fg">1 · Mover elementos dentro de la hoja</span>
          <span className="block text-[10px] leading-snug text-muted">
            Selecciona la silueta que invadió otra casilla, arrástrala y fíjala antes de cortar.
          </span>
        </span>
        <span className="text-[10px] text-muted">La rejilla es solo una guía · no se guarda</span>
      </div>

      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setModo("navegar")} disabled={ocupado}
          className={modo === "navegar" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <Hand className="h-3.5 w-3.5" /> Recorrer
        </button>
        <button type="button" onClick={() => setModo("automatico")} disabled={ocupado}
          className={modo === "automatico" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <Crosshair className="h-3.5 w-3.5" /> Automática
        </button>
        <button type="button" onClick={() => setModo("rectangulo")} disabled={ocupado}
          className={modo === "rectangulo" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <SquareDashed className="h-3.5 w-3.5" /> Rectángulo
        </button>
        <button type="button" onClick={() => setModo("lazo")} disabled={ocupado}
          className={modo === "lazo" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <PenTool className="h-3.5 w-3.5" /> Lazo preciso
        </button>
        <button type="button" onClick={() => setModo("pincel")} disabled={ocupado}
          className={modo === "pincel" ? "btn-brand px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>
          <Paintbrush className="h-3.5 w-3.5" /> Pincel de fondo
        </button>
        <button type="button" onClick={deshacer} disabled={ocupado || !historial.length}
          className="btn-ghost ml-auto px-2 py-1 text-xs">
          <Undo2 className="h-3.5 w-3.5" /> Deshacer
        </button>
        <button type="button" onClick={restaurar} disabled={ocupado || !listo}
          className="btn-ghost px-2 py-1 text-xs">
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar hoja
        </button>
        <span className="flex items-center gap-1 rounded border border-border px-1 text-[10px] text-muted">
          <button type="button" onClick={() => setZoom((v) => Math.max(100, v - 50))}
            disabled={zoom <= 100} className="p-1 disabled:opacity-30" aria-label="Alejar hoja">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center tabular-nums">{zoom}%</span>
          <button type="button" onClick={() => setZoom((v) => Math.min(400, v + 50))}
            disabled={zoom >= 400} className="p-1 disabled:opacity-30" aria-label="Acercar hoja">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="mx-auto max-h-[70vh] w-full max-w-5xl overflow-auto rounded-lg border border-border bg-black">
        <div className="relative min-w-full" style={{
          width: `${zoom}%`,
          aspectRatio: `${anchoHoja}/${altoHoja}`,
        }}>
          <canvas
            ref={vistaRef}
            width={anchoHoja}
            height={altoHoja}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            className={`absolute inset-0 h-full w-full ${modo === "navegar"
              ? "touch-auto cursor-grab"
              : `touch-none ${seleccion ? "cursor-move" : "cursor-crosshair"}`}`}
            aria-label="Editar elementos de la hoja de sprites"
          />
          {!listo && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparando editor…
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-2 rounded-lg border border-border bg-surface/45 p-2">
          {seleccion ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
                <span className="font-medium text-cyan-300">{seleccion.pixeles.toLocaleString()} píxeles seleccionados</span>
                <span>· {seleccion.ancho}×{seleccion.alto}</span>
                <span>· movimiento x {dx}, y {dy}</span>
                <button type="button" onClick={() => { setSeleccion(null); setDx(0); setDy(0); }}
                  className="ml-auto text-[10px] hover:text-fg">Cancelar selección</button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => fijar(false)} disabled={ocupado || (!dx && !dy)}
                  className="btn-brand px-2 py-1 text-xs disabled:opacity-40">
                  <Check className="h-3.5 w-3.5" /> Mover aquí
                </button>
                <button type="button" onClick={() => fijar(true)} disabled={ocupado || (!dx && !dy)}
                  className="btn-ghost px-2 py-1 text-xs disabled:opacity-40">
                  <Copy className="h-3.5 w-3.5" /> Copiar aquí
                </button>
                <button type="button" onClick={borrarSeleccion} disabled={ocupado}
                  className="btn-ghost px-2 py-1 text-xs text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Borrar elemento
                </button>
                <button type="button" onClick={encajarSeleccion} disabled={ocupado}
                  className="btn-ghost px-2 py-1 text-xs">
                  <Minimize2 className="h-3.5 w-3.5 text-gold" /> Encajar en casilla
                </button>
              </div>
              <p className="text-[9px] text-muted">
                Arrastra el borde azul o usa las flechas. El hueco anterior se rellenará con el fondo cromático.
              </p>
            </>
          ) : (
            <p className="text-[10px] leading-relaxed text-muted">
              {modo === "automatico" && "Toca el elemento. TVPhi elegirá la silueta conectada que no sea fondo."}
              {modo === "rectangulo" && "Arrastra un rectángulo alrededor de la parte que quieres mover."}
              {modo === "lazo" && "Dibuja un contorno cerrado alrededor del elemento para evitar líneas o dibujos vecinos."}
              {modo === "navegar" && "Desplaza la hoja ampliada sin cambiar ninguna selección."}
              {modo === "pincel" && "Pinta sobre rayas o restos. Se usa el mismo fondo y desaparecerá al recortar."}
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface/45 p-2">
          <div className="grid grid-cols-3 gap-1" aria-label="Mover selección un píxel">
            <span />
            <button type="button" onClick={() => moverUnPixel(0, -1)} disabled={!seleccion || ocupado} className="btn-ghost p-1" aria-label="Subir selección"><ArrowUp className="h-3.5 w-3.5" /></button>
            <span />
            <button type="button" onClick={() => moverUnPixel(-1, 0)} disabled={!seleccion || ocupado} className="btn-ghost p-1" aria-label="Mover selección a la izquierda"><ArrowLeft className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => moverUnPixel(0, 1)} disabled={!seleccion || ocupado} className="btn-ghost p-1" aria-label="Bajar selección"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => moverUnPixel(1, 0)} disabled={!seleccion || ocupado} className="btn-ghost p-1" aria-label="Mover selección a la derecha"><ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          {usarCroma && (
            <label className="block text-[10px] text-muted">
              Sensibilidad del fondo: {tolerancia}
              <RangoPreciso valor={tolerancia} min={20} max={110} paso={2}
                onCambio={setTolerancia} etiqueta="sensibilidad del fondo" className="mt-1" />
            </label>
          )}
          {modo === "pincel" && (
            <label className="block text-[10px] text-muted">
              Pincel de fondo: {pincelFondo}px
              <RangoPreciso valor={pincelFondo} min={2} max={80} paso={1}
                onCambio={setPincelFondo} etiqueta="pincel de fondo" className="mt-1" />
            </label>
          )}
          <label className="block text-[10px] text-muted">
            Limpiar contorno al mover: {margenLimpieza}px
            <RangoPreciso valor={margenLimpieza} min={0} max={3} paso={1}
              onCambio={setMargenLimpieza} etiqueta="limpieza de contorno" className="mt-1" />
          </label>
        </div>
      </div>

      {bloqueado && <p className="text-[10px] text-gold">Aplica o restaura primero los cambios pendientes de las casillas.</p>}
      {error && <p className="text-[10px] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[9px] leading-snug text-muted">
          Solo al aplicar se reemplaza la hoja de trabajo y se vuelven a crear los fotogramas.
        </p>
        <button type="button" onClick={() => void aplicar()}
          disabled={!sucio || ocupado || !!(seleccion && (dx || dy))}
          className="btn-brand text-xs disabled:opacity-40">
          {aplicando || procesando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {aplicando || procesando ? "Aplicando…" : sucio ? "Aplicar hoja y recortar" : "Hoja aplicada"}
        </button>
      </div>
    </div>
  );
}
