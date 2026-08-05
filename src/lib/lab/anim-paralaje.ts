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
  /** Zoom de lente (≥ 0.5): agranda TODO por igual, sin dar profundidad. */
  zoom: number;
  /**
   * Cuánto ha avanzado la cámara HACIA la escena, en unidades donde 1 = la
   * distancia hasta el plano de depth 1. Esto es lo que da el paralaje de
   * verdad: cada capa crece según lo cerca que esté, no todas por igual.
   */
  avance: number;
  /** Opacidad animada por id de capa (0…1). Persiste entre pasos. */
  alpha: Record<string, number>;
};

export type VistaCamara = {
  ox: number;
  oy: number;
  zoom: number;
  zoomCapa: (depth: number) => number;
  /**
   * Cuánto se desplaza esta capa en pantalla por unidad de paneo. Crece al
   * acercarse: de cerca, el mismo movimiento lateral barre mucho más cuadro.
   */
  panCapa: (depth: number) => number;
  alphaCapa: (depth: number, capaId?: string) => number;
  t: number;
  fin: boolean;
};

/**
 * Ni el cielo está en el infinito ni conviene que lo esté: con profundidad 0
 * exacta el fondo se queda absolutamente clavado y la toma parece un recorte
 * de cartón. Un pelín de profundidad basta para que respire.
 */
const PROF_MINIMA = 0.03;

/** Más allá de esto una capa es un muro borroso, y además 1/0 = infinito. */
const ESCALA_MAX = 12;
const AVANCE_MAX = 0.94;

/**
 * Lo que crece una capa cuando la cámara avanza.
 *
 * ESTO ES UNA CÁMARA, no un zoom. Si algo está a distancia z y avanzas «a», su
 * tamaño en pantalla se multiplica por z/(z−a). Como la profundidad ya es
 * proporcional a 1/z (0 = lejísimos, 1 = al alcance de la mano), sale
 * directamente 1/(1 − a·profundidad).
 *
 * Dos cosas salen gratis de aquí, y son justo las que se echaban en falta:
 * el fondo casi no crece por mucho que avances, y lo cercano crece cada vez
 * MÁS DEPRISA según te acercas, igual que al caminar hacia una puerta.
 */
export function escalaPerspectiva(avance: number, depth: number) {
  const d = Math.max(PROF_MINIMA, Math.min(1, depth));
  const den = 1 - avance * d;
  if (den <= 1 / ESCALA_MAX) return ESCALA_MAX;
  return Math.min(ESCALA_MAX, 1 / den);
}

export function estadoNeutro(): EstadoCamara {
  return { ox: 0, oy: 0, zoom: 1, avance: 0, alpha: {} };
}

