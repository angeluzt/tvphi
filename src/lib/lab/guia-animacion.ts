import type { MovCapa } from "@/lib/lab/movimiento-capa";
import type { PlanoMovimiento } from "@/lib/lab/plano-movimiento";

// VER lo que se ha animado, encima de la escena.
//
// EL PROBLEMA. Se podía poner movimiento a una capa y no había forma de saberlo
// mirando: la escena quieta es idéntica con animación y sin ella, el recorrido
// no se dibujaba en ninguna parte y la lista de capas no lo decía. Uno acababa
// dándole al play para comprobar si lo que acababa de tocar había hecho algo, y
// con cinco capas animadas ya no sabía cuál era cuál.
//
// Los sprites SÍ tenían guía (guia-ruta.ts) desde el principio, y solo para el
// que estuviera seleccionado. Esto es lo mismo para las capas normales, y para
// todas a la vez: lo que uno necesita ver es el conjunto.

/** Un punto por el que pasa la capa, en desplazamientos de plano. */
export interface PuntoGuia {
  dx: number;
  dy: number;
  /** A, B, C… */
  etiqueta: string;
  /** Segundos parado aquí, si para. */
  espera?: number;
}

/**
 * Los puntos que describen un movimiento, en orden.
 *
 * Solo los movimientos que van A UN SITIO tienen puntos que enseñar. Un
 * «flotar» oscila alrededor de donde está: dibujarle un camino de dos puntos
 * daría a entender que se va, y no se va. Para esos se devuelve vacío y quien
 * llame enseña la etiqueta con el nombre, que es la información que hay.
 */
export function puntosDeMov(mov: MovCapa | undefined): PuntoGuia[] {
  if (!mov) return [];
  if (mov.tipo === "trayectoria") {
    return [
      { dx: mov.desdeX ?? 0, dy: mov.desdeY ?? 0, etiqueta: "A" },
      { dx: mov.x ?? 0, dy: mov.y ?? 0, etiqueta: "B" },
    ];
  }
  if (mov.tipo === "ruta") {
    const pasos = mov.pasos ?? [];
    if (!pasos.length) return [];
    return [
      { dx: 0, dy: 0, etiqueta: "A" },
      ...pasos.map((p, i) => ({
        dx: p.x,
        dy: p.y,
        etiqueta: String.fromCharCode(66 + (i % 25)),
        espera: p.espera,
      })),
    ];
  }
  return [];
}

/** Cómo se resume un movimiento en una línea. */
export function resumenDeMov(mov: MovCapa | undefined): string {
  if (!mov) return "";
  const s = (n: number | undefined, alt = 4) => `${(n ?? alt).toFixed(1).replace(/\.0$/, "")}s`;
  switch (mov.tipo) {
    case "trayectoria":
      return `A → B · ${s(mov.segundos)}${mov.volver ? " · vuelve" : ""}${mov.bucle ? " · en bucle" : ""}`;
    case "ruta": {
      const n = mov.pasos?.length ?? 0;
      return `Ruta de ${n + 1} punto${n ? "s" : ""}${mov.bucle ? " · en bucle" : ""}`;
    }
    case "deriva":
      return `Deriva ${mov.x ? `${mov.x > 0 ? "→" : "←"}` : ""}${mov.y ? `${mov.y > 0 ? "↓" : "↑"}` : ""}${mov.bucle !== false ? " · en bucle" : ""}`;
    case "flotar":
      return `Flota ${Math.round((mov.amplitud ?? 0.03) * 100)}% · ${s(mov.segundos)}`;
    case "vaiven":
      return `Vaivén ${Math.round((mov.amplitud ?? 0.03) * 100)}% · ${s(mov.segundos)}`;
    case "pulso":
      return `Pulso ${Math.round((mov.amplitud ?? 0.03) * 100)}% · ${s(mov.segundos)}`;
    default:
      return mov.tipo;
  }
}

/** Colores de las guías. Uno por capa animada, estable mientras no cambie el orden. */
export const COLORES_GUIA = [
  "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#4ade80", "#fb923c", "#60a5fa", "#f87171",
];

export const colorDeGuia = (i: number) => COLORES_GUIA[i % COLORES_GUIA.length];

// ── La caja del contenido ──────────────────────────────────────────────────
//
// Una capa se pinta a lienzo completo aunque su dibujo ocupe una esquina: el
// PNG de una pieza es casi todo transparente. Rodear el plano entero para decir
// «esta es la seleccionada» señalaría el borde de la pantalla en todas, que es
// lo mismo que no señalar nada. Hay que rodear lo que se ve.
//
// Se mide UNA vez por imagen y se guarda: es una lectura de píxeles, y hacerla
// en cada fotograma costaría más que pintar la escena.

