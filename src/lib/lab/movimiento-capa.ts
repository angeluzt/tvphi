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
// pero no bate las alas. Para eso están los sprites de la biblioteca, que
// llevan sus fotogramas dentro (ver sprite-capa.ts) y usan ESTE mismo
// movimiento para cruzar el cuadro mientras aletean.

export type TipoMovCapa = "ruta" | "trayectoria" | "deriva" | "flotar" | "vaiven" | "pulso";

/**
 * Un punto de una ruta encadenada.
 *
 * Los sprites ya tenían esto —ir a A, esperar, ir a B, volverse— pero las capas
 * solo sabían hacer A→B, un tramo y se acabó. Un tren que para en dos
 * estaciones, una nube que rodea algo o una barca que va y vuelve por el mismo
 * sitio no se podían describir. Ahora es el mismo concepto para las dos cosas.
 *
 * Las coordenadas son DESPLAZAMIENTOS respecto a donde está la capa, no
 * posiciones absolutas: así la ruta sigue valiendo si luego mueves la capa.
 */
export interface PuntoRutaCapa {
  x: number;
  y: number;
  /** Lo que tarda en llegar aquí desde el punto anterior. */
  segundos: number;
  /** Quedarse quieto aquí al llegar, antes de seguir. */
  espera?: number;
  suavizado?: SuavizadoMovCapa;
}
export type EspacioMovCapa = "capa" | "pantalla";
export type SuavizadoMovCapa = "lineal" | "suave";

export interface MovCapa {
  tipo: TipoMovCapa;
  /**
   * capa: el recorrido vive dentro del plano 2.5D y hereda zoom/paralaje.
   * pantalla: la imagen completa ignora la cámara, como una sobreimpresión.
   */
  espacio?: EspacioMovCapa;
  /** Capa física —vía, agua, pasarela— cuya profundidad debe heredar. */
  referenciaCapaId?: string;
  /**
   * deriva: velocidad en ANCHOS (o altos) de su espacio por segundo.
   * 0.05 es una nube; 0.25, un pájaro; 1.2, un meteoro.
   */
  x?: number;
  y?: number;
  /** trayectoria: punto A como desplazamiento desde la alineación generada. */
  desdeX?: number;
  desdeY?: number;
  /** deriva: al salir por un borde, vuelve a entrar por el contrario. */
  bucle?: boolean;
  /** trayectoria: regresa suavemente de B a A en vez de saltar. */
  volver?: boolean;
  /** trayectoria: velocidad constante o aceleración/frenado suaves. */
  suavizado?: SuavizadoMovCapa;
  /** flotar / vaiven / pulso: cuánto se aparta del sitio (0..1). */
  amplitud?: number;
  /** flotar / vaiven / pulso: lo que tarda un ciclo completo, en segundos. */
  segundos?: number;
  /** Desfase inicial (0..1 de un ciclo), para que dos capas no vayan a la vez. */
  desfase?: number;
  /** ruta: los puntos por los que pasa, en orden. */
  pasos?: PuntoRutaCapa[];
}

// ── Rutas encadenadas ───────────────────────────────────────────────────────

/** Cuánto dura una ruta completa, contando esperas y la vuelta si la hay. */
export function duracionRuta(pasos: PuntoRutaCapa[], volver = false): number {
  const ida = pasos.reduce((a, p) => a + Math.max(0.01, p.segundos) + Math.max(0, p.espera ?? 0), 0);
  // Al volver no se repiten las esperas: son paradas del viaje de ida.
  const vuelta = volver ? pasos.reduce((a, p) => a + Math.max(0.01, p.segundos), 0) : 0;
  return ida + vuelta;
}

const suave = (p: number) => p * p * (3 - 2 * p);

/**
 * Dónde está la capa en el segundo `t` de su ruta.
 *
 * Arranca siempre en (0,0) —el sitio de la capa— y va hacia el primer punto.
 * Si `volver`, al llegar al último deshace el camino por los MISMOS puntos, que
 * es lo que se pide cuando algo tiene que regresar por donde vino y no dar un
 * salto de vuelta al origen.
 */
