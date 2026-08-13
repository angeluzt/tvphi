import type { PlanoMovimiento } from "./plano-movimiento";

// Colocar una capa A MANO, sin animarla.
//
// POR QUÉ NO VALÍA `mov`. Para empujar una capa un poco a la derecha había que
// darle una «trayectoria» de 0,01 s: un movimiento que en realidad no se mueve.
// Eso ocupaba el único hueco de animación que tiene la capa —así que colocar y
// animar se peleaban—, no sabía girar y se aplicaba desde el centro del lienzo.
//
// Esto es lo otro: una colocación fija que no consume tiempo ni reloj. Va en el
// plano YA transformado por la cámara (igual que `moverPlano` en «capa»), así
// que una pieza empujada a mano sigue pegada a su sitio del decorado cuando la
// cámara acerca o panea, que es justo lo que uno espera al acomodarla.
//
// EL PIVOTE es lo que hace útil el giro. Una pieza recortada —un farolillo del
// borde derecho— vive dentro de un PNG del tamaño del lienzo, casi todo vacío.
// Girar ese PNG por su centro mandaría el farolillo de paseo por la pantalla.
// Con el pivote en el centro real de la pieza, gira donde está.

export interface AjusteCapa {
  /** Desplazamiento libre, en fracción del plano de la capa. */
  dx: number;
  dy: number;
  /** Giro en grados alrededor del pivote. Positivo = a favor del reloj. */
  giro: number;
  /** Tamaño alrededor del pivote. 1 = como vino. */
  escala: number;
  /** Centro real de la pieza dentro de la imagen, en 0..1. */
  pivoteX: number;
  pivoteY: number;
}

export const AJUSTE_NEUTRO: Readonly<AjusteCapa> = Object.freeze({
  dx: 0, dy: 0, giro: 0, escala: 1, pivoteX: 0.5, pivoteY: 0.5,
});

export const LIMITES = {
  desplazamiento: 2,
  giro: 180,
  escalaMin: 0.1,
  escalaMax: 4,
} as const;

export function ajusteNeutro(): AjusteCapa {
  return { ...AJUSTE_NEUTRO };
}

const acotar = (v: unknown, alt: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return alt;
  return Math.max(min, Math.min(max, n));
};

/**
 * Un ajuste que no hace nada no se guarda.
 *
 * El pivote cuenta: una pieza recién separada tiene el suyo y todavía no se ha
 * tocado. Si eso se diera por «neutro» y se tirara al guardar, al reabrir el
 * proyecto la pieza giraría alrededor del centro del lienzo.
 */
export function esAjusteNeutro(a: AjusteCapa | undefined | null): boolean {
  if (!a) return true;
  return a.dx === 0 && a.dy === 0 && a.giro === 0 && a.escala === 1
    && a.pivoteX === 0.5 && a.pivoteY === 0.5;
}

/**
 * ¿La ha tocado alguien, o solo lleva su pivote?
 *
 * NO es lo contrario de `esAjusteNeutro`. Una pieza recién separada trae ya un
 * ajuste —su centro, para poder girar por donde debe— sin que nadie la haya
 * movido todavía: preguntando por lo neutro, las seis piezas salían marcadas
 * como «movida» nada más partir la capa y el aviso dejaba de significar nada.
 * Aquí se pregunta por lo que el usuario ha hecho, que es lo que se le enseña.
 */
export function estaColocadaAMano(a: AjusteCapa | undefined | null): boolean {
  if (!a) return false;
  return a.dx !== 0 || a.dy !== 0 || a.giro !== 0 || a.escala !== 1;
}

