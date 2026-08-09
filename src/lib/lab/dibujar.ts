// Pintar el mapa semántico en un canvas.
//
// Lo que sale de aquí NO es la imagen final: son manchas de color plano con
// etiquetas, que es justo lo que hay que darle a la IA para que entienda dónde
// va cada cosa. Por eso los colores son chillones y las etiquetas se leen: son
// instrucciones, no arte.

import type { Escena, Objeto, Semantico } from "./escena";
import { PALETA } from "./escena";

const n = (v: unknown, sino: number) => (typeof v === "number" && Number.isFinite(v) ? v : sino);

/** El centro de la forma, para girarla y para colgarle la etiqueta. */
export function centro(o: Objeto): [number, number] {
  switch (o.shape) {
    case "circle": return [n(o.cx, 0.5), n(o.cy, 0.5)];
    case "ellipse": return [n(o.cx, 0.5), n(o.cy, 0.5)];
    case "line": return [(n(o.x1, 0) + n(o.x2, 1)) / 2, (n(o.y1, 0) + n(o.y2, 1)) / 2];
    case "polygon":
    case "path": {
      const p = o.points ?? [];
      if (!p.length) return [0.5, 0.5];
      const sx = p.reduce((a, q) => a + n(q[0], 0), 0);
      const sy = p.reduce((a, q) => a + n(q[1], 0), 0);
      return [sx / p.length, sy / p.length];
    }
    case "star": return [n(o.cx, 0.5), n(o.cy, 0.5)];
    default: return [n(o.x, 0) + n(o.w, 0.1) / 2, n(o.y, 0) + n(o.h, 0.1) / 2];
  }
}

function rectRedondo(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y); c.quadraticCurveTo(x + w, y, x + w, y + k);
  c.lineTo(x + w, y + h - k); c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  c.lineTo(x + k, y + h); c.quadraticCurveTo(x, y + h, x, y + h - k);
  c.lineTo(x, y + k); c.quadraticCurveTo(x, y, x + k, y);
  c.closePath();
}

// Trazo suave por una lista de puntos: cada esquina se redondea tirando de los
// vecinos. Con «smooth» a 0 sale igual que un polígono, así que una sola forma
// sirve para una montaña angulosa y para una nube.
function trazoSuave(
  c: CanvasRenderingContext2D, pts: [number, number][], W: number, H: number,
  suave: number, cerrado: boolean,
) {
  const p = pts.map(([x, y]) => [n(x, 0) * W, n(y, 0) * H] as [number, number]);
  if (p.length < 2) return;
  c.beginPath();
  if (suave <= 0.001) {
    c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
    if (cerrado) c.closePath();
    return;
  }
  const t = Math.min(1, suave) * 0.5;
  const en = (i: number) => p[(i + p.length) % p.length];
  c.moveTo(p[0][0], p[0][1]);
  const ultimo = cerrado ? p.length : p.length - 1;
  for (let i = 0; i < ultimo; i++) {
    const p0 = cerrado || i > 0 ? en(i - 1) : p[0];
    const p1 = en(i), p2 = en(i + 1);
    const p3 = cerrado || i + 2 < p.length ? en(i + 2) : p[p.length - 1];
    c.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3,
      p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3,
      p2[0], p2[1],
    );
  }
  if (cerrado) c.closePath();
}

