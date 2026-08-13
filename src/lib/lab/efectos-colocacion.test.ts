import { describe, expect, it } from "vitest";
import {
  anclarEfectos, franjaDeArriba, normalizarEfectos, separarApilados,
} from "./efectos-escena";

// Los tres fallos que salieron probando dos escenas de mercado nocturno:
// la lluvia como un chorro, los pétalos igual, y las lámparas apiladas en la
// esquina de arriba a la izquierda.

describe("el tiempo atmosférico cubre el cuadro, no sale de un agujero", () => {
  it("la lluvia se extiende de lado a lado aunque la IA mande un punto", () => {
    // Esto es lo que llegó de verdad: forma «arriba» con los dos extremos
    // pegados en (0.5, 0.5). Salía un chorro en mitad de la escena.
    const { efectos } = normalizarEfectos([
      { id: "lluvia", forma: "arriba", x: 0.5, y: 0.5, ancla: "zona-lluvia" },
    ]);
    expect(efectos).toHaveLength(1);
    const e = efectos[0];
    expect({ x: e.x, y: e.y, x2: e.x2, y2: e.y2 }).toEqual(franjaDeArriba());
    expect(e.x2 - e.x).toBe(1);
  });

  it("los pétalos no se aceptan como punto: caen sobre toda la escena", () => {
    const { efectos } = normalizarEfectos([{ id: "hojas", forma: "punto", x: 0.05, y: 0.05 }]);
    expect(efectos[0].shape).toBe("arriba");
    expect(efectos[0].x2 - efectos[0].x).toBe(1);
  });

  it("la nieve y la ceniza, igual", () => {
    for (const id of ["nieve", "ceniza"]) {
      const { efectos } = normalizarEfectos([{ id, forma: "linea", x: 0.3, y: 0.9 }]);
      expect(efectos[0].shape).toBe("arriba");
    }
  });

  it("lo que SÍ va en un sitio conserva el suyo", () => {
    const { efectos } = normalizarEfectos([{ id: "humo", forma: "punto", x: 0.175, y: 0.683 }]);
    expect(efectos[0].shape).toBe("punto");
    expect(efectos[0].x).toBeCloseTo(0.175, 5);
    expect(efectos[0].y).toBeCloseTo(0.683, 5);
  });
});

describe("un ancla que no existe no manda el efecto a la esquina", () => {
  const anclas = [{ id: "plancha", caja: { x: 0.1, y: 0.6, w: 0.2, h: 0.1 }, depth: 0.55 }];

  it("lo pone en el centro y lo dice", () => {
    // Caso real: «faroles-izquierdos» no era ninguna forma del mapa, y la
    // lámpara se quedaba en (0.05, 0.05) — la esquina de arriba a la izquierda.
    const { efectos } = normalizarEfectos([
      { id: "lampara", forma: "punto", x: 0.05, y: 0.05, ancla: "faroles-izquierdos" },
    ]);
    const r = anclarEfectos(efectos, anclas);
    expect(r.efectos[0].x).toBe(0.5);
    expect(r.efectos[0].y).toBe(0.55);
    expect(r.avisos[0]).toMatch(/faroles-izquierdos/);
    expect(r.avisos[0]).toMatch(/centro/);
  });

  it("cuando el ancla sí existe, manda el ancla", () => {
    const { efectos } = normalizarEfectos([
      { id: "humo", forma: "punto", x: 0.9, y: 0.9, ancla: "plancha" },
    ]);
    const r = anclarEfectos(efectos, anclas);
    expect(r.efectos[0].x).toBeCloseTo(0.2, 5);
    expect(r.avisos).toHaveLength(0);
  });

  it("la lluvia anclada a algo sigue cubriendo el cuadro", () => {
    const { efectos } = normalizarEfectos([{ id: "lluvia", forma: "arriba", ancla: "plancha" }]);
    const r = anclarEfectos(efectos, anclas);
    // Del ancla solo toma la distancia; la franja no se encoge a la plancha.
    expect(r.efectos[0].x2 - r.efectos[0].x).toBe(1);
    expect(r.efectos[0].depth).toBe(0.55);
  });

  it("a una franja con ancla rota no le dice que la ha recolocado", () => {
    // No hay nada que recolocar: la lluvia cae sobre todo igual.
    const { efectos } = normalizarEfectos([{ id: "lluvia", ancla: "no-existe" }]);
    const r = anclarEfectos(efectos, anclas);
    expect(r.avisos[0]).toMatch(/cae sobre toda la escena/);
    expect(r.avisos[0]).not.toMatch(/centro/);
    expect(r.efectos[0].x2 - r.efectos[0].x).toBe(1);
  });
});

describe("dos efectos no se quedan uno encima del otro", () => {
  it("reparte los que caen en el mismo sitio", () => {
    // Dos lámparas con anclas que no existen acababan las dos en el mismo
    // punto: se veía una y parecía que la otra no se había puesto.
    const { efectos } = normalizarEfectos([
      { id: "lampara", forma: "punto", ancla: "no-existe-1" },
      { id: "lampara", forma: "punto", ancla: "no-existe-2" },
    ]);
    const r = anclarEfectos(efectos, []);
    const [a, b] = r.efectos;
    expect(a.x).not.toBe(b.x);
    expect(a.x2).toBe(a.x);
    expect(b.x2).toBe(b.x);
  });

  it("no toca lo que ya estaba en sitios distintos", () => {
    const { efectos } = normalizarEfectos([
      { id: "humo", forma: "punto", x: 0.2, y: 0.7 },
      { id: "humo", forma: "punto", x: 0.8, y: 0.7 },
    ]);
    const antes = efectos.map((e) => e.x);
    expect(separarApilados(efectos).map((e) => e.x)).toEqual(antes);
  });

  it("no reparte franjas: todas cubren el mismo cuadro a propósito", () => {
    const { efectos } = normalizarEfectos([{ id: "lluvia" }, { id: "nieve" }]);
    const r = separarApilados(efectos);
    expect(r.every((e) => e.x === 0 && e.x2 === 1)).toBe(true);
  });
});
