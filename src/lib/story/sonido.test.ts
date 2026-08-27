import { describe, expect, it } from "vitest";
import {
  acotarSonidosCapitulo, acotarVolumen, fueraDeRango, reglaDeVolumen,
  VOL_SONIDO_MAX, VOL_SONIDO_MIN,
} from "./sonido";

describe("acotarVolumen", () => {
  it("deja en paz lo que ya está en el rango", () => {
    expect(acotarVolumen(0.04)).toBe(0.04);
    expect(acotarVolumen(0.09)).toBe(0.09);
    expect(acotarVolumen(0.12)).toBe(0.12);
  });

  it("sube lo que no se oiría", () => {
    expect(acotarVolumen(0.01)).toBe(VOL_SONIDO_MIN);
  });

  it("respeta el silencio", () => {
    expect(acotarVolumen(0)).toBe(0);
  });

  it("traduce lo que se pasa CONSERVANDO el orden", () => {
    const fuerte = acotarVolumen(0.9);
    const medio = acotarVolumen(0.6);
    const flojo = acotarVolumen(0.3);
    expect(fuerte).toBeLessThanOrEqual(VOL_SONIDO_MAX);
    expect(flojo).toBeGreaterThanOrEqual(VOL_SONIDO_MIN);
    // Lo que quería sonar más fuerte sigue sonando más fuerte.
    expect(fuerte).toBeGreaterThan(medio);
    expect(medio).toBeGreaterThan(flojo);
  });

  it("1 se queda justo en el tope", () => {
    expect(acotarVolumen(1)).toBe(VOL_SONIDO_MAX);
  });

  it("la basura cae al de en medio", () => {
    expect(acotarVolumen("mucho")).toBe(0.08);
    expect(acotarVolumen(undefined)).toBe(0.08);
  });
});

describe("fueraDeRango", () => {
  it("distingue lo que hay que tocar", () => {
    expect(fueraDeRango(0.8)).toBe(true);
    expect(fueraDeRango(0.01)).toBe(true);
    expect(fueraDeRango(0.08)).toBe(false);
    expect(fueraDeRango(0)).toBe(false);
  });
});

describe("acotarSonidosCapitulo", () => {
  it("acota capas, sonidos de toma y cambios de volumen", () => {
    const p = {
      audioLayers: [{ volume: 0.35 }],
      scenes: [{
        shots: [{
          sfx: [{ volume: 0.8 }, { volume: 0.1 }],
          audioOverrides: [{ volume: null }, { volume: 0.6 }],
        }],
      }],
    };
    const { tocados } = acotarSonidosCapitulo(p as any);
    expect(tocados).toBe(3);
    expect(p.audioLayers[0].volume).toBeLessThanOrEqual(VOL_SONIDO_MAX);
    expect(p.scenes[0].shots[0].sfx[0].volume).toBeLessThanOrEqual(VOL_SONIDO_MAX);
    // El que ya estaba bien no se toca.
    expect(p.scenes[0].shots[0].sfx[1].volume).toBe(0.1);
    // «no cambies el volumen» sigue siendo eso y no un 0.08 nuevo.
    expect(p.scenes[0].shots[0].audioOverrides[0].volume).toBeNull();
  });

  it("aguanta un capítulo vacío", () => {
    expect(acotarSonidosCapitulo({}).tocados).toBe(0);
  });
});

describe("reglaDeVolumen", () => {
  it("dice los dos números", () => {
    const t = reglaDeVolumen();
    expect(t).toContain(String(VOL_SONIDO_MIN));
    expect(t).toContain(String(VOL_SONIDO_MAX));
  });
});
