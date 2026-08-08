import { describe, expect, it } from "vitest";
import { desplazamientoParaCentrar, limitesCelda } from "./sprites";

describe("limitesCelda", () => {
  it("reparte todos los pixeles sin huecos ni solapamientos", () => {
    const celdas = Array.from({ length: 5 }, (_, i) => limitesCelda(1536, 5, i));

    expect(celdas.map((c) => c.tam)).toEqual([307, 307, 308, 307, 307]);
    expect(celdas[0].inicio).toBe(0);
    for (let i = 1; i < celdas.length; i++) {
      expect(celdas[i].inicio).toBe(celdas[i - 1].inicio + celdas[i - 1].tam);
    }
    expect(celdas.at(-1)!.inicio + celdas.at(-1)!.tam).toBe(1536);
  });
});

describe("desplazamientoParaCentrar", () => {
  it("centra la caja visible sin cambiar su tamano", () => {
    expect(desplazamientoParaCentrar(
      { x0: 20, y0: 10, x1: 59, y1: 29 },
      100,
      80,
    )).toEqual({ x: 10, y: 20 });
  });
});
