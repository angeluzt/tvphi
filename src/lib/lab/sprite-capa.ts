// Un sprite metido como capa del montaje.
//
// QUÉ CAMBIA RESPECTO A UNA CAPA NORMAL. Las capas de siempre son imágenes a
// pantalla completa que se apilan; una capa de sprite es un bicho pequeño
// colocado en un sitio concreto del plano, y encima con varios fotogramas que
// van rotando. Por eso lleva posición, tamaño y velocidad: sin eso, un pájaro
// de 44×80 estirado a todo el cuadro es un pájaro del tamaño de una casa.
//
// DOS ESPACIOS, A PROPÓSITO. Lo normal es que el sprite viva sobre el lienzo:
// así un meteoro puede ir de A a B sin que un paneo de cámara le tuerza la
// trayectoria. Cuando sí tiene que formar parte del decorado, «capa» conserva
// el comportamiento 2.5D anterior y hereda paralaje, zoom y transiciones.
//
// Y AHORA SÍ SE ANIMA EL DIBUJO. Hasta ahora un pájaro con «deriva» cruzaba el
// cuadro con las alas congeladas —está escrito como limitación en
// movimiento-capa.ts—. Con los fotogramas de la biblioteca, cruza aleteando.

export type EspacioSprite = "pantalla" | "capa";

export interface TrayectoriaSprite {
  /** Destino absoluto, en proporción del ancho y alto del lienzo. */
  x: number;
  y: number;
  /** Tiempo de A a B. */
  segundos: number;
  /** Al llegar a B vuelve a A y repite. Útil si ambos puntos están fuera. */
  bucle?: boolean;
}

export interface SpriteEnCapa {
  /** El id en la biblioteca, si vino de ahí. Sirve para volver a bajarlo. */
  id?: string;
  fotogramas: number;
  /** Fotogramas por segundo del ciclo. */
  fps: number;
  /** Centro del bicho, 0..1 sobre el plano de la capa. */
  x: number;
  y: number;
  /** Alto del bicho como fracción del alto del plano. 0.1 = una décima. */
  alto: number;
  /**
   * pantalla: independiente de paneos, zooms y fundidos de cámara.
   * capa: se transforma junto con su capa, como en los montajes antiguos.
   */
  espacio: EspacioSprite;
  /** Recorrido absoluto desde (x,y) hasta este destino. */
  trayectoria?: TrayectoriaSprite;
  /** Voltearlo para que mire al otro lado. */
  espejo?: boolean;
}

const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const num = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * Deja los valores donde no rompan nada.
 *
 * La posición se deja salirse un poco del plano a propósito (−0.5..1.5): un
 * pájaro con «deriva» tiene que poder empezar fuera del cuadro y entrar, y si
 * se acotara a 0..1 aparecería de golpe en el borde.
 */
export function normalizarSprite(s: any): SpriteEnCapa | undefined {
  if (!s || typeof s !== "object") return undefined;
  const fotogramas = Math.round(acotar(num(s.fotogramas, 0), 1, 24));
  if (!fotogramas) return undefined;
  const spr: SpriteEnCapa = {
    fotogramas,
    fps: Math.round(acotar(num(s.fps, 10), 1, 60)),
    x: acotar(num(s.x, 0.5), -0.5, 1.5),
    y: acotar(num(s.y, 0.5), -0.5, 1.5),
    alto: acotar(num(s.alto, 0.2), 0.01, 2),
    // Los ZIP creados antes de existir este campo seguían la cámara. Se
    // conservan así al importarlos; los sprites NUEVOS sí se crean en pantalla.
    espacio: s.espacio === "pantalla" ? "pantalla" : "capa",
  };
  if (typeof s.id === "string" && s.id) spr.id = s.id;
  if (s.espejo) spr.espejo = true;
  if (s.trayectoria && typeof s.trayectoria === "object") {
    spr.trayectoria = {
      x: acotar(num(s.trayectoria.x, spr.x), -0.5, 1.5),
      y: acotar(num(s.trayectoria.y, spr.y), -0.5, 1.5),
      segundos: acotar(num(s.trayectoria.segundos, 4), 0.1, 120),
      ...(s.trayectoria.bucle ? { bucle: true } : {}),
    };
  }
  return spr;
}

/** Posición del sprite en un instante: A es (spr.x,spr.y), B la trayectoria. */
export function posicionSprite(spr: SpriteEnCapa, t: number) {
  const tr = spr.trayectoria;
  if (!tr) return { x: spr.x, y: spr.y };
  const dur = Math.max(0.1, tr.segundos);
  const tiempo = Math.max(0, t);
  const p = tr.bucle ? (tiempo % dur) / dur : Math.min(1, tiempo / dur);
  return {
    x: spr.x + (tr.x - spr.x) * p,
    y: spr.y + (tr.y - spr.y) * p,
  };
}

/** Ausente solo en objetos viejos aún no normalizados: esos seguían la cámara. */
export const spriteSigueCamara = (spr: SpriteEnCapa) => spr.espacio !== "pantalla";

/** Qué fotograma toca en el segundo `t`. */
export function fotogramaEn(spr: SpriteEnCapa, t: number): number {
  if (spr.fotogramas < 2) return 0;
  const i = Math.floor(t * spr.fps) % spr.fotogramas;
  return i < 0 ? i + spr.fotogramas : i;
}

/** El plano de una capa: dónde ha quedado el rectángulo completo, ya con cámara. */
export interface Plano {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/**
 * Dónde y de qué tamaño se pinta el bicho dentro de su plano.
 *
 * El alto manda y el ancho sale de la proporción del fotograma: al revés, un
 * pájaro ancho y otro estrecho pedidos «del mismo tamaño» saldrían con alturas
 * distintas, que es lo que se nota.
 */
export function cajaSprite(
  spr: SpriteEnCapa,
  anchoFot: number,
  altoFot: number,
  plano: Plano,
  t = 0,
) {
  const pos = posicionSprite(spr, t);
  const dh = plano.h * spr.alto;
  const dw = altoFot > 0 ? dh * (anchoFot / altoFot) : dh;
  return {
    dx: plano.x0 + pos.x * plano.w - dw / 2,
    dy: plano.y0 + pos.y * plano.h - dh / 2,
    dw,
    dh,
  };
}

/**
 * Pinta un fotograma de la tira.
 *
 * La tira no se parte nunca: se dibuja el trozo que toca con el `drawImage` de
 * nueve argumentos. Una imagen en memoria en vez de doce, y ni un canvas
 * intermedio.
 */
export function pintarSprite(
  c: CanvasRenderingContext2D,
  tira: CanvasImageSource,
  spr: SpriteEnCapa,
  anchoFot: number,
  altoFot: number,
  i: number,
  caja: { dx: number; dy: number; dw: number; dh: number },
) {
  const sx = i * anchoFot;
  if (spr.espejo) {
    c.save();
    // Voltear es escalar por −1 alrededor del centro del bicho. Hay que
    // trasladar antes, o el sprite se va al otro lado de la pantalla.
    c.translate(caja.dx + caja.dw / 2, 0);
    c.scale(-1, 1);
    c.drawImage(tira, sx, 0, anchoFot, altoFot, -caja.dw / 2, caja.dy, caja.dw, caja.dh);
    c.restore();
    return;
  }
  c.drawImage(tira, sx, 0, anchoFot, altoFot, caja.dx, caja.dy, caja.dw, caja.dh);
}
