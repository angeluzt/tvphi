import { describe, expect, it } from "vitest";
import { desplazamientoCapa, normalizarMov } from "./movimiento-capa";

describe("movimiento propio de capas", () => {
  it("conserva todos los controles de desplazamiento que comparten IA y usuario", () => {
    expect(normalizarMov({ tipo: "deriva", x: -3, y: 3, bucle: false })).toEqual({
      tipo: "deriva",
      espacio: "capa",
      x: -3,
      y: 3,
      bucle: false,
    });
  });

  it("conserva amplitud, ciclo y desfase de los movimientos cíclicos", () => {
    expect(normalizarMov({ tipo: "flotar", amplitud: 0.5, segundos: 60, desfase: 1 })).toEqual({
      tipo: "flotar",
      espacio: "capa",
      amplitud: 0.5,
      segundos: 60,
      desfase: 1,
    });
  });

  it("hace que el preset del tren avance a la derecha y reaparezca", () => {
    const tren = { tipo: "deriva" as const, x: 0.04, y: 0, bucle: true };
    const antes = desplazamientoCapa(tren, 5);
    const despues = desplazamientoCapa(tren, 6);
    expect(antes.dx).toBeCloseTo(0.2);
    expect(despues.dx - antes.dx).toBeCloseTo(0.04);
    expect(despues).toMatchObject({ dy: 0, repetir: true });
  });

  it("rechaza una deriva inmóvil para no guardar una animación engañosa", () => {
    expect(normalizarMov({ tipo: "deriva", x: 0, y: 0, bucle: true })).toBeUndefined();
  });

  it("interpola una trayectoria A→B con ritmo lineal y puede volver", () => {
    const mov = normalizarMov({
      tipo: "trayectoria", desdeX: -0.5, desdeY: 0.2, x: 0.5, y: -0.2,
      segundos: 4, suavizado: "lineal", volver: true, bucle: false,
    });
    expect(desplazamientoCapa(mov, 2)).toMatchObject({ dx: 0, dy: 0 });
    expect(desplazamientoCapa(mov, 4)).toMatchObject({ dx: 0.5, dy: -0.2 });
    expect(desplazamientoCapa(mov, 6)).toMatchObject({ dx: 0, dy: 0 });
    expect(desplazamientoCapa(mov, 8)).toMatchObject({ dx: -0.5, dy: 0.2 });
  });

  it("una referencia física obliga a usar el plano 2.5D", () => {
    expect(normalizarMov({
      tipo: "trayectoria", espacio: "pantalla", referenciaCapaId: "via",
      desdeX: 0, desdeY: 0, x: 1, y: 0,
    })).toMatchObject({ espacio: "capa", referenciaCapaId: "via" });
  });
});