export function posicionEnRuta(
  pasos: PuntoRutaCapa[],
  t: number,
  opts: { bucle?: boolean; volver?: boolean } = {},
): { dx: number; dy: number } {
  if (!pasos.length) return { dx: 0, dy: 0 };

  const total = duracionRuta(pasos, opts.volver);
  let tiempo = Math.max(0, t);
  if (opts.bucle) tiempo = ((tiempo % total) + total) % total;
  else tiempo = Math.min(tiempo, total);

  // Los tramos de ida, cada uno con su espera al final.
  let x = 0, y = 0;
  for (const p of pasos) {
    const dur = Math.max(0.01, p.segundos);
    if (tiempo < dur) {
      const k = (p.suavizado ?? "suave") === "suave" ? suave(tiempo / dur) : tiempo / dur;
      return { dx: x + (p.x - x) * k, dy: y + (p.y - y) * k };
    }
    tiempo -= dur;
    x = p.x; y = p.y;
    const espera = Math.max(0, p.espera ?? 0);
    if (tiempo < espera) return { dx: x, dy: y };
    tiempo -= espera;
  }

  if (!opts.volver) return { dx: x, dy: y };

  // La vuelta: los mismos puntos al revés, terminando en el origen.
  const atras = [...pasos].reverse();
  for (let i = 0; i < atras.length; i++) {
    const destino = i + 1 < atras.length ? atras[i + 1] : { x: 0, y: 0 };
    const dur = Math.max(0.01, atras[i].segundos);
    if (tiempo < dur) {
      const k = (atras[i].suavizado ?? "suave") === "suave" ? suave(tiempo / dur) : tiempo / dur;
      return { dx: x + (destino.x - x) * k, dy: y + (destino.y - y) * k };
    }
    tiempo -= dur;
    x = destino.x; y = destino.y;
  }
  return { dx: x, dy: y };
}

export const MOVS_CAPA: { id: TipoMovCapa; label: string; pista: string }[] = [
  { id: "ruta", label: "Ruta por puntos", pista: "Encadena varios destinos con paradas: un tren que para en dos estaciones, una ronda que vuelve por donde vino" },
  { id: "trayectoria", label: "Punto A → punto B", pista: "Recorrido exacto integrado al plano: un tren sobre su vía, una puerta o una plataforma" },
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
  if (m.espacio === "pantalla") base.espacio = "pantalla";
  else base.espacio = "capa";
  if (typeof m.referenciaCapaId === "string" && m.referenciaCapaId.trim()) {
    base.referenciaCapaId = m.referenciaCapaId.trim().slice(0, 80);
    // Una referencia física y una capa fija a pantalla se contradicen. Gana la
    // referencia: es la que evita que un tren se despegue de su vía al hacer zoom.
    base.espacio = "capa";
  }
  if (tipo === "ruta") {
    // Los puntos vienen de tocar la escena, así que hay que acotarlos: un dedo
    // resbalado no puede mandar la capa a tres pantallas de distancia.
    const crudos = Array.isArray(m.pasos) ? m.pasos.slice(0, 24) : [];
    const pasos: PuntoRutaCapa[] = [];
    for (const p of crudos) {
      if (!p || typeof p !== "object") continue;
      pasos.push({
        x: acotar(num(p.x, 0), -3, 3),
        y: acotar(num(p.y, 0), -3, 3),
        segundos: acotar(num(p.segundos, 2), 0.1, 120),
        ...(num(p.espera, 0) > 0 ? { espera: acotar(num(p.espera, 0), 0, 60) } : {}),
        ...(p.suavizado === "lineal" ? { suavizado: "lineal" as const } : {}),
      });
    }
    // Una ruta sin puntos, o que no se mueve de su sitio, no es un movimiento.
    if (!pasos.length || pasos.every((p) => p.x === 0 && p.y === 0)) return undefined;
    base.pasos = pasos;
    base.bucle = m.bucle === true;
    base.volver = m.volver === true;
  } else if (tipo === "trayectoria") {
    base.desdeX = acotar(num(m.desdeX, 0), -3, 3);
    base.desdeY = acotar(num(m.desdeY, 0), -3, 3);
    base.x = acotar(num(m.x, 0.5), -3, 3);
    base.y = acotar(num(m.y, 0), -3, 3);
    base.segundos = acotar(num(m.segundos, 4), 0.1, 120);
    base.bucle = m.bucle === true;
    base.volver = m.volver === true;
    base.suavizado = m.suavizado === "lineal" ? "lineal" : "suave";
    if (base.desdeX === base.x && base.desdeY === base.y) return undefined;
  } else if (tipo === "deriva") {
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
  /** En anchos / altos del espacio elegido; el compositor aplica la transformación. */
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
      // El +1 conserva el fotograma cero en cero. Antes la fórmula arrancaba
      // en −1: una capa recién reproducida comenzaba fuera del cuadro y podía
      // tardar muchos segundos en aparecer.
      if (mov.x) dx = ((((dx + 1) % 2) + 2) % 2) - 1;
      if (mov.y) dy = ((((dy + 1) % 2) + 2) % 2) - 1;
    }
    return { dx, dy, escala: 1, repetir: mov.bucle !== false };
  }

  if (mov.tipo === "ruta") {
    const pasos = mov.pasos ?? [];
    if (!pasos.length) return QUIETO;
    const { dx, dy } = posicionEnRuta(pasos, t, { bucle: mov.bucle, volver: mov.volver });
    return { dx, dy, escala: 1, repetir: false };
  }

  if (mov.tipo === "trayectoria") {
    const dur = Math.max(0.1, mov.segundos ?? 4);
    const idaYVuelta = mov.volver === true;
    const total = dur * (idaYVuelta ? 2 : 1);
    const tiempo = mov.bucle ? ((Math.max(0, t) % total) + total) % total : Math.min(Math.max(0, t), total);
    let p = Math.min(1, tiempo / dur);
    if (idaYVuelta && tiempo > dur) p = 1 - (tiempo - dur) / dur;
    if ((mov.suavizado ?? "suave") === "suave") p = p * p * (3 - 2 * p);
    const ax = mov.desdeX ?? 0, ay = mov.desdeY ?? 0;
    return {
      dx: ax + ((mov.x ?? 0) - ax) * p,
      dy: ay + ((mov.y ?? 0) - ay) * p,
      escala: 1,
      repetir: false,
    };
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
    espacio: "capa = integrado al zoom/paralaje (por defecto); pantalla = sobreimpresión que ignora cámara",
    referenciaCapaId: "id de la vía, agua o superficie física; obliga espacio capa y hereda su profundidad",
    campos: m.id === "trayectoria"
      ? { desdeX: "A horizontal (−3..3)", desdeY: "A vertical", x: "B horizontal", y: "B vertical", segundos: "duración A→B", volver: "regresa B→A", bucle: "repite", suavizado: "suave|lineal" }
      : m.id === "deriva"
      ? { x: "anchos de su plano por segundo (−3..3)", y: "igual, en vertical", bucle: "reaparece por el otro lado (por defecto sí)" }
      : { amplitud: "cuánto se aparta (0..0.5)", segundos: "lo que tarda un ciclo", desfase: "0..1, para desacompasar capas" },
  }));
}