export function normalizarAjuste(a: unknown): AjusteCapa | undefined {
  if (!a || typeof a !== "object") return undefined;
  const o = a as Partial<Record<keyof AjusteCapa, unknown>>;
  const out: AjusteCapa = {
    dx: acotar(o.dx, 0, -LIMITES.desplazamiento, LIMITES.desplazamiento),
    dy: acotar(o.dy, 0, -LIMITES.desplazamiento, LIMITES.desplazamiento),
    giro: acotar(o.giro, 0, -LIMITES.giro, LIMITES.giro),
    escala: acotar(o.escala, 1, LIMITES.escalaMin, LIMITES.escalaMax),
    pivoteX: acotar(o.pivoteX, 0.5, -1, 2),
    pivoteY: acotar(o.pivoteY, 0.5, -1, 2),
  };
  return esAjusteNeutro(out) ? undefined : out;
}

/** Aplica un retoque sobre el ajuste que hubiera, acotado. */
export function conAjuste(
  base: AjusteCapa | undefined,
  patch: Partial<AjusteCapa>,
): AjusteCapa {
  const b = base ?? ajusteNeutro();
  return {
    dx: acotar(patch.dx ?? b.dx, 0, -LIMITES.desplazamiento, LIMITES.desplazamiento),
    dy: acotar(patch.dy ?? b.dy, 0, -LIMITES.desplazamiento, LIMITES.desplazamiento),
    giro: acotar(patch.giro ?? b.giro, 0, -LIMITES.giro, LIMITES.giro),
    escala: acotar(patch.escala ?? b.escala, 1, LIMITES.escalaMin, LIMITES.escalaMax),
    pivoteX: acotar(patch.pivoteX ?? b.pivoteX, 0.5, -1, 2),
    pivoteY: acotar(patch.pivoteY ?? b.pivoteY, 0.5, -1, 2),
  };
}

/** Empujar la capa un poco más, sin perder el resto del ajuste. */
export function desplazarAjuste(
  base: AjusteCapa | undefined,
  dx: number,
  dy: number,
): AjusteCapa {
  const b = base ?? ajusteNeutro();
  return conAjuste(b, { dx: b.dx + dx, dy: b.dy + dy });
}

/** El plano con el desplazamiento a mano ya sumado. */
export function planoAjustado(
  plano: PlanoMovimiento,
  a: AjusteCapa | undefined,
): PlanoMovimiento {
  if (!a || (a.dx === 0 && a.dy === 0)) return plano;
  return { ...plano, x0: plano.x0 + a.dx * plano.w, y0: plano.y0 + a.dy * plano.h };
}

/** Dónde cae el pivote de la pieza, en píxeles del lienzo. */
export function anclaAjuste(plano: PlanoMovimiento, a: AjusteCapa) {
  return { x: plano.x0 + a.pivoteX * plano.w, y: plano.y0 + a.pivoteY * plano.h };
}

/** ¿Hay algo que el `drawImage` de siempre no sepa hacer por su cuenta? */
export function necesitaTransformar(a: AjusteCapa | undefined): boolean {
  return !!a && (a.giro !== 0 || a.escala !== 1);
}

/**
 * Cuánto se sale la capa del cuadro por culpa del ajuste, en fracción.
 *
 * Solo la usa el fondo opaco, que se agranda lo justo para no enseñar el negro
 * del lienzo por el canto cuando algo lo desplaza.
 */
export function holguraDelAjuste(a: AjusteCapa | undefined): number {
  if (!a) return 0;
  return Math.max(Math.abs(a.dx), Math.abs(a.dy));
}

/**
 * Deja el contexto girado y escalado alrededor del pivote, y devuelve el plano
 * ya desplazado. Hay que llamarla DENTRO de un `save()`/`restore()`.
 */
export function transformarPorAjuste(
  c: CanvasRenderingContext2D,
  plano: PlanoMovimiento,
  a: AjusteCapa | undefined,
): PlanoMovimiento {
  const p = planoAjustado(plano, a);
  if (!a || !necesitaTransformar(a)) return p;
  const { x, y } = anclaAjuste(p, a);
  c.translate(x, y);
  if (a.giro) c.rotate((a.giro * Math.PI) / 180);
  if (a.escala !== 1) c.scale(a.escala, a.escala);
  c.translate(-x, -y);
  return p;
}
