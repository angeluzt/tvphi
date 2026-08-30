import { describe, expect, it } from "vitest";
import { baseStory, RUTA_LAB, RUTA_STORY, storyPath } from "./ruta";

describe("baseStory", () => {
  it("en el editor de siempre se queda en /story", () => {
    expect(baseStory("/story")).toBe(RUTA_STORY);
    expect(baseStory("/story?id=abc")).toBe(RUTA_STORY);
  });

  it("en pruebas se queda en pruebas", () => {
    expect(baseStory("/lab/historias")).toBe(RUTA_LAB);
    expect(baseStory("/lab/historias?id=abc")).toBe(RUTA_LAB);
  });

  it("el laboratorio a secas NO es el editor de pruebas", () => {
    expect(baseStory("/lab")).toBe(RUTA_STORY);
    expect(baseStory("/lab?tab=sprites")).toBe(RUTA_STORY);
  });

  it("cualquier otro sitio cae al editor de siempre", () => {
    expect(baseStory("/")).toBe(RUTA_STORY);
    expect(baseStory("/dashboard")).toBe(RUTA_STORY);
  });
});

describe("storyPath", () => {
  it("abrir un capítulo desde pruebas NO te saca de pruebas", () => {
    // Este es el fallo: devolvía "/story?id=cap-1", así que al recargar
    // aterrizabas en el editor normal y la fase de medios se saltaba.
    expect(storyPath({ id: "cap-1" }, "/lab/historias")).toBe("/lab/historias?id=cap-1");
  });

  it("y desde el editor de siempre sigue yendo a /story", () => {
    expect(storyPath({ id: "cap-1" }, "/story")).toBe("/story?id=cap-1");
  });

  it("conserva la sección al entrar en una serie", () => {
    expect(storyPath({ serie: "s-1" }, "/lab/historias")).toBe("/lab/historias?serie=s-1");
    expect(storyPath({ serie: "s-1" }, "/story")).toBe("/story?serie=s-1");
  });

  it("sin nada, la dirección de la sección a secas", () => {
    expect(storyPath({}, "/lab/historias")).toBe("/lab/historias");
    expect(storyPath({}, "/story")).toBe("/story");
  });

  it("el capítulo manda sobre la serie", () => {
    expect(storyPath({ id: "cap-1", serie: "s-1" }, "/lab/historias"))
      .toBe("/lab/historias?id=cap-1");
  });

  it("ya estando dentro de un capítulo, sigue sin salirse de la sección", () => {
    expect(storyPath({ id: "cap-2" }, "/lab/historias?id=cap-1"))
      .toBe("/lab/historias?id=cap-2");
  });

  it("un id con caracteres raros se escapa", () => {
    expect(storyPath({ id: "a b&c" }, "/story")).toBe("/story?id=a+b%26c");
  });
});