export interface CajaContenido {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CAJA_ENTERA: CajaContenido = { x0: 0, y0: 0, x1: 1, y1: 1 };
const memoria = new WeakMap<object, CajaContenido>();

/**
 * Qué trozo de la imagen tiene pintura, en 0..1.
 *
 * Se mide sobre una copia reducida —128 px de ancho— porque para dibujar un
 * recuadro no hace falta precisión de píxel y así cuesta unas décimas de
 * milisegundo en vez de leer dos millones de píxeles.
 */
export function cajaContenido(img: HTMLImageElement | HTMLCanvasElement): CajaContenido {
  const guardada = memoria.get(img);
  if (guardada) return guardada;
  const ancho = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth;
  const alto = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
  if (!ancho || !alto) return CAJA_ENTERA;
  try {
    const w = Math.max(8, Math.min(128, ancho));
    const h = Math.max(8, Math.round((w * alto) / ancho));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    if (!c) return CAJA_ENTERA;
    c.drawImage(img, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] <= 24) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const caja: CajaContenido = x1 < 0
      ? CAJA_ENTERA
      : { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
    memoria.set(img, caja);
    return caja;
  } catch {
    // Un canvas «sucio» por una imagen de otro origen no se puede leer. Da
    // igual: se rodea el plano entero, que es peor guía pero no rompe nada.
    return CAJA_ENTERA;
  }
}

/** La caja del contenido, ya en píxeles del lienzo. */
export function cajaEnLienzo(caja: CajaContenido, plano: PlanoMovimiento) {
  return {
    x: plano.x0 + caja.x0 * plano.w,
    y: plano.y0 + caja.y0 * plano.h,
    w: (caja.x1 - caja.x0) * plano.w,
    h: (caja.y1 - caja.y0) * plano.h,
  };
}

// ── El dibujo ───────────────────────────────────────────────────────────────

export interface CapaGuia {
  nombre: string;
  /** Dónde está pintada AHORA (para el recuadro de selección). */
  plano: PlanoMovimiento;
  /** Dónde estaría quieta (para el camino: los puntos son desplazamientos). */
  reposo: PlanoMovimiento;
  caja: CajaContenido;
  mov?: MovCapa;
  color: string;
  seleccionada: boolean;
  /** La que se está editando: se marca más fuerte que el resto del grupo. */
  activa: boolean;
}

function etiqueta(c: CanvasRenderingContext2D, texto: string, x: number, y: number, color: string, u: number) {
  c.font = `600 ${11 * u}px system-ui, sans-serif`;
  const ancho = c.measureText(texto).width + 10 * u;
  const alto = 16 * u;
  c.fillStyle = "rgba(6,10,16,.86)";
  c.beginPath();
  c.roundRect(x, y, ancho, alto, 4 * u);
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 1 * u;
  c.stroke();
  c.fillStyle = color;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText(texto, x + 5 * u, y + alto / 2);
}

/**
 * Rodea las capas marcadas y dibuja el camino de las que se mueven.
 *
 * Va DESPUÉS de pintar la escena y solo en la vista previa: es una ayuda para
 * trabajar, nunca entra al PNG ni al ZIP.
 */
export function pintarGuiaAnimacion(
  c: CanvasRenderingContext2D,
  capas: CapaGuia[],
  ancho: number,
) {
  const u = Math.max(1, Math.min(2.5, ancho / 850));
  c.save();

  for (const capa of capas) {
    const r = cajaEnLienzo(capa.caja, capa.plano);

    if (capa.seleccionada) {
      c.setLineDash(capa.activa ? [] : [6 * u, 4 * u]);
      c.lineWidth = (capa.activa ? 2.5 : 1.5) * u;
      c.strokeStyle = capa.color;
      c.globalAlpha = capa.activa ? 1 : 0.75;
      c.strokeRect(r.x, r.y, r.w, r.h);
      // Las esquinas, más gruesas: en una escena llena de hojas rojas una
      // línea fina de un píxel se pierde y no se ve qué hay seleccionado.
      if (capa.activa) {
        const l = Math.min(22 * u, r.w / 3, r.h / 3);
        c.lineWidth = 4 * u;
        c.beginPath();
        for (const [ex, sx] of [[r.x, 1], [r.x + r.w, -1]] as const) {
          for (const [ey, sy] of [[r.y, 1], [r.y + r.h, -1]] as const) {
            c.moveTo(ex + sx * l, ey);
            c.lineTo(ex, ey);
            c.lineTo(ex, ey + sy * l);
          }
        }
        c.stroke();
      }
      c.globalAlpha = 1;
      c.setLineDash([]);
    }

    const puntos = puntosDeMov(capa.mov);
    if (!capa.mov) continue;

    const base = cajaEnLienzo(capa.caja, capa.reposo);
    const cx = base.x + base.w / 2;
    const cy = base.y + base.h / 2;

    if (puntos.length > 1) {
      const px = (p: PuntoGuia) => cx + p.dx * capa.reposo.w;
      const py = (p: PuntoGuia) => cy + p.dy * capa.reposo.h;
      c.strokeStyle = capa.color;
      c.lineWidth = 2 * u;
      c.setLineDash([7 * u, 5 * u]);
      c.beginPath();
      puntos.forEach((p, i) => (i ? c.lineTo(px(p), py(p)) : c.moveTo(px(p), py(p))));
      c.stroke();
      c.setLineDash([]);
      for (const p of puntos) {
        const x = px(p), y = py(p);
        c.fillStyle = "rgba(6,10,16,.9)";
        c.strokeStyle = capa.color;
        c.lineWidth = 2 * u;
        c.beginPath();
        c.arc(x, y, 10 * u, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = capa.color;
        c.font = `700 ${11 * u}px system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(p.etiqueta, x, y + 0.5 * u);
        if (p.espera) {
          etiqueta(c, `⏸ ${p.espera}s`, x + 13 * u, y - 8 * u, capa.color, u);
        }
      }
      etiqueta(c, capa.nombre, Math.min(px(puntos[0]) + 13 * u, ancho - 120 * u), py(puntos[0]) + 12 * u, capa.color, u);
    } else if (capa.seleccionada) {
      // Sin camino que dibujar, al menos que se lea QUÉ hace.
      etiqueta(c, `${capa.nombre} · ${resumenDeMov(capa.mov)}`, r.x, Math.max(2 * u, r.y - 20 * u), capa.color, u);
    }
  }

  c.restore();
}
