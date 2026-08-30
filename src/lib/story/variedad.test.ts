import { describe, expect, it } from "vitest";
import { barajar, barajarCatalogo, instruccionesVariedad, sugerenciasDeTanda } from "./variedad";
import { aleatorio } from "./reparto-medios";
import { VFX } from "./vfx";
import { SONIDOS } from "./musica";

describe("barajar", () => {
  it("no pierde ni duplica nada", () => {
    const dentro = [1, 2, 3, 4, 5, 6, 7, 8];
    const fuera = barajar(dentro, aleatorio(9));
    expect([...fuera].sort((a, b) => a - b)).toEqual(dentro);
  });

  it("no toca el original", () => {
    const dentro = [1, 2, 3];
    barajar(dentro, aleatorio(1));
    expect(dentro).toEqual([1, 2, 3]);
  });

  it("con la misma semilla sale lo mismo", () => {
    expect(barajar([1, 2, 3, 4, 5], aleatorio(42)))
      .toEqual(barajar([1, 2, 3, 4, 5], aleatorio(42)));
  });
});

describe("sugerenciasDeTanda", () => {
  it("sugiere ids que existen de verdad", () => {
    const s = sugerenciasDeTanda(123);
    for (const id of s.efectos) expect(VFX.some((v) => v.id === id)).toBe(true);
    for (const id of [...s.golpes, ...s.ambientes]) {
      expect(SONIDOS.some((x) => x.id === id)).toBe(true);
    }
  });

  it("los ambientes son de bucle y los golpes no", () => {
    const s = sugerenciasDeTanda(7);
    for (const id of s.ambientes) expect(SONIDOS.find((x) => x.id === id)?.bucle).toBe(true);
    for (const id of s.golpes) expect(SONIDOS.find((x) => x.id === id)?.bucle).toBe(false);
  });

  it("dos familias, no una: si no, el capítulo entero suena igual", () => {
    const s = sugerenciasDeTanda(55);
    expect(s.gruposVfx).toHaveLength(2);
    expect(s.familiasSonido).toHaveLength(2);
  });

  it("cambia de verdad entre tandas", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 30; i++) vistas.add(sugerenciasDeTanda(i).efectos.join(","));
    expect(vistas.size).toBeGreaterThan(10);
  });
});

describe("instruccionesVariedad", () => {
  it("calla lo que está apagado", () => {
    const s = sugerenciasDeTanda(3);
    const sinNada = instruccionesVariedad(s, false, false);
    expect(sinNada).not.toMatch(/Efectos:/);
    expect(sinNada).not.toMatch(/Música:/);
    expect(sinNada).toMatch(/Sonidos:/);
  });

  it("con todo encendido nombra las tres cosas", () => {
    const t = instruccionesVariedad(sugerenciasDeTanda(3), true, true);
    expect(t).toMatch(/Efectos:/);
    expect(t).toMatch(/Sonidos:/);
    expect(t).toMatch(/Música:/);
  });
});

describe("barajarCatalogo", () => {
  it("mantiene el contenido y cambia el orden", () => {
    const orden = barajarCatalogo(VFX.map((v) => v.id), 11);
    expect(orden).toHaveLength(VFX.length);
    expect([...orden].sort()).toEqual(VFX.map((v) => v.id).sort());
    expect(orden.join()).not.toBe(VFX.map((v) => v.id).join());
  });
});
