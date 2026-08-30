import { describe, expect, it } from "vitest";
import { elegirLaminasVivas, llano } from "./laminas-vivas";

const CAPAS = [
  { id: "c1", nombre: "01 Cielo nocturno", semanticas: ["sky"] },
  { id: "c2", nombre: "02 Montañas lejanas", semanticas: ["terrain"] },
  { id: "c3", nombre: "03 Río y orilla", semanticas: ["water"] },
  { id: "c4", nombre: "04 Muro con antorchas", semanticas: ["wall", "light_anchor"] },
  { id: "c5", nombre: "05 Suelo empedrado", semanticas: ["floor"] },
];

describe("llano", () => {
  it("quita tildes, mayúsculas y el número de orden", () => {
    expect(llano("03 Río y Orilla")).toBe("rio y orilla");
    expect(llano("  01 · Cielo ")).toBe("cielo");
  });
});

describe("elegirLaminasVivas", () => {
  it("hace caso a las pistas del plan por encima de todo", () => {
    expect(elegirLaminasVivas(CAPAS, ["antorchas"], 1)).toEqual(["c4"]);
  });

  it("casa una pista de varias palabras con el nombre de la lámina", () => {
    expect(elegirLaminasVivas(CAPAS, ["el río de la aldea"], 1)).toEqual(["c3"]);
  });

  it("sin pistas cae a lo que se mueve solo", () => {
    const vivas = elegirLaminasVivas(CAPAS, [], 2);
    expect(vivas).toEqual(["c1", "c3"]);
  });

  it("nunca anima el suelo", () => {
    expect(elegirLaminasVivas(CAPAS, [], 5)).not.toContain("c5");
  });

  it("no anima el terreno aunque quede sitio", () => {
    expect(elegirLaminasVivas(CAPAS, [], 5)).not.toContain("c2");
  });

  it("respeta el tope", () => {
    expect(elegirLaminasVivas(CAPAS, ["cielo", "río", "antorchas"], 2)).toHaveLength(2);
  });

  it("con tope cero no anima nada", () => {
    expect(elegirLaminasVivas(CAPAS, ["cielo"], 0)).toEqual([]);
  });

  it("no repite una lámina que ya entró por otra pista", () => {
    expect(elegirLaminasVivas(CAPAS, ["río", "río y orilla"], 2)).toEqual(["c3", "c1"]);
  });

  it("un muro con antorchas sí puede arder: la semántica de luz lo salva", () => {
    expect(elegirLaminasVivas(CAPAS, [], 3)).toContain("c4");
  });

  it("aguanta láminas sin semánticas y decide por el nombre", () => {
    const capas = [
      { id: "a", nombre: "Pared de ladrillo" },
      { id: "b", nombre: "Hoguera del campamento" },
    ];
    expect(elegirLaminasVivas(capas, [], 2)).toEqual(["b"]);
  });

  it("una pista que no encaja con nada no rompe nada", () => {
    expect(elegirLaminasVivas(CAPAS, ["dragón de tres cabezas"], 1)).toEqual(["c1"]);
  });
});
