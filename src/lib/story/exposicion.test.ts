import { describe, expect, it } from "vitest";
import {
  GANANCIA_MAX, GANANCIA_MIN, derivaNotable, gananciaHaciaPatron, mediaDeLuma,
} from "./exposicion";

/** N píxeles RGBA del mismo color. */
const plano = (n: number, r: number, g: number, b: number) => {
  const d = new Array(n * 4);
  for (let i = 0; i < n; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  return d;
};

describe("medir el brillo de un fotograma", () => {
  it("un gris plano da su propio valor", () => {
    expect(mediaDeLuma(plano(64, 128, 128, 128), 1)).toBeCloseTo(128, 4);
  });

  it("pesa el verde más que el azul, como el ojo", () => {
    // Una media plana de RGB llamaría iguales a estos dos, y no lo parecen.
    expect(mediaDeLuma(plano(16, 0, 255, 0), 1))
      .toBeGreaterThan(mediaDeLuma(plano(16, 0, 0, 255), 1) * 5);
  });

  it("muestrear no cambia la respuesta en una imagen plana", () => {
    const d = plano(2048, 100, 100, 100);
    expect(mediaDeLuma(d, 16)).toBeCloseTo(mediaDeLuma(d, 1), 4);
  });

  it("sin píxeles no hay brillo que medir", () => {
    expect(mediaDeLuma([], 8)).toBe(0);
  });
});

describe("igualar la exposición contra el original", () => {
  it("sube lo que salió oscuro y baja lo que salió claro", () => {
    expect(gananciaHaciaPatron(100, 90)).toBeCloseTo(100 / 90, 5);
    expect(gananciaHaciaPatron(100, 110)).toBeCloseTo(100 / 110, 5);
  });

  it("no aplasta un cambio de luz que es de verdad", () => {
    // Una llama que crece ilumina de más: corregirlo del todo mataría justo lo
    // que se quería animar. Se corrige la deriva, no la animación.
    expect(gananciaHaciaPatron(100, 10)).toBe(GANANCIA_MAX);
    expect(gananciaHaciaPatron(100, 400)).toBe(GANANCIA_MIN);
  });

  it("una imagen negra no se intenta igualar", () => {
    // patrón/0 daría infinito y dejaría el fotograma en blanco.
    expect(gananciaHaciaPatron(0, 50)).toBe(1);
    expect(gananciaHaciaPatron(100, 0)).toBe(1);
    expect(gananciaHaciaPatron(NaN, 50)).toBe(1);
  });

  it("una diferencia que no se ve no merece repintar", () => {
    expect(derivaNotable(1)).toBe(false);
    expect(derivaNotable(1.01)).toBe(false);
    expect(derivaNotable(1.06)).toBe(true);
    expect(derivaNotable(0.9)).toBe(true);
  });
});
