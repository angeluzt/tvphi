import { describe, expect, it } from "vitest";
import { moverPlano, planoCentrado } from "./plano-movimiento";

describe("movimiento dentro del plano 2.5D", () => {
  it("escala el recorrido junto con el zoom para no despegar un tren de su vía", () => {
    const normal = moverPlano(
      planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 1 }),
      { dx: 0.25, dy: 0, escala: 1, repetir: false },
      "capa", 1000, 500,
    );
    const zoom = moverPlano(
      planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 2 }),
      { dx: 0.25, dy: 0, escala: 1, repetir: false },
      "capa", 1000, 500,
    );

    // La distancia propia también se duplica: 250 → 500 px.
    expect(normal.x0).toBe(250);
    expect(zoom.x0).toBe(0); // base −500 + recorrido local +500
  });

  it("mantiene constante el recorrido absoluto cuando se elige pantalla", () => {
    const zoom = moverPlano(
      planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 2 }),
      { dx: 0.25, dy: 0, escala: 1, repetir: false },
      "pantalla", 1000, 500,
    );
    expect(zoom.x0).toBe(-250); // base −500 + 250 px de pantalla
  });
});
