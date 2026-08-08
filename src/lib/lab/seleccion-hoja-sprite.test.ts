import { describe, expect, it } from "vitest";
import {
  acotarMovimientoSeleccion,
  seleccionarComponenteHoja,
  seleccionarLazoHoja,
  seleccionarRectanguloHoja,
} from "./seleccion-hoja-sprite";

const fondo = { color: [255, 0, 255] as [number, number, number], tolerancia: 40 };

function imagen(ancho: number, alto: number, figura: Array<[number, number]>) {
  const d = new Uint8ClampedArray(ancho * alto * 4);
  for (let p = 0; p < ancho * alto; p++) {
    d[p * 4] = 255; d[p * 4 + 2] = 255; d[p * 4 + 3] = 255;
  }
  for (const [x, y] of figura) {
    const i = (y * ancho + x) * 4;
    d[i] = 20; d[i + 1] = 30; d[i + 2] = 40; d[i + 3] = 255;
  }
  return d;
}

describe("selección de objetos sobre la hoja", () => {
  it("encuentra solo el componente conectado que se pulsa", () => {
    const d = imagen(8, 5, [[1, 1], [2, 1], [2, 2], [6, 3]]);
    const s = seleccionarComponenteHoja(d, 8, 5, 1, 1, fondo);

    expect(s && { x: s.x, y: s.y, ancho: s.ancho, alto: s.alto, pixeles: s.pixeles })
      .toEqual({ x: 1, y: 1, ancho: 2, alto: 2, pixeles: 3 });
  });

  it("no confunde un magenta sombreado con parte del objeto", () => {
    const d = imagen(4, 3, [[2, 1]]);
    for (let p = 0; p < 4 * 3; p++) {
      if (p === 6) continue;
      d[p * 4] = 230; d[p * 4 + 1] = 57; d[p * 4 + 2] = 235;
    }
    const s = seleccionarComponenteHoja(d, 4, 3, 2, 1, fondo);

    expect(s && { x: s.x, y: s.y, ancho: s.ancho, alto: s.alto, pixeles: s.pixeles })
      .toEqual({ x: 2, y: 1, ancho: 1, alto: 1, pixeles: 1 });
  });

  it("el rectángulo ignora el croma aunque abarque espacio vacío", () => {
    const d = imagen(8, 5, [[1, 1], [4, 2], [7, 4]]);
    const s = seleccionarRectanguloHoja(d, 8, 5, { x: 0, y: 0 }, { x: 5, y: 3 }, fondo);

    expect(s?.pixeles).toBe(2);
    expect(s && [s.x, s.y, s.ancho, s.alto]).toEqual([1, 1, 4, 2]);
  });

  it("el lazo excluye figuras que quedan fuera", () => {
    const d = imagen(8, 6, [[2, 2], [3, 2], [6, 4]]);
    const s = seleccionarLazoHoja(d, 8, 6, [
      { x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }, { x: 1, y: 4 },
    ], fondo);

    expect(s?.pixeles).toBe(2);
    expect(s && [s.x, s.y, s.ancho, s.alto]).toEqual([2, 2, 2, 1]);
  });

  it("impide mover la selección fuera de la hoja", () => {
    expect(acotarMovimientoSeleccion(
      { x: 3, y: 2, ancho: 4, alto: 3 }, -20, 20, 10, 8,
    )).toEqual({ dx: -3, dy: 3 });
  });
});
