// Mover, redimensionar y duplicar las formas del mapa SIN escribir JSON.
//
// EL PROBLEMA. El mapa se veía —bonito, a todo color, con sus etiquetas— y la
// única forma de tocarlo era escribir a mano un JSON de trescientas líneas en
// un cuadro de texto. Enseñar algo que no se puede tocar es peor que no
// enseñarlo: parece roto. Y para el ajuste que de verdad se pide —«ese árbol un
// poco más a la izquierda», «esa columna más baja»— teclear coordenadas es
// absurdo cuando la forma está ahí delante.
//
// LA DIFICULTAD REAL, y por qué esto es un módulo y no cuatro líneas: cada
// forma guarda su geometría a su manera. Un rectángulo tiene x/y/w/h, un
// círculo cx/cy/r, una línea x1/y1/x2/y2 y un polígono una lista de puntos. Sin
// un sitio donde traducir todo eso a «una caja» y de vuelta, el arrastre habría
// que escribirlo trece veces y se rompería con la siguiente forma que se añada.
//
// Todo va en coordenadas 0..1 sobre el lienzo, igual que el resto del mapa.

import type { Capa, Escena, Objeto } from "./escena";

const n = (v: unknown, sino: number) => (typeof v === "number" && Number.isFinite(v) ? v : sino);

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La caja que ocupa una forma. Es lo que se dibuja al seleccionarla. */
export function cajaDeObjeto(o: Objeto): Caja {
  switch (o.shape) {
    case "circle": {
      const r = n(o.r, 0.05);
      return { x: n(o.cx, 0.5) - r, y: n(o.cy, 0.5) - r, w: r * 2, h: r * 2 };
    }
    case "ellipse": {
      const rx = n(o.rx, 0.05);
      const ry = n(o.ry, 0.05);
      return { x: n(o.cx, 0.5) - rx, y: n(o.cy, 0.5) - ry, w: rx * 2, h: ry * 2 };
    }
    case "star": {
      const r = n(o.r, 0.05);
      return { x: n(o.cx, 0.5) - r, y: n(o.cy, 0.5) - r, w: r * 2, h: r * 2 };
    }
    case "line": {
      const x1 = n(o.x1, 0), y1 = n(o.y1, 0), x2 = n(o.x2, 1), y2 = n(o.y2, 1);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }
    case "polygon":
    case "path": {
      const p = (o.points ?? []).filter((q) => Array.isArray(q));
      if (!p.length) return { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };
      const xs = p.map((q) => n(q[0], 0));
      const ys = p.map((q) => n(q[1], 0));
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    default:
      return { x: n(o.x, 0), y: n(o.y, 0), w: n(o.w, 0.1), h: n(o.h, 0.1) };
  }
}

/**
 * ¿Está el punto dentro de la forma?
 *
 * Se prueba contra la CAJA, no contra la silueta exacta. Es a propósito: acertar
 * el interior de una estrella de cinco puntas con el dedo es imposible, y para
 * escoger «ese árbol de ahí» la caja es lo que la gente espera. El margen extra
 * es para las líneas, que sin él tienen una caja de altura cero y no habría
 * manera de cogerlas nunca.
 */
export function tocaObjeto(o: Objeto, nx: number, ny: number, margen = 0.008): boolean {
  const c = cajaDeObjeto(o);
  return nx >= c.x - margen && nx <= c.x + c.w + margen
    && ny >= c.y - margen && ny <= c.y + c.h + margen;
}

export interface Golpe {
  capaId: string;
  objetoId: string;
}

/**
 * Qué forma hay bajo el dedo. De DELANTE hacia atrás, que es lo que se ve.
 *
 * Recorrer las capas en su orden natural devolvería el cielo siempre que el
 * cielo cubra el cuadro, o sea siempre. Se recorre al revés, y dentro de cada
 * capa también, porque dentro de una capa lo último dibujado es lo de arriba.
 */
export function objetoEn(esc: Escena, nx: number, ny: number, soloCapa?: string): Golpe | null {
  for (let i = esc.layers.length - 1; i >= 0; i--) {
    const capa = esc.layers[i];
    if (capa.visible === false) continue;
    if (soloCapa && capa.id !== soloCapa) continue;
    for (let j = capa.objects.length - 1; j >= 0; j--) {
      if (tocaObjeto(capa.objects[j], nx, ny)) {
        return { capaId: capa.id, objetoId: capa.objects[j].id };
      }
    }
  }
  return null;
}

/** Mueve la forma `dx`, `dy`, respetando cómo guarda cada una su posición. */
export function moverObjeto(o: Objeto, dx: number, dy: number): Objeto {
  switch (o.shape) {
    case "circle":
    case "ellipse":
    case "star":
      return { ...o, cx: n(o.cx, 0.5) + dx, cy: n(o.cy, 0.5) + dy };
    case "line":
      return {
        ...o,
        x1: n(o.x1, 0) + dx, y1: n(o.y1, 0) + dy,
        x2: n(o.x2, 1) + dx, y2: n(o.y2, 1) + dy,
      };
    case "polygon":
    case "path":
      return { ...o, points: (o.points ?? []).map((p) => [n(p[0], 0) + dx, n(p[1], 0) + dy]) };
    default:
      return { ...o, x: n(o.x, 0) + dx, y: n(o.y, 0) + dy };
  }
}

/** Lo mínimo que puede medir una forma. Por debajo desaparece y no se recupera. */
const MINIMO = 0.005;

/**
 * Estira la forma hasta que su caja sea `destino`.
 *
 * Se define como «llévala a esta caja» y no como «multiplícala por k» porque un
 * tirador se arrastra a un sitio concreto: con un multiplicador, la esquina se
 * despega del dedo en cuanto la forma no está centrada, y se siente roto.
 */
export function redimensionarObjeto(o: Objeto, destino: Caja): Objeto {
  const w = Math.max(MINIMO, destino.w);
  const h = Math.max(MINIMO, destino.h);
  switch (o.shape) {
    case "circle":
      // Un círculo no puede ser ovalado: se le da el radio del lado menor y se
      // centra en la caja. Estirarlo por un lado pide una elipse, no un círculo.
      return { ...o, cx: destino.x + w / 2, cy: destino.y + h / 2, r: Math.min(w, h) / 2 };
    case "star":
      return { ...o, cx: destino.x + w / 2, cy: destino.y + h / 2, r: Math.min(w, h) / 2 };
    case "ellipse":
      return { ...o, cx: destino.x + w / 2, cy: destino.y + h / 2, rx: w / 2, ry: h / 2 };
    case "line": {
      // Se conserva el SENTIDO de la línea: una diagonal que baja tiene que
      // seguir bajando al estirarla, no darse la vuelta sola.
      const haciaDerecha = n(o.x2, 1) >= n(o.x1, 0);
      const haciaAbajo = n(o.y2, 1) >= n(o.y1, 0);
      return {
        ...o,
        x1: haciaDerecha ? destino.x : destino.x + w,
        x2: haciaDerecha ? destino.x + w : destino.x,
        y1: haciaAbajo ? destino.y : destino.y + h,
        y2: haciaAbajo ? destino.y + h : destino.y,
      };
    }
    case "polygon":
    case "path": {
      const c = cajaDeObjeto(o);
      const kx = c.w > MINIMO ? w / c.w : 1;
      const ky = c.h > MINIMO ? h / c.h : 1;
      return {
        ...o,
        points: (o.points ?? []).map((p) => [
          destino.x + (n(p[0], 0) - c.x) * kx,
          destino.y + (n(p[1], 0) - c.y) * ky,
        ]),
      };
    }
    default:
      return { ...o, x: destino.x, y: destino.y, w, h };
  }
}

/** Las cuatro esquinas de la caja, que es de donde se tira para estirar. */
export const ESQUINAS = ["ai", "ad", "bi", "bd"] as const;
export type Esquina = (typeof ESQUINAS)[number];

export function puntoDeEsquina(c: Caja, e: Esquina): { x: number; y: number } {
  return {
    x: e === "ai" || e === "bi" ? c.x : c.x + c.w,
    y: e === "ai" || e === "ad" ? c.y : c.y + c.h,
  };
}

/**
 * La caja que resulta de arrastrar una esquina hasta (nx, ny).
 *
 * La esquina OPUESTA se queda clavada, que es lo que hace que estirar se sienta
 * natural. Y se normaliza al final: si cruzas la caja entera, sale una caja
 * válida del otro lado en vez de una de ancho negativo, que revienta el dibujo.
 */
export function cajaArrastrando(c: Caja, e: Esquina, nx: number, ny: number): Caja {
  const fijo = puntoDeEsquina(c, e === "ai" ? "bd" : e === "ad" ? "bi" : e === "bi" ? "ad" : "ai");
  return {
    x: Math.min(fijo.x, nx),
    y: Math.min(fijo.y, ny),
    w: Math.max(MINIMO, Math.abs(nx - fijo.x)),
    h: Math.max(MINIMO, Math.abs(ny - fijo.y)),
  };
}

/** Un id que no choque con ninguno de la escena. */
export function idLibre(esc: Escena, base: string): string {
  const usados = new Set(esc.layers.flatMap((c) => c.objects.map((o) => o.id)));
  const raiz = base.replace(/-copia(-\d+)?$/, "");
  let cand = `${raiz}-copia`;
  for (let i = 2; usados.has(cand); i++) cand = `${raiz}-copia-${i}`;
  return cand;
}

// ── Operaciones sobre la escena entera ──────────────────────────────────────
//
// Devuelven una escena NUEVA. El editor la guarda tal cual y vuelve a escribir
// el JSON, así que lo que se ve en el cuadro de texto y lo que se ve en el
// lienzo no pueden separarse.

const conCapa = (esc: Escena, capaId: string, f: (c: Capa) => Capa): Escena => ({
  ...esc,
  layers: esc.layers.map((c) => (c.id === capaId ? f(c) : c)),
});

export function cambiarObjeto(
  esc: Escena, capaId: string, objetoId: string, f: (o: Objeto) => Objeto,
): Escena {
  return conCapa(esc, capaId, (c) => ({
    ...c,
    objects: c.objects.map((o) => (o.id === objetoId ? f(o) : o)),
  }));
}

export function borrarObjeto(esc: Escena, capaId: string, objetoId: string): Escena {
  return conCapa(esc, capaId, (c) => ({
    ...c,
    objects: c.objects.filter((o) => o.id !== objetoId),
  }));
}

/**
 * Duplica la forma y la deja un poco desplazada.
 *
 * El desplazamiento no es un capricho: una copia exacta encima de la original
 * es invisible, y quien la ha pedido cree que el botón no funcionó y le da tres
 * veces más. Un dedo de separación deja ver que hay dos.
 */
export function duplicarObjeto(esc: Escena, capaId: string, objetoId: string): {
  escena: Escena; nuevoId: string | null;
} {
  const capa = esc.layers.find((c) => c.id === capaId);
  const orig = capa?.objects.find((o) => o.id === objetoId);
  if (!capa || !orig) return { escena: esc, nuevoId: null };
  const nuevoId = idLibre(esc, orig.id);
  const copia = { ...moverObjeto(orig, 0.03, 0.03), id: nuevoId };
  return {
    escena: conCapa(esc, capaId, (c) => {
      const i = c.objects.findIndex((o) => o.id === objetoId);
      const objetos = [...c.objects];
      objetos.splice(i + 1, 0, copia);
      return { ...c, objects: objetos };
    }),
    nuevoId,
  };
}

/** Cambiar una forma de capa, conservando su sitio en el cuadro. */
export function moverObjetoDeCapa(esc: Escena, deId: string, aId: string, objetoId: string): Escena {
  const origen = esc.layers.find((c) => c.id === deId);
  const obj = origen?.objects.find((o) => o.id === objetoId);
  if (!obj || deId === aId || !esc.layers.some((c) => c.id === aId)) return esc;
  return {
    ...esc,
    layers: esc.layers.map((c) => {
      if (c.id === deId) return { ...c, objects: c.objects.filter((o) => o.id !== objetoId) };
      if (c.id === aId) return { ...c, objects: [...c.objects, obj] };
      return c;
    }),
  };
}