function estrella(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, puntas: number, hueco: number) {
  const k = Math.max(3, Math.round(puntas));
  c.beginPath();
  for (let i = 0; i < k * 2; i++) {
    const radio = i % 2 ? r * Math.max(0.05, Math.min(0.95, hueco)) : r;
    const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * radio, y = cy + Math.sin(a) * radio;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

// ── Una forma ───────────────────────────────────────────────────────────────

export function dibujarObjeto(
  c: CanvasRenderingContext2D, o: Objeto, W: number, H: number,
  paleta: Partial<Record<Semantico, string>>, etiquetas: boolean,
) {
  // «repeat» no dibuja nada suyo: coloca copias de otra forma y deja que cada
  // copia se dibuje sola. Es lo que convierte «seis ventanas» en un objeto.
  if (o.shape === "repeat") {
    const veces = Math.max(1, Math.round(n(o.veces, 3)));
    const base = o.item;
    if (!base) return;
    const x1 = n(o.x1, n(o.x, 0.2)), y1 = n(o.y1, n(o.y, 0.5));
    const x2 = n(o.x2, x1 + n(o.w, 0.5)), y2 = n(o.y2, y1);
    for (let i = 0; i < veces; i++) {
      const t = veces === 1 ? 0 : i / (veces - 1);
      const dx = x1 + (x2 - x1) * t, dy = y1 + (y2 - y1) * t;
      const copia: Objeto = {
        ...(base as Objeto),
        id: `${o.id}-${i}`,
        semantic: base.semantic ?? o.semantic,
        // La posición de la copia se toma de la línea; lo que traiga el item
        // se entiende como TAMAÑO, no como sitio.
        x: dx - n(base.w, 0.06) / 2, y: dy - n(base.h, 0.1) / 2,
        cx: dx, cy: dy,
        label: i === 0 ? (o.label ?? base.label) : undefined,
      };
      dibujarObjeto(c, copia, W, H, paleta, etiquetas && i === 0);
    }
    return;
  }

  const relleno = o.fill || paleta[o.semantic] || PALETA[o.semantic] || "#CBD5E1";
  const borde = o.stroke || "rgba(255,255,255,.78)";
  const [ux, uy] = centro(o);
  const cx = ux * W, cy = uy * H;
  const min = Math.min(W, H);

  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, n(o.opacity, 0.88)));
  c.translate(cx, cy);
  c.rotate((n(o.rotation, 0) * Math.PI) / 180);
  c.translate(-cx, -cy);
  c.fillStyle = relleno;
  c.strokeStyle = borde;
  c.lineWidth = Math.max(1, n(o.strokeWidth, 0.0025) * min);
  const perfilar = () => { if (o.stroke || o.strokeWidth) c.stroke(); };

  const x = n(o.x, 0) * W, y = n(o.y, 0) * H, w = n(o.w, 0.1) * W, h = n(o.h, 0.1) * H;

  switch (o.shape) {
    case "rect":
      c.beginPath(); c.rect(x, y, w, h); c.fill(); perfilar(); break;

    case "roundedRect":
      rectRedondo(c, x, y, w, h, n(o.radius, 0.015) * min); c.fill(); perfilar(); break;

    case "circle":
      c.beginPath(); c.arc(n(o.cx, 0.5) * W, n(o.cy, 0.5) * H, n(o.r, 0.05) * min, 0, Math.PI * 2);
      c.fill(); perfilar(); break;

    case "ellipse":
      c.beginPath();
      c.ellipse(n(o.cx, 0.5) * W, n(o.cy, 0.5) * H, n(o.rx, 0.08) * W, n(o.ry, 0.05) * H, 0, 0, Math.PI * 2);
      c.fill(); perfilar(); break;

    case "polygon": {
      const p = o.points ?? [];
      if (!p.length) break;
      trazoSuave(c, p, W, H, 0, true); c.fill(); perfilar(); break;
    }

    case "path": {
      const p = o.points ?? [];
      if (p.length < 2) break;
      const cerrado = o.closed !== false;
      trazoSuave(c, p, W, H, n(o.smooth, 0.6), cerrado);
      if (cerrado) { c.fill(); perfilar(); }
      else {
        c.strokeStyle = relleno; c.lineCap = "round"; c.lineJoin = "round";
        c.lineWidth = Math.max(2, n(o.width, 0.012) * min); c.stroke();
      }
      break;
    }

    case "line":
      c.beginPath();
      c.moveTo(n(o.x1, 0) * W, n(o.y1, 0) * H);
      c.lineTo(n(o.x2, 1) * W, n(o.y2, 1) * H);
      c.lineCap = "round"; c.strokeStyle = relleno;
      c.lineWidth = Math.max(1, n(o.width, 0.012) * min); c.stroke();
      break;

    case "triangle":
      c.beginPath();
      c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h);
      c.closePath(); c.fill(); perfilar(); break;

    case "wedge":
      // Cuña: sube de un lado al otro. Sirve de ladera, rampa o tejado a un agua.
      c.beginPath();
      c.moveTo(x, y + h); c.lineTo(x + w, y); c.lineTo(x + w, y + h);
      c.closePath(); c.fill(); perfilar(); break;

    case "star":
      estrella(c, n(o.cx, 0.5) * W, n(o.cy, 0.5) * H, n(o.r, 0.05) * min,
        n(o.puntas, 5), n(o.hueco, 0.45));
      c.fill(); perfilar(); break;

    case "arch": {
      const radio = w / 2, hombro = y + radio;
      c.beginPath();
      c.moveTo(x, y + h); c.lineTo(x, hombro);
      c.arc(x + radio, hombro, radio, Math.PI, 0);
      c.lineTo(x + w, y + h);
      c.strokeStyle = relleno; c.lineCap = "butt"; c.lineJoin = "round";
      c.lineWidth = Math.max(2, n(o.thickness, 0.045) * min);
      c.stroke();
      break;
    }

    case "stairs": {
      const pasos = Math.max(1, Math.round(n(o.steps, 4)));
      for (let i = 0; i < pasos; i++) {
        const t = (i + 1) / pasos, sw = w * (0.58 + 0.42 * t);
        c.fillRect(x + (w - sw) / 2, y + h - i * h / pasos - h / pasos, sw, (h / pasos) * 0.82);
      }
      break;
    }

    case "door": {
      // El hueco entero relleno —la IA tiene que ver que ahí se pasa— con el
      // marco perfilado por encima.
      const grosor = Math.max(2, n(o.thickness, 0.012) * min);
      c.beginPath();
      if (o.arco) {
        const radio = w / 2, hombro = y + radio;
        c.moveTo(x, y + h); c.lineTo(x, hombro);
        c.arc(x + radio, hombro, radio, Math.PI, 0);
        c.lineTo(x + w, y + h);
      } else c.rect(x, y, w, h);
      c.closePath(); c.fill();
      c.lineWidth = grosor; c.stroke();
      break;
    }

    case "window": {
      const grosor = Math.max(2, n(o.thickness, 0.008) * min);
      c.beginPath(); c.rect(x, y, w, h); c.fill();
      c.lineWidth = grosor; c.stroke();
      // Cruceta: es lo que la distingue de un rectángulo cualquiera.
      const cols = Math.max(1, Math.round(n(o.columnas, 2)));
      const fils = Math.max(1, Math.round(n(o.filas, 2)));
      c.beginPath();
      for (let i = 1; i < cols; i++) { c.moveTo(x + (w * i) / cols, y); c.lineTo(x + (w * i) / cols, y + h); }
      for (let j = 1; j < fils; j++) { c.moveTo(x, y + (h * j) / fils); c.lineTo(x + w, y + (h * j) / fils); }
      c.lineWidth = Math.max(1, grosor * 0.6); c.stroke();
      break;
    }

    case "tree": {
      const alturaTronco = h * Math.max(0.05, Math.min(0.8, n(o.tronco, 0.35)));
      const anchoTronco = Math.max(2, w * 0.18);
      c.fillRect(x + w / 2 - anchoTronco / 2, y + h - alturaTronco, anchoTronco, alturaTronco);
      const copaAlto = h - alturaTronco;
      c.beginPath();
      c.ellipse(x + w / 2, y + copaAlto * 0.52, w / 2, copaAlto * 0.52, 0, 0, Math.PI * 2);
      c.fill(); perfilar();
      break;
    }

    case "cloud": {
      // Tres bultos y una base: se lee como nube sin tener que escribir puntos.
      const r1 = h * 0.5;
      c.beginPath();
      c.arc(x + w * 0.28, y + h * 0.58, r1 * 0.85, 0, Math.PI * 2);
      c.arc(x + w * 0.52, y + h * 0.42, r1, 0, Math.PI * 2);
      c.arc(x + w * 0.76, y + h * 0.6, r1 * 0.78, 0, Math.PI * 2);
      c.rect(x + w * 0.2, y + h * 0.55, w * 0.62, h * 0.42);
      c.fill();
      break;
    }
  }
  c.restore();

  if (etiquetas && o.label) {
    const tam = Math.max(10, Math.round(min * 0.019));
    c.save();
    c.font = `500 ${tam}px system-ui, sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    const texto = String(o.label);
    const ancho = c.measureText(texto).width;
    const pad = tam * 0.38;
    c.fillStyle = "rgba(2,6,23,.82)";
    rectRedondo(c, cx - ancho / 2 - pad, cy - tam * 0.72, ancho + pad * 2, tam * 1.44, tam * 0.35);
    c.fill();
    c.fillStyle = "#FFFFFF";
    c.fillText(texto, cx, cy);
    c.restore();
  }
}

// ── La escena entera ────────────────────────────────────────────────────────

export interface OpcionesDibujo {
  /** Desplazamiento de la cámara, en anchos/altos. Es lo que crea el paralaje. */
  offsetX?: number;
  offsetY?: number;
  etiquetas?: boolean;
  rejilla?: boolean;
  /** Solo estas capas. Sin lista, todas las visibles. */
  capas?: string[];
  /** Sin fondo: para exportar un PNG que se pueda apilar. */
  transparente?: boolean;
  /** Color neutro de guía; evita mandar a la IA un croma como si fuera cielo. */
  fondoMapa?: string;
}

export function dibujarEscena(canvas: HTMLCanvasElement, esc: Escena, op: OpcionesDibujo = {}) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const W = canvas.width, H = canvas.height;
  c.clearRect(0, 0, W, H);
  if (!op.transparente) {
    c.fillStyle = op.fondoMapa || esc.scene.mapBackground || "#101522";
    c.fillRect(0, 0, W, H);
  }
  const solo = op.capas ? new Set(op.capas) : null;
  for (const capa of esc.layers) {
    if (capa.visible === false) continue;
    if (solo && !solo.has(capa.id)) continue;
    const d = n(capa.depth, 0);
    c.save();
    // Cada capa se desplaza según su profundidad: el fondo casi nada, el primer
    // plano mucho. Eso, y solo eso, es el paralaje.
    c.translate(n(op.offsetX, 0) * d * W, n(op.offsetY, 0) * d * H);
    for (const o of capa.objects) dibujarObjeto(c, o, W, H, esc.palette ?? {}, !!op.etiquetas);
    c.restore();
  }
  if (op.rejilla) rejilla(c, W, H);
}

function rejilla(c: CanvasRenderingContext2D, W: number, H: number) {
  c.save();
  c.strokeStyle = "rgba(255,255,255,.16)";
  c.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    c.beginPath(); c.moveTo((W * i) / 10, 0); c.lineTo((W * i) / 10, H); c.stroke();
    c.beginPath(); c.moveTo(0, (H * i) / 10); c.lineTo(W, (H * i) / 10); c.stroke();
  }
  // Los tercios, más marcados: es donde se coloca lo que importa.
  c.strokeStyle = "rgba(255,255,255,.34)";
  c.lineWidth = 1.5;
  for (const t of [1 / 3, 2 / 3]) {
    c.beginPath(); c.moveTo(W * t, 0); c.lineTo(W * t, H); c.stroke();
    c.beginPath(); c.moveTo(0, H * t); c.lineTo(W, H * t); c.stroke();
  }
  c.restore();
}
