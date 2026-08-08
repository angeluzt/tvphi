// Capas que se mueven POR SU CUENTA, además de con la cámara.
//
// QUÉ FALTABA. Hasta ahora una capa solo se movía porque la cámara se movía:
// paralaje puro. Eso da profundidad, pero la escena sigue estando quieta —un
// decorado bonito al que le pasas la cámara por delante—. No había forma de que
// un pájaro cruzara el cuadro ni de que un barco navegara.
//
// LA IDEA. Cada capa puede llevar su propio movimiento, y como las capas ya
// llegan separadas y con fondo transparente, basta con desplazarlas al pintar.
// Un PNG con un pájaro y `deriva` cruza la escena; el mismo pájaro a
// profundidad 0.7 además se mueve con la cámara, así que sigue siendo 2.5D y no
// un sticker pegado encima.
//
// LO QUE ESTO NO ES. No anima el CONTENIDO de la imagen: el pájaro se desplaza,
// pero no bate las alas. Para eso harían falta varios fotogramas dibujados, que
// es otra cosa y cuesta una imagen por fotograma.

export type TipoMovCapa = "deriva" | "flotar" | "vaiven" | "pulso";

export interface MovCapa {
  tipo: TipoMovCapa;
  /**
   * deriva: velocidad en ANCHOS (o altos) de pantalla por segundo.
   * 0.05 es una nube; 0.25, un pájaro; 1.2, un meteoro.
   */
  x?: number;
  y?: number;
  /** deriva: al salir por un borde, vuelve a entrar por el contrario. */
  bucle?: boolean;
  /** flotar / vaiven / pulso: cuánto se aparta del sitio (0..1). */
  amplitud?: number;
  /** flotar / vaiven / pulso: lo que tarda un ciclo completo, en segundos. */
  segundos?: number;
  /** Desfase inicial (0..1 de un ciclo), para que dos capas no vayan a la vez. */
  desfase?: number;
}

export const MOVS_CAPA: { id: TipoMovCapa; label: string; pista: string }[] = [
  { id: "deriva", label: "Se desplaza", pista: "Cruza el cuadro a velocidad constante: un pájaro, un barco, una nube, un meteoro" },
  { id: "flotar", label: "Flota", pista: "Sube y baja despacio: una barca en el agua, un farolillo" },
  { id: "vaiven", label: "Vaivén", pista: "Se mece de lado a lado: ramas, una cortina, hierba alta" },
  { id: "pulso", label: "Late", pista: "Crece y encoge un poco: un resplandor, algo vivo" },
];

const num = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Deja el movimiento en valores que no rompan la escena.
 *
 * Los topes no son decorativos: una deriva de 50 saca la capa del cuadro en el
 * primer fotograma y parece que ha desaparecido, y una amplitud de 3 la manda a
 * dar una vuelta por fuera de la pantalla.
 */
export function normalizarMov(m: any): MovCapa | undefined {
  if (!m || typeof m !== "object") return undefined;
  const tipo = String(m.tipo ?? "").trim() as TipoMovCapa;
  if (!MOVS_CAPA.some((o) => o.id === tipo)) return undefined;

  const base: MovCapa = { tipo };
  if (tipo === "deriva") {
    base.x = acotar(num(m.x, 0), -3, 3);
    base.y = acotar(num(m.y, 0), -3, 3);
    // Una deriva de cero no es un movimiento, es una capa quieta con ceremonia.
    if (base.x === 0 && base.y === 0) return undefined;
    base.bucle = m.bucle !== false;
  } else {
    base.amplitud = acotar(num(m.amplitud, 0.03), 0, 0.5);
    base.segundos = acotar(num(m.segundos, 4), 0.3, 60);
    if (base.amplitud === 0) return undefined;
  }
  const d = num(m.desfase, 0);
  if (d) base.desfase = acotar(d, 0, 1);
  return base;
}

