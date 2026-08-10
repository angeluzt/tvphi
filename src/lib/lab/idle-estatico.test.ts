import { describe, expect, it } from "vitest";
import { vistaAnim } from "./anim-paralaje";
import { capaDebeQuedarQuieta, revisar } from "./escena";

describe("idle estático y decorado quieto", () => {
  it("quieto deja la cámara en cero", () => {
    const v = vistaAnim("quieto", 5000, 0.08, { modo: "ciclo" });
    expect(v.ox).toBe(0);
    expect(v.oy).toBe(0);
  });

  it("islas/terreno no deben heredar mov de la IA", () => {
    expect(capaDebeQuedarQuieta({
      objects: [
        { id: "a", shape: "ellipse", semantic: "terrain", x: 0.2, y: 0.5, w: 0.3, h: 0.2 },
        { id: "b", shape: "rect", semantic: "vegetation", x: 0.4, y: 0.4, w: 0.1, h: 0.2 },
      ],
    }, false)).toBe(true);
  });

  it("un barco (prop) o agua pueden conservar movimiento", () => {
    expect(capaDebeQuedarQuieta({
      objects: [{ id: "c", shape: "ellipse", semantic: "prop", x: 0.5, y: 0.6, w: 0.1, h: 0.05 }],
    }, false)).toBe(false);
  });

  it("normalizar quita mov del fondo y del terreno", () => {
    const rev = revisar({
      scene: { id: "t", title: "t", width: 16, height: 9 },
      layers: [
        {
          id: "fondo", name: "01 Cielo", depth: 0.05,
          mov: { tipo: "flotar", amplitud: 0.1, segundos: 4 },
          objects: [{ id: "s", shape: "rect", semantic: "sky", x: 0, y: 0, w: 1, h: 1 }],
        },
        {
          id: "islas", name: "02 Islas", depth: 0.4,
          mov: { tipo: "vaiven", amplitud: 0.05, segundos: 3 },
          objects: [{ id: "i", shape: "ellipse", semantic: "terrain", x: 0.3, y: 0.5, w: 0.4, h: 0.2 }],
        },
        {
          id: "nube", name: "03 Nube", depth: 0.6,
          mov: { tipo: "deriva", x: 0.03, y: 0, bucle: true },
          objects: [{ id: "n", shape: "ellipse", semantic: "prop", x: 0.2, y: 0.2, w: 0.2, h: 0.1 }],
        },
      ],
    });
    expect("escena" in rev).toBe(true);
    if (!("escena" in rev)) return;
    expect(rev.escena.layers.find((c) => c.id === "fondo")?.mov).toBeUndefined();
    expect(rev.escena.layers.find((c) => c.id === "islas")?.mov).toBeUndefined();
    expect(rev.escena.layers.find((c) => c.id === "nube")?.mov?.tipo).toBe("deriva");
  });
});
