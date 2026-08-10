import { describe, it, expect } from "vitest";
import {
  profundidadesEscalonadas, desfasesDelGrupo, movimientoParaGrupo,
  repartirPorCandado, resumenDelGrupo, ES_CICLICO,
} from "./grupo-capas";

// El paralaje no es una propiedad de una capa: es la relación entre varias. Lo
// que se prueba aquí es que esa relación salga bien de una sola operación, sin
// que haya que teclear cinco profundidades y volver a corregirlas.

describe("profundidadesEscalonadas", () => {
  it("reparte de fondo a frente en el orden de la pila", () => {
    const m = profundidadesEscalonadas(["a", "b", "c"], 0, 1);
    expect(m.get("a")).toBe(0);
    expect(m.get("b")).toBe(0.5);
    expect(m.get("c")).toBe(1);
  });

  it("respeta un rango estrecho: capas cercanas se separan poco", () => {
    // Tres árboles del mismo bosquecillo: se quieren distintos, no en planos
    // opuestos de la escena.
    const m = profundidadesEscalonadas(["a", "b", "c"], 0.4, 0.6);
    expect(m.get("a")).toBe(0.4);
    expect(m.get("b")).toBe(0.5);
    expect(m.get("c")).toBe(0.6);
  });

  it("admite el rango al revés y escalona de frente a fondo", () => {
    const m = profundidadesEscalonadas(["a", "b", "c"], 1, 0);
    expect(m.get("a")).toBe(1);
    expect(m.get("c")).toBe(0);
  });

  it("con una sola capa la deja en el extremo de fondo, no en el medio", () => {
    expect(profundidadesEscalonadas(["a"], 0.2, 0.9).get("a")).toBe(0.2);
  });

  it("nunca se sale de 0..1 aunque se lo pidan", () => {
    const m = profundidadesEscalonadas(["a", "b"], -3, 7);
    expect(m.get("a")).toBe(0);
    expect(m.get("b")).toBe(1);
  });

  it("da valores de dos decimales, no colas de coma flotante", () => {
    for (const v of profundidadesEscalonadas(["a", "b", "c", "d", "e", "f", "g"], 0, 1).values()) {
      expect(v).toBe(Math.round(v * 100) / 100);
    }
  });
});

describe("desfasesDelGrupo", () => {
  it("reparte el ciclo entero entre las capas", () => {
    const m = desfasesDelGrupo(["a", "b", "c", "d"]);
    expect([...m.values()]).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("ninguno llega a 1: 1 es lo mismo que 0", () => {
    for (const v of desfasesDelGrupo(["a", "b", "c"]).values()) {
      expect(v).toBeLessThan(1);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("es estable: la misma selección da los mismos números", () => {
    expect([...desfasesDelGrupo(["x", "y"]).values()])
      .toEqual([...desfasesDelGrupo(["x", "y"]).values()]);
  });
});

describe("movimientoParaGrupo", () => {
  it("copia el movimiento tal cual a cada capa", () => {
    const m = movimientoParaGrupo({ tipo: "deriva", x: 0.08, y: 0, bucle: true }, ["a", "b"]);
    expect(m.get("a")?.tipo).toBe("deriva");
    expect(m.get("b")?.x).toBe(0.08);
  });

  it("desfasa los cíclicos para que no se mezan a la vez", () => {
    const m = movimientoParaGrupo(
      { tipo: "vaiven", amplitud: 0.04, segundos: 4 },
      ["a", "b", "c"],
      { desfasar: true },
    );
    const fases = ["a", "b", "c"].map((id) => m.get(id)?.desfase ?? 0);
    expect(new Set(fases).size).toBe(3);
  });

  it("NO mete desfase en una ruta: no tiene ciclo que correr", () => {
    const m = movimientoParaGrupo(
      { tipo: "ruta", pasos: [{ x: 0.3, y: 0, segundos: 2 }] },
      ["a", "b"],
      { desfasar: true },
    );
    expect(m.get("a")?.desfase).toBeUndefined();
    expect(m.get("b")?.pasos).toHaveLength(1);
  });

  it("sin desfasar, todas quedan idénticas", () => {
    const m = movimientoParaGrupo(
      { tipo: "flotar", amplitud: 0.03, segundos: 4 }, ["a", "b"],
    );
    expect(m.get("a")).toEqual(m.get("b"));
  });

  it("pasa por la normalización, así que no cuela un movimiento roto", () => {
    // Amplitud 0 no es un movimiento; normalizarMov lo descarta.
    const m = movimientoParaGrupo({ tipo: "flotar", amplitud: 0, segundos: 4 }, ["a"]);
    expect(m.get("a")).toBeUndefined();
  });
});

describe("ES_CICLICO", () => {
  it("distingue los que se mecen de los que van a algún sitio", () => {
    expect(ES_CICLICO("flotar")).toBe(true);
    expect(ES_CICLICO("vaiven")).toBe(true);
    expect(ES_CICLICO("pulso")).toBe(true);
    expect(ES_CICLICO("ruta")).toBe(false);
    expect(ES_CICLICO("deriva")).toBe(false);
    expect(ES_CICLICO(undefined)).toBe(false);
  });
});

describe("repartirPorCandado", () => {
  const capas = [
    { id: "a" }, { id: "b", bloqueada: true }, { id: "c" }, { id: "d" },
  ];

  it("el candado gana también en bloque", () => {
    const { destino, bloqueadas } = repartirPorCandado(capas, ["a", "b", "c"]);
    expect(destino.map((c) => c.id)).toEqual(["a", "c"]);
    expect(bloqueadas.map((c) => c.id)).toEqual(["b"]);
  });

  it("ignora ids que ya no existen", () => {
    const { destino } = repartirPorCandado(capas, ["a", "fantasma"]);
    expect(destino.map((c) => c.id)).toEqual(["a"]);
  });

  it("conserva el orden de la pila, no el de la selección", () => {
    // Importa: el escalonado de profundidad se hace sobre este orden.
    const { destino } = repartirPorCandado(capas, ["d", "a", "c"]);
    expect(destino.map((c) => c.id)).toEqual(["a", "c", "d"]);
  });
});

describe("resumenDelGrupo", () => {
  it("dice cuántas y cuántas se saltó", () => {
    expect(resumenDelGrupo(3, 1, "paralaje aplicado")).toMatch(/3 capas.*1 bloqueada/);
  });

  it("singulariza", () => {
    expect(resumenDelGrupo(1, 0, "paralaje aplicado")).toContain("1 capa.");
  });

  it("cuando todo estaba bloqueado, explica qué hacer", () => {
    expect(resumenDelGrupo(0, 2, "aplicarlo")).toMatch(/quita el candado/);
  });

  it("y cuando no había nada seleccionado, lo dice claro", () => {
    expect(resumenDelGrupo(0, 0, "aplicarlo")).toMatch(/No hay capas/);
  });
});
