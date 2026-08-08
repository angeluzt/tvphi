// Un sprite metido como capa del montaje.
//
// QUÉ CAMBIA RESPECTO A UNA CAPA NORMAL. Las capas de siempre son imágenes a
// pantalla completa que se apilan; una capa de sprite es un bicho pequeño
// colocado en un sitio concreto del plano, y encima con varios fotogramas que
// van rotando. Por eso lleva posición, tamaño y velocidad: sin eso, un pájaro
// de 44×80 estirado a todo el cuadro es un pájaro del tamaño de una casa.
//
// LO QUE NO CAMBIA, Y ES LO BUENO. El sprite vive DENTRO del plano de su capa,
// así que hereda todo lo que ya existía: la profundidad lo mueve con paralaje,
// «mov» lo hace cruzar o mecerse, y el zoom de cámara lo agranda como a
// cualquier otra cosa que esté a esa distancia. La biblioteca no inventa un
// sistema nuevo, se cuelga del que ya funcionaba.
//
// Y AHORA SÍ SE ANIMA EL DIBUJO. Hasta ahora un pájaro con «deriva» cruzaba el
// cuadro con las alas congeladas —está escrito como limitación en
// movimiento-capa.ts—. Con los fotogramas de la biblioteca, cruza aleteando.

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
  };
  if (typeof s.id === "string" && s.id) spr.id = s.id;
  if (s.espejo) spr.espejo = true;
  return spr;
}

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
) {
  const dh = plano.h * spr.alto;
  const dw = altoFot > 0 ? dh * (anchoFot / altoFot) : dh;
  return {
    dx: plano.x0 + spr.x * plano.w - dw / 2,
    dy: plano.y0 + spr.y * plano.h - dh / 2,
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
