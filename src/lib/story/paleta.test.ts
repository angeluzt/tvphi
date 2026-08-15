import { describe, expect, it } from "vitest";
import {
  instruccionesPaleta, medioPermitido, normalizarPaleta, PALETA_VACIA,
} from "./paleta";

describe("normalizarPaleta", () => {
  it("basura → vacía con still y vfx/musica encendidos", () => {
    expect(normalizarPaleta(null)).toEqual(PALETA_VACIA);
    expect(normalizarPaleta({ still: false, paralaje: "sí" }).still).toBe(true);
  });

  it("respeta booleanos de verdad", () => {
    const p = normalizarPaleta({ paralaje: true, apng: true, sprites: false, vfx: false, musica: false });
    expect(p.paralaje).toBe(true);
    expect(p.apng).toBe(true);
    expect(p.sprites).toBe(false);
    expect(p.vfx).toBe(false);
    expect(p.musica).toBe(false);
  });
});

describe("medioPermitido", () => {
  it("apaga lo que la paleta no deja", () => {
    expect(medioPermitido("apng", PALETA_VACIA)).toBe("still");
    expect(medioPermitido("paralaje", PALETA_VACIA)).toBe("still");
    expect(medioPermitido("apng", { ...PALETA_VACIA, apng: true })).toBe("apng");
  });
});

describe("instruccionesPaleta", () => {
  it("nombra lo prohibido cuando está apagado", () => {
    const t = instruccionesPaleta(PALETA_VACIA);
    expect(t).toMatch(/PROHIBIDO inventar:.*paralaje/);
    expect(t).toMatch(/apng/);
    expect(t).toMatch(/Permitido:.*still/);
    expect(t).toMatch(/UNA foto entera/);
  });
});
