import { describe, expect, it } from "vitest";
import { PALETA_VACIA, type PaletaIa } from "./paleta";
import {
  aleatorio, aplicarReparto, instruccionesReparto, repartoDeMedios, repartoPedido,
  TOPE_PARALAJE,
} from "./reparto-medios";

const TODO: PaletaIa = { ...PALETA_VACIA, paralaje: true, apng: true, sprites: true };

describe("aleatorio", () => {
  it("la misma semilla da la misma tirada", () => {
    const a = aleatorio(1234);
    const b = aleatorio(1234);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("semillas distintas no van a la par", () => {
    expect(aleatorio(1)()).not.toBe(aleatorio(2)());
  });
});

describe("repartoDeMedios", () => {
  it("sin paleta viva, todo plano", () => {
    expect(repartoDeMedios(6, PALETA_VACIA, 7)).toEqual({ still: 6, apng: 0, paralaje: 0 });
  });

  it("siempre suma las escenas pedidas", () => {
    for (let s = 0; s < 200; s++) {
      for (const n of [2, 3, 6, 8, 12]) {
        const r = repartoDeMedios(n, TODO, s);
        expect(r.still + r.apng + r.paralaje).toBe(n);
        expect(r.still).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("deja al menos una escena plana en cuanto hay tres", () => {
    for (let s = 0; s < 200; s++) {
      expect(repartoDeMedios(6, TODO, s).still).toBeGreaterThanOrEqual(1);
    }
  });

  it("no se pasa del tope de paralaje", () => {
    for (let s = 0; s < 200; s++) {
      expect(repartoDeMedios(12, TODO, s).paralaje).toBeLessThanOrEqual(TOPE_PARALAJE);
    }
  });

  it("NO sale siempre el mismo número, que era el problema", () => {
    const vistos = new Set<string>();
    for (let s = 0; s < 60; s++) {
      const r = repartoDeMedios(6, TODO, s);
      vistos.add(`${r.apng}/${r.paralaje}`);
    }
    expect(vistos.size).toBeGreaterThan(3);
  });

  it("respeta lo que la paleta apaga", () => {
    for (let s = 0; s < 50; s++) {
      expect(repartoDeMedios(6, { ...TODO, paralaje: false }, s).paralaje).toBe(0);
      expect(repartoDeMedios(6, { ...TODO, apng: false }, s).apng).toBe(0);
    }
  });

  it("con una sola escena hay algo vivo o no, pero cuadra", () => {
    const r = repartoDeMedios(1, TODO, 3);
    expect(r.still + r.apng + r.paralaje).toBe(1);
  });
});

describe("instruccionesReparto", () => {
  it("da números cerrados, no rangos", () => {
    const t = instruccionesReparto({ still: 3, apng: 2, paralaje: 1 });
    expect(t).toContain("EXACTAMENTE 2");
    expect(t).toContain("EXACTAMENTE 1");
    expect(t).toContain("las otras 3");
    expect(t).not.toMatch(/dos o tres/);
  });

  it("sin medios vivos lo dice y ya", () => {
    expect(instruccionesReparto({ still: 4, apng: 0, paralaje: 0 })).toContain("still");
  });
});

describe("aplicarReparto", () => {
  it("asciende hasta el número pedido eligiendo por la descripción", () => {
    const scenes = [
      { medio: "still", prompt: "Un retrato quieto en un cuarto vacío" },
      { medio: "still", prompt: "El mar rompe contra las rocas, olas altas" },
      { medio: "still", prompt: "Una mesa con papeles" },
      { medio: "still", prompt: "Un pasillo largo con columnas hacia el fondo" },
    ];
    const r = aplicarReparto(scenes, { still: 2, apng: 1, paralaje: 1 }, TODO);
    expect(r.ascendidas).toBe(2);
    expect(scenes[1].medio).toBe("apng");
    expect(scenes[3].medio).toBe("paralaje");
  });

  it("degrada lo que sobra", () => {
    const scenes = [
      { medio: "apng", prompt: "a" }, { medio: "apng", prompt: "b" },
      { medio: "apng", prompt: "c" }, { medio: "still", prompt: "d" },
    ];
    const r = aplicarReparto(scenes, { still: 3, apng: 1, paralaje: 0 }, TODO);
    expect(r.degradadas).toBe(2);
    expect(scenes.filter((s) => s.medio === "apng")).toHaveLength(1);
  });

  it("no asciende a lo que la paleta prohíbe", () => {
    const scenes = [{ medio: "still", prompt: "el río" }, { medio: "still", prompt: "un pasillo" }];
    aplicarReparto(scenes, { still: 0, apng: 1, paralaje: 1 }, { ...PALETA_VACIA, apng: true });
    expect(scenes.some((s) => s.medio === "paralaje")).toBe(false);
    expect(scenes.some((s) => s.medio === "apng")).toBe(true);
  });

  it("no toca nada si ya cuadra", () => {
    const scenes = [{ medio: "apng", prompt: "" }, { medio: "still", prompt: "" }];
    expect(aplicarReparto(scenes, { still: 1, apng: 1, paralaje: 0 }, TODO))
      .toEqual({ ascendidas: 0, degradadas: 0 });
  });
});

describe("repartoPedido", () => {
  it("respeta lo que se pide si cabe", () => {
    expect(repartoPedido(6, TODO, { apng: 2, paralaje: 1 }))
      .toEqual({ still: 3, apng: 2, paralaje: 1 });
  });

  it("permite pedir cero de todo", () => {
    expect(repartoPedido(6, TODO, {})).toEqual({ still: 6, apng: 0, paralaje: 0 });
  });

  it("no deja pedir lo que la paleta apaga", () => {
    expect(repartoPedido(6, { ...TODO, paralaje: false }, { apng: 2, paralaje: 3 }))
      .toEqual({ still: 4, apng: 2, paralaje: 0 });
  });

  it("recorta el paralaje primero cuando no cabe todo", () => {
    const r = repartoPedido(4, TODO, { apng: 4, paralaje: 3 });
    expect(r).toEqual({ still: 0, apng: 4, paralaje: 0 });
  });

  it("nunca pasa del tope de paralaje", () => {
    expect(repartoPedido(20, TODO, { paralaje: 99 }).paralaje).toBe(TOPE_PARALAJE);
  });

  it("aguanta números imposibles", () => {
    expect(repartoPedido(6, TODO, { apng: -3, paralaje: NaN }))
      .toEqual({ still: 6, apng: 0, paralaje: 0 });
  });
});