export interface Desplazamiento {
  /** En anchos / altos de pantalla, ya listo para sumar al dibujo. */
  dx: number;
  dy: number;
  /** Multiplicador de escala. 1 = tal cual. */
  escala: number;
  /** Si hay que pintar una segunda copia para que el bucle no deje hueco. */
  repetir: boolean;
}

const QUIETO: Desplazamiento = { dx: 0, dy: 0, escala: 1, repetir: false };

/** Dónde está esta capa en el segundo `t`. */
export function desplazamientoCapa(mov: MovCapa | undefined, t: number): Desplazamiento {
  if (!mov) return QUIETO;
  const fase = (mov.desfase ?? 0) * Math.PI * 2;

  if (mov.tipo === "deriva") {
    let dx = (mov.x ?? 0) * t;
    let dy = (mov.y ?? 0) * t;
    if (mov.bucle !== false) {
      // El ciclo es DOS anchos, no uno: con uno, una capa que ocupa todo el
      // cuadro salta al reaparecer. Con dos y una copia detrás, entra por un
      // lado mientras la otra sale por el otro y no se ve el corte.
      if (mov.x) dx = ((dx % 2) + 2) % 2 - 1;
      if (mov.y) dy = ((dy % 2) + 2) % 2 - 1;
    }
    return { dx, dy, escala: 1, repetir: mov.bucle !== false };
  }

  const w = (Math.PI * 2 * t) / (mov.segundos ?? 4) + fase;
  const a = mov.amplitud ?? 0.03;
  if (mov.tipo === "flotar") return { dx: 0, dy: Math.sin(w) * a, escala: 1, repetir: false };
  if (mov.tipo === "vaiven") return { dx: Math.sin(w) * a, dy: 0, escala: 1, repetir: false };
  // pulso
  return { dx: 0, dy: 0, escala: 1 + Math.sin(w) * a, repetir: false };
}

/** ¿Alguna capa se mueve sola? Si no, no hace falta ni mirar el reloj. */
export const hayMovimiento = (movs: (MovCapa | undefined)[]) => movs.some(Boolean);

// ── Lo que se le cuenta a la IA ─────────────────────────────────────────────

export function movimientosCapaParaIA() {
  return MOVS_CAPA.map((m) => ({
    tipo: m.id,
    hace: m.pista,
    campos: m.id === "deriva"
      ? { x: "anchos de pantalla por segundo (−3..3)", y: "igual, en vertical", bucle: "reaparece por el otro lado (por defecto sí)" }
      : { amplitud: "cuánto se aparta (0..0.5)", segundos: "lo que tarda un ciclo", desfase: "0..1, para desacompasar capas" },
  }));
}

export function reglasMovimientoCapa() {
  return [
    "Una capa con «mov» se mueve SOLA, además de moverse con la cámara. Es lo que hace que la escena esté viva y no sea un decorado quieto.",
    "Para que algo cruce el cuadro —un pájaro, un barco, un meteoro, una nube— dale una capa PARA ÉL SOLO, con el resto transparente, y ponle «deriva».",
    "Velocidades que funcionan: nube 0.02, barco 0.04, pájaro 0.2, meteoro 1.5 (con «y» positivo para que caiga).",
    "«bucle» hace que reaparezca por el lado contrario: bien para nubes y pájaros de fondo, mal para un meteoro que debe pasar UNA vez.",
    "«flotar» es para lo que se apoya en agua o cuelga; «vaiven» para ramas, hierba o telas; «pulso» para un resplandor.",
    "No le pongas movimiento al fondo ni al suelo: si se despega, se ve el borde y se rompe la escena.",
    "Dos capas con el mismo «segundos» se mecen a la vez y parecen una sola. Usa «desfase» distinto en cada una.",
    "El movimiento NO anima el dibujo: el pájaro se desplaza pero no bate las alas. Descríbelo ya en vuelo, con las alas abiertas.",
  ];
}
