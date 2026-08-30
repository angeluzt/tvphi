import { describe, expect, it } from "vitest";
import { elegirLaminasVivas, laminasPedidasNoRepintables, llano } from "./laminas-vivas";

// Todas opacas: este juego comprueba el CRITERIO de elección, no el recorte.
const CAPAS = [
  { id: "c1", nombre: "01 Cielo nocturno", semanticas: ["sky"], opaca: true },
  { id: "c2", nombre: "02 Montañas lejanas", semanticas: ["terrain"], opaca: true },
  { id: "c3", nombre: "03 Río y orilla", semanticas: ["water"], opaca: true },
  { id: "c4", nombre: "04 Muro con antorchas", semanticas: ["wall", "light_anchor"], opaca: true },
  { id: "c5", nombre: "05 Suelo empedrado", semanticas: ["floor"], opaca: true },
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
    // Dos pistas al mismo sitio son UNA lámina, no dos. Y no se rellena el
    // hueco que sobra: el plan pidió el río, no el río y algo más.
    expect(elegirLaminasVivas(CAPAS, ["río", "río y orilla"], 2)).toEqual(["c3"]);
  });

  it("un muro con antorchas sí puede arder: la semántica de luz lo salva", () => {
    expect(elegirLaminasVivas(CAPAS, [], 3)).toContain("c4");
  });

  it("aguanta láminas sin semánticas y decide por el nombre", () => {
    const capas = [
      { id: "a", nombre: "Pared de ladrillo", opaca: true },
      { id: "b", nombre: "Hoguera del campamento", opaca: true },
    ];
    expect(elegirLaminasVivas(capas, [], 2)).toEqual(["b"]);
  });

  it("si lo pedido no existe, no se anima un sustituto", () => {
    // Animar el cielo «ya que estamos» son dos imágenes que nadie encargó.
    expect(elegirLaminasVivas(CAPAS, ["dragón de tres cabezas"], 1)).toEqual([]);
  });
});

// El caso real de «El paso de la ciudadela»: el plan pedía animar los braseros,
// la lámina existía y encajaba por nombre... pero era un recorte al 82%.
// Repintarla habría devuelto un rectángulo opaco tapando media escena.
const CIUDADELA = [
  { id: "c1", nombre: "01 Cielo y montañas", opaca: true },
  { id: "c2", nombre: "02 Valle nevado", opaca: false },
  { id: "c3", nombre: "03 Ciudadela y braseros", opaca: false },
  { id: "c4", nombre: "04 Rocas y fuego extinto", opaca: false },
];

describe("un recorte no se repinta jamás", () => {
  it("ni aunque el plan lo pida por su nombre", () => {
    expect(elegirLaminasVivas(CIUDADELA, ["braseros"], 1)).toEqual([]);
  });

  it("y tampoco se cuela por la puerta de atrás cuando queda sitio", () => {
    // «Valle nevado» tiene palabra viva (nieve) pero es recorte: fuera.
    expect(elegirLaminasVivas(CIUDADELA, [], 2)).toEqual(["c1"]);
  });

  it("sin ninguna lámina opaca no se anima nada", () => {
    const soloRecortes = CIUDADELA.filter((c) => !c.opaca);
    expect(elegirLaminasVivas(soloRecortes, ["braseros"], 2)).toEqual([]);
  });

  it("sin saber si es opaca, se supone que no", () => {
    expect(elegirLaminasVivas([{ id: "x", nombre: "Cielo" }], ["cielo"], 1)).toEqual([]);
  });

  it("el fondo opaco sí se anima, que es para lo que sirve la técnica", () => {
    expect(elegirLaminasVivas(CIUDADELA, ["cielo"], 1)).toEqual(["c1"]);
  });
});

describe("laminasPedidasNoRepintables", () => {
  it("nombra la lámina que se pidió y no se pudo", () => {
    expect(laminasPedidasNoRepintables(CIUDADELA, ["braseros"]))
      .toEqual(["03 Ciudadela y braseros"]);
  });

  it("calla cuando lo pedido sí es repintable", () => {
    expect(laminasPedidasNoRepintables(CIUDADELA, ["cielo"])).toEqual([]);
  });

  it("no repite si dos pistas caen en la misma lámina", () => {
    expect(laminasPedidasNoRepintables(CIUDADELA, ["braseros", "ciudadela"]))
      .toEqual(["03 Ciudadela y braseros"]);
  });
});

