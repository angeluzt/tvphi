import type { Desplazamiento, EspacioMovCapa, MovCapa } from "./movimiento-capa";

export interface PlanoMovimiento {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Rectángulo de una capa una vez aplicados zoom, profundidad y paneo. */
export function planoCentrado({
  lienzoW, lienzoH, escala, ox = 0, oy = 0, pan = 0,
}: {
  lienzoW: number;
  lienzoH: number;
  escala: number;
  ox?: number;
  oy?: number;
  pan?: number;
}): PlanoMovimiento {
  const w = lienzoW * escala;
  const h = lienzoH * escala;
  return {
    x0: -(w - lienzoW) / 2 + ox * pan * lienzoW,
    y0: -(h - lienzoH) / 2 + oy * pan * lienzoH,
    w,
    h,
  };
}

/**
 * Aplica el recorrido en el sistema correcto.
 *
 * En «capa», 0.25 significa una cuarta parte DEL PLANO YA TRANSFORMADO. Así
 * tren y vía conservan la misma relación cuando la cámara acerca, aleja o
 * panea. En «pantalla» significa una cuarta parte del lienzo final.
 */
export function moverPlano(
  plano: PlanoMovimiento,
  propio: Desplazamiento,
  espacio: EspacioMovCapa,
  lienzoW: number,
  lienzoH: number,
): PlanoMovimiento {
  const fx = espacio === "capa" ? plano.w : lienzoW;
  const fy = espacio === "capa" ? plano.h : lienzoH;
  return {
    ...plano,
    x0: plano.x0 + propio.dx * fx,
    y0: plano.y0 + propio.dy * fy,
  };
}

/** Segunda copia que acompaña una deriva con vuelta por el borde. */
export function copiarPlanoBucle(
  plano: PlanoMovimiento,
  mov: MovCapa,
  espacio: EspacioMovCapa,
  lienzoW: number,
  lienzoH: number,
) {
  const fx = espacio === "capa" ? plano.w : lienzoW;
  const fy = espacio === "capa" ? plano.h : lienzoH;
  return {
    horizontal: mov.x
      ? { ...plano, x0: plano.x0 - Math.sign(mov.x) * 2 * fx }
      : undefined,
    vertical: mov.y
      ? { ...plano, y0: plano.y0 - Math.sign(mov.y) * 2 * fy }
      : undefined,
  };
}
