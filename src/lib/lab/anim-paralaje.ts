// Presets de cámara para el compositor del laboratorio.
//
// No tocan el motor del vídeo: solo la vista previa. La cola encadena tramos
// sobre un estado acumulado (pan/zoom/opacidades de capa), para poder acercarse
// dos veces, panear desde ahí, ocultar una capa y volver a mostrarla después.

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

/** Acciones de la cola: siempre relativas al estado (salvo «desde» = centro / posición). */
export type MovCola =
  | "izq"
  | "der"
  | "arriba"
  | "abajo"
  | "acercar"
  | "alejar"
  | "atravesar"
  | "centrar"
  | "esperar"
  | "ir-a";

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

export const MOV_COLA: { id: MovCola; label: string; pista: string }[] = [
  { id: "izq", label: "← Izquierda", pista: "Desplaza la cámara a la izquierda desde donde esté" },
  { id: "der", label: "Derecha →", pista: "Desplaza a la derecha desde donde esté" },
  { id: "arriba", label: "↑ Arriba", pista: "Tilt hacia arriba" },
  { id: "abajo", label: "↓ Abajo", pista: "Tilt hacia abajo" },
  { id: "acercar", label: "Acercarse", pista: "Suma zoom: se acumula con el anterior" },
  { id: "alejar", label: "Alejarse", pista: "Resta zoom desde el actual" },
  { id: "atravesar", label: "Atravesar", pista: "Acerca fuerte y desvanece la capa frontal" },
  { id: "centrar", label: "Volver al centro", pista: "Lerp hacia pan/zoom neutros (guarda fades)" },
  { id: "esperar", label: "Esperar", pista: "No mueve la cámara; útil solo con fade" },
  { id: "ir-a", label: "Ir a posición", pista: "Lerp a una posición absoluta que elijas" },
];

export type DesdePaso = "continuar" | "centro" | "posicion";

export type FadeAccion = "nada" | "aparecer" | "desaparecer";

/** «frente» = la capa con más depth; o un id concreto. */
export type FadeCapa = "ninguna" | "frente" | (string & {});

export type PasoSecuencia = {
  id: string;
  mov: MovCola;
  /** Duración del tramo en ms. */
  durMs: number;
  /** Intensidad del tramo (0–100). Escala el delta de pan/zoom. */
  distancia: number;
  /**
   * De dónde parte este tramo:
   * - continuar: del estado que dejó el paso anterior
   * - centro: reinicia pan/zoom a neutro (conserva opacidades de capa)
   * - posicion: parte de ox/oy/zoom de este paso
   */
  desde: DesdePaso;
  /** Solo si desde === "posicion". Unidades de cámara (−1…1 aprox. para pan). */
  inicioOx: number;
  inicioOy: number;
  inicioZoom: number;
  /** Solo si mov === "ir-a": destino absoluto. */
  destOx: number;
  destOy: number;
  destZoom: number;
  fadeCapa: FadeCapa;
  fade: FadeAccion;
};

export type EstadoCamara = {
  ox: number;
  oy: number;
  /** Zoom base (≥ 0.5). */
  zoom: number;
  /** Extra de zoom por profundidad (acumulado). */
  zoomExtra: number;
  /** Opacidad animada por id de capa (0…1). Persiste entre pasos. */
  alpha: Record<string, number>;
};

export type VistaCamara = {
  ox: number;
  oy: number;
  zoom: number;
  zoomCapa: (depth: number) => number;
  alphaCapa: (depth: number, capaId?: string) => number;
  t: number;
  fin: boolean;
};

export function estadoNeutro(): EstadoCamara {
  return { ox: 0, oy: 0, zoom: 1, zoomExtra: 0, alpha: {} };
}

export function clonarEstado(e: EstadoCamara): EstadoCamara {
  return {
    ox: e.ox, oy: e.oy, zoom: e.zoom, zoomExtra: e.zoomExtra,
    alpha: { ...e.alpha },
  };
}

export function pasoPorDefecto(parcial?: Partial<PasoSecuencia>): PasoSecuencia {
  return {
    id: parcial?.id ?? "p0",
    mov: parcial?.mov ?? "der",
    durMs: parcial?.durMs ?? 4000,
    distancia: parcial?.distancia ?? 55,
    desde: parcial?.desde ?? "continuar",
    inicioOx: parcial?.inicioOx ?? 0,
    inicioOy: parcial?.inicioOy ?? 0,
    inicioZoom: parcial?.inicioZoom ?? 1,
    destOx: parcial?.destOx ?? 0,
    destOy: parcial?.destOy ?? 0,
    destZoom: parcial?.destZoom ?? 1.15,
    fadeCapa: parcial?.fadeCapa ?? "ninguna",
    fade: parcial?.fade ?? "nada",
  };
}

const identidad = (_depth: number) => 1;

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

function zoomPorDepth(cantidad: number) {
  return (depth: number) => 1 + cantidad * depth * depth;
}

function kDeFuerza(fuerzaPct: number) {
  return (fuerzaPct / 100) * 0.08;
}

/** Escala distancia 0–100 → factor de movimiento. */
function factorDist(distancia: number) {
  return Math.max(0.05, distancia / 100);
}

export function resolverCapaFade(
  fadeCapa: FadeCapa,
  capas: { id: string; depth: number }[],
): string | null {
  if (fadeCapa === "ninguna") return null;
  if (fadeCapa === "frente") {
    if (!capas.length) return null;
    let best = capas[0];
    for (const c of capas) if (c.depth >= best.depth) best = c;
    return best.id;
  }
  return fadeCapa;
}

/**
 * Punto de partida del tramo a partir del estado acumulado y las opciones del paso.
 */
