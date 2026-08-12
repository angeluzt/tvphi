import { describe, it, expect } from "vitest";
import { normalizarEfectos, anclarEfectos, anclasDeEscena, type Ancla } from "./efectos-escena";

// LO QUE PASABA DE VERDAD, y por lo que existe esto: los efectos salían todos
// en el centro del cuadro —una columna de luz atravesando la escena— porque
// nadie le decía al modelo dónde ponerlos, y sin coordenadas se cae a 0,5/0,5.
//
// La solución no es pedirle coordenadas: el modelo acaba de colocar el agua y
// el arco, y repetir sus números a mano es lo que hace mal. Nombrar la forma sí
// lo hace bien, y los números salen de la caja que esa forma ya tiene.

const anclas: Ancla[] = [
  // Una lámina de agua ancha y baja.
  { id: "agua", caja: { x: 0.1, y: 0.7, w: 0.8, h: 0.15 }, depth: 0.5 },
  // Un arco alto y estrecho.
  { id: "arco", caja: { x: 0.4, y: 0.2, w: 0.2, h: 0.5 }, depth: 0.62 },
];

const uno = (crudo: object) => normalizarEfectos([crudo]).efectos[0];

describe("sin ancla, todo cae en el centro (el bug)", () => {
  it("un efecto sin coordenadas aterriza en 0,5 / 0,5", () => {
    const e = uno({ id: "niebla" });
    expect([e.x, e.y]).toEqual([0.5, 0.5]);
  });

  it("y anclarlo no lo toca si no nombró ninguna forma", () => {
    const { efectos } = anclarEfectos([uno({ id: "niebla" })], anclas);
    expect([efectos[0].x, efectos[0].y]).toEqual([0.5, 0.5]);
  });
});

describe("con ancla", () => {
  it("un punto va al centro de la forma", () => {
    const { efectos } = anclarEfectos([uno({ id: "luz", ancla: "arco" })], anclas);
    expect(efectos[0].x).toBeCloseTo(0.5, 5);
    expect(efectos[0].y).toBeCloseTo(0.45, 5);
  });

  it("una línea recorre el borde de arriba, de lado a lado", () => {
    // Es lo que hace que la niebla corra a lo largo del agua en vez de salir
    // de un punto.
    const { efectos } = anclarEfectos([uno({ id: "niebla", forma: "linea", ancla: "agua" })], anclas);
    const e = efectos[0];
    expect([e.x, e.y]).toEqual([0.1, 0.7]);
    expect([e.x2, e.y2]).toEqual([0.9, 0.7]);
  });

  it("el fuego y el humo salen del SUELO de la forma, no de su centro", () => {
    // Una hoguera ardiendo en mitad del aire sobre un tronco es el error más
    // fácil de cometer y el más feo.
    const { efectos } = anclarEfectos([uno({ id: "fuego", ancla: "agua" })], anclas);
    expect(efectos[0].y).toBeGreaterThan(0.8);
    const luz = anclarEfectos([uno({ id: "luz", ancla: "agua" })], anclas).efectos[0];
    expect(luz.y).toBeCloseTo(0.775, 3);
  });

  it("hereda la profundidad de la capa donde vive esa forma", () => {
    // Sin esto la cámara lo mueve a otro ritmo que el objeto sobre el que va,
    // y el efecto se despega al panear.
    const { efectos } = anclarEfectos([uno({ id: "luz", ancla: "arco" })], anclas);
    expect(efectos[0].depth).toBe(0.62);
  });

  it("«arriba» no se recoloca: cubre el cuadro entero por definición", () => {
    const e = uno({ id: "lluvia", ancla: "agua" });
    const { efectos } = anclarEfectos([e], anclas);
    expect([efectos[0].x, efectos[0].y]).toEqual([e.x, e.y]);
    expect(efectos[0].depth).toBe(0.5);
  });

  it("un ancla inventada NO tira el efecto, avisa", () => {
    // Perderlo entero por un id mal escrito sería peor que dejarlo mal puesto,
    // que al menos se ve y se arrastra.
    const { efectos, avisos } = anclarEfectos([uno({ id: "luz", ancla: "no-existe" })], anclas);
    expect(efectos).toHaveLength(1);
    expect(avisos[0]).toContain("no-existe");
  });

  it("varios efectos sobre la misma forma caen en el mismo sitio", () => {
    const { efectos } = anclarEfectos(
      [uno({ id: "luz", ancla: "arco" }), uno({ id: "polvo", forma: "punto", ancla: "arco" })],
      anclas,
    );
    expect(efectos[0].x).toBeCloseTo(efectos[1].x, 5);
  });
});

describe("sacar las anclas de la escena", () => {
  const escena = {
    layers: [
      { depth: 0.05, objects: [{ id: "cielo", shape: "rect", x: 0, y: 0, w: 1, h: 1 }] },
      { depth: 0.6, objects: [
        { id: "charco", shape: "ellipse", cx: 0.5, cy: 0.8, rx: 0.3, ry: 0.05 },
        { shape: "rect", x: 0, y: 0, w: 1, h: 1 },   // sin id: no sirve de ancla
      ] },
    ],
  };

  it("traduce cualquier forma a una caja", () => {
    const a = anclasDeEscena(escena);
    expect(a.map((x) => x.id)).toEqual(["cielo", "charco"]);
    const charco = a.find((x) => x.id === "charco")!;
    expect(charco.caja.x).toBeCloseTo(0.2, 5);
    expect(charco.caja.w).toBeCloseTo(0.6, 5);
    expect(charco.depth).toBe(0.6);
  });

  it("una escena vacía no revienta", () => {
    expect(anclasDeEscena({})).toEqual([]);
    expect(anclasDeEscena({ layers: [] })).toEqual([]);
  });

  it("de principio a fin: la niebla acaba sobre el charco, no en el centro", () => {
    const { efectos } = normalizarEfectos([{ id: "niebla", forma: "linea", ancla: "charco" }]);
    expect([efectos[0].x, efectos[0].y]).toEqual([0.5, 0.5]);   // antes
    const puesto = anclarEfectos(efectos, anclasDeEscena(escena)).efectos[0];
    expect(puesto.x).toBeCloseTo(0.2, 5);                        // después
    expect(puesto.y).toBeCloseTo(0.75, 5);
    expect(puesto.x2).toBeCloseTo(0.8, 5);
  });
});