export function reglasMovimientoCapa() {
  return [
    "Una capa con «mov» se mueve SOLA. Usa espacio «capa» para que el recorrido se transforme junto con zoom/paralaje; «pantalla» solo para una sobreimpresión que debe ignorar la cámara.",
    "Si el objeto se apoya en otra capa —tren sobre vía, barco sobre agua, puerta en muro— escribe referenciaCapaId con el id de esa capa. La aplicación igualará su profundidad para que no se despegue al mover la cámara.",
    "Para un recorrido preciso usa «trayectoria»: A=(desdeX,desdeY), B=(x,y), segundos, suavizado; volver hace B→A y bucle repite.",
    "Para que algo cruce el cuadro —un pájaro, un barco, un meteoro, una nube— dale una capa PARA ÉL SOLO, con el resto transparente, y ponle «deriva».",
    "Velocidades que funcionan: nube 0.02, barco 0.04, pájaro 0.2, meteoro 1.5 (con «y» positivo para que caiga).",
    "«bucle» hace que reaparezca por el lado contrario: bien para nubes y pájaros de fondo, mal para un meteoro que debe pasar UNA vez.",
    "«flotar» es para lo que se apoya en agua o cuelga; «vaiven» para ramas, hierba o telas; «pulso» para un resplandor.",
    "No le pongas movimiento al fondo ni al suelo: si se despega, se ve el borde y se rompe la escena.",
    "Dos capas con el mismo «segundos» se mecen a la vez y parecen una sola. Usa «desfase» distinto en cada una.",
    "El movimiento NO anima el dibujo de una capa normal: el pájaro se desplaza pero no bate las alas. Descríbelo ya en vuelo, con las alas abiertas. (Los sprites de la biblioteca sí baten: llevan sus fotogramas dentro.)",
  ];
}
