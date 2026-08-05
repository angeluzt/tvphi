// Presets de cámara para el compositor del laboratorio.
//
// No tocan el motor del vídeo: solo la vista previa. El movimiento real del
// capítulo sigue siendo el de la toma (izquierda, acercar…). Aquí se prueba
// cómo se ven las capas con distintos recorridos —y se pueden encadenar.

export type AnimParalaje =
  | "suave"
  | "izq-der"
  | "der-izq"
  | "arriba-abajo"
  | "abajo-arriba"
  | "acercar"
  | "alejar"
  | "atravesar"
  | "diagonal"
  | "orbita"
  | "dolly-izq";

export const ANIM_OPCIONES: { id: AnimParalaje; label: string; pista: string }[] = [
  { id: "suave", label: "Suave (idle)", pista: "Va y viene en círculo suave" },
  { id: "izq-der", label: "Izquierda → derecha", pista: "Travelling horizontal" },
  { id: "der-izq", label: "Derecha → izquierda", pista: "Travelling al revés" },
  { id: "arriba-abajo", label: "Arriba → abajo", pista: "Tilt hacia abajo" },
  { id: "abajo-arriba", label: "Abajo → arriba", pista: "Tilt hacia arriba" },
  { id: "acercar", label: "Acercarse", pista: "Zoom in: delante crece más" },
  { id: "alejar", label: "Alejarse", pista: "Zoom out: delante se encoge más" },
  {
    id: "atravesar",
    label: "Atravesar (puerta)",
    pista: "La capa frontal se sale y se desvanece; revela lo de detrás",
  },
  { id: "diagonal", label: "Diagonal", pista: "Pan en diagonal" },
  { id: "orbita", label: "Órbita", pista: "Rodea el centro" },
  { id: "dolly-izq", label: "Dolly + acercar", pista: "Avanza mientras se desplaza" },
];

export type PasoSecuencia = {
  id: string;
  kind: AnimParalaje;
  /** Duración del tramo en ms (recorrido de una sola pasada). */
  durMs: number;
};

export type VistaCamara = {
  ox: number;
  oy: number;
  /** Zoom común a todas las capas. */
  zoom: number;
  /** Extra de escala según profundidad (1 = sin extra). */
  zoomCapa: (depth: number) => number;
  /** Multiplicador de opacidad según profundidad (1 = intacta). */
  alphaCapa: (depth: number) => number;
  /** 0..1 avance del tramo o del ciclo. */
  t: number;
  /** En modo tramo: el recorrido ya terminó. */
  fin: boolean;
};

const identidad = (_depth: number) => 1;

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Suaviza 0→1. */
function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}

/** 0→1→0 en un ciclo. */
function idaVuelta(t: number) {
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Cámara + efectos por capa.
 *
 * `modo: "ciclo"` — se repite (selector libre).
 * `modo: "tramo"` — una sola pasada 0→1 (para encadenar en la cola).
 */
export function vistaAnim(
  kind: AnimParalaje,
  ms: number,
  k: number,
  opts: { durMs?: number; modo: "ciclo" | "tramo" },
): VistaCamara {
  const dur = Math.max(400, opts.durMs ?? 4500);
  let t: number;
  let fin = false;
  if (opts.modo === "tramo") {
    t = clamp01(ms / dur);
    fin = t >= 1;
  } else {
    t = ((ms % dur) + dur) % dur / dur;
  }

  const ping = idaVuelta(t);
  const swing = opts.modo === "tramo" ? easeInOut(t) * 2 - 1 : ping * 2 - 1;
  // En tramo, swing va de -1 a +1 una sola vez (ease).
  const tramoSwing = opts.modo === "tramo" ? easeInOut(t) * 2 - 1 : swing;
  const avance = opts.modo === "tramo" ? easeInOut(t) : ping;

  const base = (ox: number, oy: number, zoom: number, zc = identidad, ac = identidad): VistaCamara =>
    ({ ox, oy, zoom, zoomCapa: zc, alphaCapa: ac, t, fin });

  // Zoom diferencial: delante (depth≈1) se agranda mucho más que el fondo.
  const zoomPorDepth = (cantidad: number) => (depth: number) =>
    1 + cantidad * depth * depth;

  switch (kind) {
    case "suave": {
      if (opts.modo === "tramo") {
        const a = avance * Math.PI * 2;
        return base(Math.sin(a) * k, Math.cos(a * 0.75) * k * 0.35, 1);
      }
      const s = ms / 3000;
      return base(Math.sin(s) * k, Math.cos(s * 0.75) * k * 0.35, 1);
    }
    case "izq-der":
      return base(tramoSwing * k, 0, 1);
    case "der-izq":
      return base(-tramoSwing * k, 0, 1);
    case "arriba-abajo":
      return base(0, tramoSwing * k * 0.65, 1);
    case "abajo-arriba":
      return base(0, -tramoSwing * k * 0.65, 1);
    case "acercar": {
      const cant = avance * Math.max(0.08, k * 1.8);
      return base(0, 0, 1 + cant * 0.35, zoomPorDepth(cant * 1.6));
    }
    case "alejar": {
      const cant = (1 - avance) * Math.max(0.08, k * 1.8);
      return base(0, 0, 1 + cant * 0.35, zoomPorDepth(cant * 1.6));
    }
    case "atravesar": {
      // Entrar: zoom global + la frontal se sale (escala alta) y se desvanece.
      const cant = avance * Math.max(0.2, k * 3.2);
      return base(
        0,
        0,
        1 + avance * Math.max(0.12, k * 1.5),
        (depth) => 1 + cant * Math.pow(depth, 1.6),
        (depth) => {
          if (depth < 0.15) return 1;
          // Empieza a fundirse a mitad del avance; la más frontal llega a 0.
          const fade = smooth(0.35, 1, avance) * smooth(0.2, 1, depth);
          return 1 - fade;
        },
      );
    }
    case "diagonal":
      return base(tramoSwing * k, tramoSwing * k * 0.55, 1);
    case "orbita": {
      const a = (opts.modo === "tramo" ? avance : t) * Math.PI * 2;
      return base(Math.cos(a) * k, Math.sin(a) * k * 0.55, 1);
    }
    case "dolly-izq": {
      const cant = avance * Math.max(0.06, k * 1.3);
      return base(
        -(opts.modo === "tramo" ? avance * 2 - 1 : tramoSwing) * k * 0.85,
        0,
        1 + cant * 0.4,
        zoomPorDepth(cant * 1.4),
      );
    }
    default:
      return base(0, 0, 1);
  }
}

/** @deprecated Usa vistaAnim. Compatibilidad con el idle antiguo. */
export function camaraAnim(
  kind: AnimParalaje,
  ms: number,
  k: number,
  durMs = 4500,
): { ox: number; oy: number; zoom: number } {
  const v = vistaAnim(kind, ms, k, { durMs, modo: "ciclo" });
  return { ox: v.ox, oy: v.oy, zoom: v.zoom };
}