export function clonarEstado(e: EstadoCamara): EstadoCamara {
  return {
    ox: e.ox, oy: e.oy, zoom: e.zoom, avance: e.avance,
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

const porAvance = (avance: number) => (depth: number) => escalaPerspectiva(avance, depth);

/**
 * Cuánto avance suma un tramo.
 *
 * En unidades de cámara, no de escala: es la diferencia con lo de antes.
 * Sumar 0,2 de escala tres veces se siente cada vez más flojo (de ×1 a ×1,2 se
 * nota; de ×2 a ×2,2 ya no). Sumar 0,2 de AVANCE tres veces acelera, porque la
 * escala es 1/(1−a) y esa curva se dispara al final.
 */
function avanceDelPaso(fuerzaPct: number, distancia: number) {
  return 0.55 * (fuerzaPct / 100) * factorDist(distancia);
}

/** Lo mismo para el modo libre, donde solo hay «fuerza» (k). */
const avanceIdle = (k: number) => Math.min(AVANCE_MAX, Math.max(0.12, k * 6));

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
    return { ...base, ox: 0, oy: 0, zoom: 1, avance: 0 };
  }
  if (paso.desde === "posicion") {
    return {
      ...base,
      ox: paso.inicioOx,
      oy: paso.inicioOy,
      zoom: 1,
      avance: Math.max(-1.5, Math.min(AVANCE_MAX, 1 - 1 / Math.max(0.4, paso.inicioZoom))),
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
    case "acercar":
      // Solo avance: el zoom de lente agrandaría también el cielo, y un cielo
      // que crece al caminar es justo lo que delata que esto no es una cámara.
      out.avance = Math.min(AVANCE_MAX, out.avance + avanceDelPaso(fuerzaPct, paso.distancia));
      break;
    case "alejar":
      out.avance = Math.max(-1.5, out.avance - avanceDelPaso(fuerzaPct, paso.distancia));
      break;
    case "atravesar": {
      // No suma una cantidad fija: se come una FRACCIÓN de lo que queda hasta
      // el plano de delante. Así siempre acaba pasando al otro lado, esté la
      // cámara donde esté, y el último tramo es el más rápido: como cruzar un
      // arco de verdad.
      const queda = AVANCE_MAX - out.avance;
      out.avance += queda * Math.min(0.92, 0.55 + factorDist(paso.distancia) * 0.4);
      break;
    }
    case "centrar":
      out.ox = 0;
      out.oy = 0;
      out.zoom = 1;
      out.avance = 0;
      break;
    case "esperar":
      break;
    case "ir-a":
      out.ox = paso.destOx;
      out.oy = paso.destOy;
      out.zoom = 1;
      // El «zoom» que se elige a mano se entiende como avance de cámara, para
      // que un destino y un «acercar» acaben en el mismo sitio.
      out.avance = Math.max(-1.5, Math.min(AVANCE_MAX, 1 - 1 / Math.max(0.4, paso.destZoom)));
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

/** Los cuatro números de la cámara que se interpolan con continuidad. */
const EJES = ["ox", "oy", "zoom", "avance"] as const;
type Eje = (typeof EJES)[number];
type Vel = Record<Eje, number>;

const velCero = (): Vel => ({ ox: 0, oy: 0, zoom: 0, avance: 0 });

/**
 * A qué velocidad entra un eje que empieza a moverse justo cuando otro acaba.
 * 1 = a su propia velocidad media. Por debajo de 3 la curva no se pasa del
 * destino (Fritsch–Carlson), así que no hay rebote.
 */
const ARRANQUE_LANZADO = 1;

/** Cuánta velocidad conserva el eje que termina. Bajo a propósito. */
const SALIDA_DESLIZADA = 0.5;

const seMueve = (t: { origen: EstadoCamara; destino: EstadoCamara }) =>
  EJES.some((e) => Math.abs(t.destino[e] - t.origen[e]) > 1e-9);

export type Tramo = {
  origen: EstadoCamara;
  destino: EstadoCamara;
  durMs: number;
  /** Velocidad al entrar y al salir, por milisegundo. Cero = parada limpia. */
  vIn: Vel;
  vOut: Vel;
};

/**
 * Planifica la cola ENTERA de una vez.
 *
 * Por qué de una vez y no paso a paso: para no frenar en cada juntura hay que
 * saber a dónde va el tramo SIGUIENTE. Antes cada tramo se suavizaba solo
 * (easeInOut), que arranca parado y acaba parado, así que encadenar cinco
 * movimientos daba cinco frenazos —medido: la velocidad caía al 0,0% del
 * máximo en cada cambio—. Eso es lo que se veía como «se pausa».
 *
 * Ahora la velocidad en cada juntura se saca de los tramos vecinos, como los
 * fotogramas clave de cualquier programa de animación: se entra a un tramo con
 * la misma velocidad con la que se salió del anterior. Arranca del reposo y
 * acaba en reposo; por el medio, no se para.
 */
export function planificarCola(
  cola: PasoSecuencia[],
  fuerzaPct: number,
  capas: { id: string; depth: number }[],
  inicial: EstadoCamara = estadoNeutro(),
): Tramo[] {
  if (!cola.length) return [];
  const tramos: Tramo[] = [];
  let estado = inicial;
  for (const paso of cola) {
    const origen = origenPaso(estado, paso);
    const destino = destinoPaso(origen, paso, fuerzaPct, capas);
    tramos.push({
      origen, destino,
      durMs: Math.max(400, paso.durMs),
      vIn: velCero(), vOut: velCero(),
    });
    estado = destino;
  }

  for (let j = 1; j < tramos.length; j++) {
    const a = tramos[j - 1];
    const b = tramos[j];
    // Una juntura solo se puede cruzar sin frenar si de verdad es continua:
    // «desde centro» y «desde posición» son cortes, y «esperar» es una parada
    // querida. En esos casos se deja el frenazo, porque ahí sí toca.
    const corta = cola[j].desde !== "continuar"
      || cola[j].mov === "esperar" || cola[j - 1].mov === "esperar";
    if (corta) continue;

    const veniaMoviendose = seMueve(a);
    for (const eje of EJES) {
      const p0 = a.origen[eje], p1 = a.destino[eje], p2 = b.destino[eje];
      const d0 = (p1 - p0) / a.durMs;   // pendiente del tramo que entra
      const d1 = (p2 - p1) / b.durMs;   // pendiente del que sale

      // El caso que de verdad se notaba: un paso panea y el siguiente hace
      // zoom. Son ejes DISTINTOS, así que el paneo frena a cero justo cuando el
      // zoom arranca de cero, y en medio la toma se queda quieta un instante.
      // Al que arranca se le da salida lanzada, a la velocidad de crucero del
      // propio tramo, para que recoja el movimiento que traía el anterior.
      if (d0 === 0 && d1 !== 0) {
        if (veniaMoviendose) b.vIn[eje] = d1 * ARRANQUE_LANZADO;
        continue;
      }
      // Y al revés: el eje que deja de moverse no se planta en seco, sigue
      // deslizándose dentro del tramo siguiente, como una cámara que pesa. Sin
      // esto, un «acercar» seguido de un «paneo» se queda un par de fotogramas
      // completamente quieto: el zoom ya frenó y el paneo aún no arranca.
      //
      // Se pasa de largo, sí, pero poquísimo: el bulto de una Hermite que sale
      // a velocidad v y vuelve a cero es 0,148·v·duración, o sea el 7% de lo
      // que se movió el tramo anterior. Medido en pantalla es menos de un píxel.
      if (d0 !== 0 && d1 === 0 && seMueve(b)) {
        const v = d0 * SALIDA_DESLIZADA;
        a.vOut[eje] = v;
        b.vIn[eje] = v;
        continue;
      }
      // Si el movimiento cambia de sentido, la velocidad en el vértice es cero:
      // frenar para dar la vuelta es lo natural, y además evita pasarse de largo.
      if (d0 * d1 <= 0) continue;
      const catmull = (p2 - p0) / (a.durMs + b.durMs);
      // Tope de Fritsch–Carlson: sin él la curva se pasa del destino y el zoom
      // llega a retroceder, que se ve como un tirón.
      const tope = 3 * Math.min(Math.abs(d0), Math.abs(d1));
      const v = Math.sign(catmull) * Math.min(Math.abs(catmull), tope);
      a.vOut[eje] = v;
      b.vIn[eje] = v;
    }
  }
  return tramos;
}

/** Hermite cúbico: posición con velocidad de entrada y de salida dadas. */
function hermite(p0: number, p1: number, v0: number, v1: number, h: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0
    + (t3 - 2 * t2 + t) * h * v0
    + (-2 * t3 + 3 * t2) * p1
    + (t3 - t2) * h * v1;
}

/**
 * Interpola un tramo ya planificado.
 */
export function interpolarTramo(
  tramo: Tramo,
  ms: number,
  capas: { id: string; depth: number }[],
): { vista: VistaCamara; estado: EstadoCamara } {
  const { origen, destino, durMs, vIn, vOut } = tramo;
  const t = clamp01(ms / durMs);
  const fin = t >= 1;

  const val = (eje: Eje) => hermite(origen[eje], destino[eje], vIn[eje], vOut[eje], durMs, t);
  const ox = val("ox");
  const oy = val("oy");
  const zoom = val("zoom");
  const avance = val("avance");

  // Los fundidos no necesitan continuidad de velocidad —nadie nota que una
  // opacidad «frene»— y con la suavizada de siempre entran y salen mejor.
  const e = easeInOut(t);
  const alpha: Record<string, number> = { ...origen.alpha };
  const ids = new Set([...Object.keys(origen.alpha), ...Object.keys(destino.alpha), ...capas.map((c) => c.id)]);
  for (const id of ids) {
    const a0 = alphaDe(origen, id);
    const a1 = alphaDe(destino, id);
    if (a0 !== a1) alpha[id] = lerp(a0, a1, e);
    else if (origen.alpha[id] !== undefined || destino.alpha[id] !== undefined) alpha[id] = a1;
  }

  const estado: EstadoCamara = { ox, oy, zoom, avance, alpha };

  const vista: VistaCamara = {
    ox, oy, zoom,
    zoomCapa: porAvance(avance),
    panCapa: (depth) => depth * escalaPerspectiva(avance, depth),
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

  // «avance» en vez de un zoom por capa suelto: así el modo libre y la cola se
  // mueven con la misma cámara, y una prueba rápida predice lo que hará la cola.
  const base = (ox: number, oy: number, avance = 0, ac: VistaCamara["alphaCapa"] = identidad): VistaCamara =>
    ({
      ox, oy, zoom: 1,
      zoomCapa: porAvance(avance),
      panCapa: (depth) => depth * escalaPerspectiva(avance, depth),
      alphaCapa: ac, t, fin,
    });

  switch (kind) {
    case "suave": {
      if (opts.modo === "tramo") {
        const a = avance * Math.PI * 2;
        return base(Math.sin(a) * k, Math.cos(a * 0.75) * k * 0.35);
      }
      const s = ms / 3000;
      return base(Math.sin(s) * k, Math.cos(s * 0.75) * k * 0.35);
    }
    case "izq-der":
      return base(tramoSwing * k, 0);
    case "der-izq":
      return base(-tramoSwing * k, 0);
    case "arriba-abajo":
      return base(0, tramoSwing * k * 0.65);
    case "abajo-arriba":
      return base(0, -tramoSwing * k * 0.65);
    case "acercar":
      return base(0, 0, avance * avanceIdle(k));
    case "alejar":
      return base(0, 0, (1 - avance) * avanceIdle(k));
    case "atravesar": {
      const a = avance * Math.min(AVANCE_MAX, 0.55 + k * 4);
      return base(0, 0, a, (depth) => {
        if (depth < 0.15) return 1;
        // Se desvanece según lo CERCA que esté ya, no según el reloj: así la
        // capa se apaga justo cuando la estás cruzando, no antes ni después.
        const cerca = escalaPerspectiva(a, depth);
        return 1 - smooth(2.2, 6, cerca);
      });
    }
    case "diagonal":
      return base(tramoSwing * k, tramoSwing * k * 0.55);
    case "orbita": {
      const a = (opts.modo === "tramo" ? avance : t) * Math.PI * 2;
      return base(Math.cos(a) * k, Math.sin(a) * k * 0.55);
    }
    case "dolly-izq":
      return base(
        -(opts.modo === "tramo" ? avance * 2 - 1 : tramoSwing) * k * 0.85,
        0,
        avance * avanceIdle(k) * 0.8,
      );
    default:
      return base(0, 0);
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