export function origenPaso(estado: EstadoCamara, paso: PasoSecuencia): EstadoCamara {
  const base = clonarEstado(estado);
  if (paso.desde === "centro") {
    return { ...base, ox: 0, oy: 0, zoom: 1, zoomExtra: 0 };
  }
  if (paso.desde === "posicion") {
    return {
      ...base,
      ox: paso.inicioOx,
      oy: paso.inicioOy,
      zoom: Math.max(0.5, paso.inicioZoom),
      zoomExtra: Math.max(0, paso.inicioZoom - 1) * 1.2,
    };
  }
  return base;
}

/**
 * Estado al final del tramo (sin interpolar). Los fades quedan en 0 o 1.
 */
export function destinoPaso(
  origen: EstadoCamara,
  paso: PasoSecuencia,
  fuerzaPct: number,
  capas: { id: string; depth: number }[],
): EstadoCamara {
  const k = kDeFuerza(fuerzaPct) * factorDist(paso.distancia);
  const out = clonarEstado(origen);

  switch (paso.mov) {
    case "izq":
      out.ox -= k;
      break;
    case "der":
      out.ox += k;
      break;
    case "arriba":
      out.oy -= k * 0.65;
      break;
    case "abajo":
      out.oy += k * 0.65;
      break;
    case "acercar": {
      const cant = Math.max(0.06, k * 1.8);
      out.zoom += cant * 0.35;
      out.zoomExtra += cant * 1.6;
      break;
    }
    case "alejar": {
      const cant = Math.max(0.06, k * 1.8);
      out.zoom = Math.max(0.55, out.zoom - cant * 0.35);
      out.zoomExtra = Math.max(0, out.zoomExtra - cant * 1.6);
      break;
    }
    case "atravesar": {
      const cant = Math.max(0.14, k * 3.2);
      out.zoom += Math.max(0.1, k * 1.5);
      out.zoomExtra += cant;
      break;
    }
    case "centrar":
      out.ox = 0;
      out.oy = 0;
      out.zoom = 1;
      out.zoomExtra = 0;
      break;
    case "esperar":
      break;
    case "ir-a":
      out.ox = paso.destOx;
      out.oy = paso.destOy;
      out.zoom = Math.max(0.5, paso.destZoom);
      out.zoomExtra = Math.max(0, (paso.destZoom - 1) * 1.5);
      break;
  }

  // Atravesar: si no hay fade elegido, desvanece la frontal por defecto.
  let fadeCapa = paso.fadeCapa;
  let fade = paso.fade;
  if (paso.mov === "atravesar" && fade === "nada" && fadeCapa === "ninguna") {
    fadeCapa = "frente";
    fade = "desaparecer";
  }
  const fadeId = resolverCapaFade(fadeCapa, capas);
  if (fadeId && fade === "aparecer") out.alpha[fadeId] = 1;
  if (fadeId && fade === "desaparecer") out.alpha[fadeId] = 0;

  return out;
}

function alphaDe(estado: EstadoCamara, capaId: string) {
  const v = estado.alpha[capaId];
  return typeof v === "number" ? clamp01(v) : 1;
}

/**
 * Interpola un tramo de cola 0…1 sobre el estado acumulado.
 */
export function interpolarTramo(
  origen: EstadoCamara,
  destino: EstadoCamara,
  ms: number,
  durMs: number,
  capas: { id: string; depth: number }[],
): { vista: VistaCamara; estado: EstadoCamara } {
  const dur = Math.max(400, durMs);
  const t = clamp01(ms / dur);
  const e = easeInOut(t);
  const fin = t >= 1;

  const ox = lerp(origen.ox, destino.ox, e);
  const oy = lerp(origen.oy, destino.oy, e);
  const zoom = lerp(origen.zoom, destino.zoom, e);
  const zoomExtra = lerp(origen.zoomExtra, destino.zoomExtra, e);

  const alpha: Record<string, number> = { ...origen.alpha };
  const ids = new Set([...Object.keys(origen.alpha), ...Object.keys(destino.alpha), ...capas.map((c) => c.id)]);
  for (const id of ids) {
    const a0 = alphaDe(origen, id);
    const a1 = alphaDe(destino, id);
    if (a0 !== a1) alpha[id] = lerp(a0, a1, e);
    else if (origen.alpha[id] !== undefined || destino.alpha[id] !== undefined) alpha[id] = a1;
  }

  const estado: EstadoCamara = { ox, oy, zoom, zoomExtra, alpha };

  const vista: VistaCamara = {
    ox, oy, zoom,
    zoomCapa: zoomPorDepth(zoomExtra),
    alphaCapa: (_depth, capaId) => (capaId ? alphaDe(estado, capaId) : 1),
    t, fin,
  };
  return { vista, estado };
}

/**
 * Cámara + efectos por capa (modo idle / ciclo libre).
 *
 * `modo: "ciclo"` — se repite (selector libre).
 * `modo: "tramo"` — una sola pasada 0→1 (legacy; la cola usa interpolarTramo).
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
  const tramoSwing = opts.modo === "tramo" ? easeInOut(t) * 2 - 1 : swing;
  const avance = opts.modo === "tramo" ? easeInOut(t) : ping;

  const base = (ox: number, oy: number, zoom: number, zc = identidad, ac: VistaCamara["alphaCapa"] = identidad): VistaCamara =>
    ({ ox, oy, zoom, zoomCapa: zc, alphaCapa: ac, t, fin });

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
      const cant = avance * Math.max(0.2, k * 3.2);
      return base(
        0,
        0,
        1 + avance * Math.max(0.12, k * 1.5),
        (depth) => 1 + cant * Math.pow(depth, 1.6),
        (depth) => {
          if (depth < 0.15) return 1;
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
