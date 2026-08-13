import { describe, expect, it } from "vitest";
import { listaDeExclusion, nombreLimpio } from "./prompt-capa";

// El caso real: la capa de rascacielos volvió con luna, nubes, agua y reflejos,
// porque a cada capa se le manda la descripción entera de la escena.
const ESCENA = [
  "01 Cielo nocturno",
  "02 Rascacielos borrosos",
  "03 Suelo mojado",
  "04 Puestos y faroles",
  "05 Rama de cerezo",
];

describe("limpiar el nombre de una capa", () => {
  it("quita el número de orden", () => {
    expect(nombreLimpio("02 Rascacielos borrosos")).toBe("Rascacielos borrosos");
    expect(nombreLimpio("3 - Suelo mojado")).toBe("Suelo mojado");
    expect(nombreLimpio("Gato negro")).toBe("Gato negro");
  });

  it("quita el sufijo de las piezas separadas", () => {
    expect(nombreLimpio("04 Faroles · pieza 2")).toBe("Faroles");
    expect(nombreLimpio("03 Suelo · zona")).toBe("Suelo");
  });
});

describe("qué NO debe dibujar cada capa", () => {
  it("nombra las demás capas de la escena", () => {
    const fuera = listaDeExclusion({ capa: "02 Rascacielos borrosos", otras: ESCENA });
    expect(fuera).toContain("Cielo nocturno");
    expect(fuera).toContain("Suelo mojado");
    expect(fuera).toContain("Rama de cerezo");
  });

  it("no se prohíbe a sí misma: si no, vuelve vacía", () => {
    const fuera = listaDeExclusion({ capa: "02 Rascacielos borrosos", otras: ESCENA });
    expect(fuera.toLowerCase()).not.toContain("rascacielos");
  });

  it("añade lo que siempre se cuela: luna, nubes, agua, reflejos", () => {
    const fuera = listaDeExclusion({ capa: "02 Rascacielos borrosos", otras: ESCENA });
    for (const t of ["moon", "clouds", "water", "reflections", "sky"]) {
      expect(fuera).toContain(t);
    }
  });

  it("respeta lo que ya venía del mapa y lo pone primero", () => {
    const fuera = listaDeExclusion({
      capa: "02 Rascacielos", otras: ESCENA, extra: "cables, antenas",
    });
    expect(fuera.indexOf("cables")).toBe(0);
    expect(fuera).toContain("antenas");
  });

  it("no se repite aunque el mapa diga lo mismo que la lista fija", () => {
    const fuera = listaDeExclusion({ capa: "02 Rascacielos", otras: [], extra: "moon, MOON" });
    expect(fuera.match(/moon/gi)?.length).toBe(1);
  });

  it("el fondo es la excepción: él sí pinta cielo y luna", () => {
    // Prohibírselo lo dejaría vacío, que es lo contrario de un fondo.
    expect(listaDeExclusion({ capa: "01 Cielo nocturno", otras: ESCENA, esFondo: true })).toBe("");
    expect(listaDeExclusion({
      capa: "01 Cielo", otras: ESCENA, esFondo: true, extra: "personajes",
    })).toBe("personajes");
  });

  it("no prohíbe una capa que contiene a esta por el nombre", () => {
    // «Faroles y rama frontal» no debe excluirse en la capa «Faroles», o se
    // quedaría sin faroles.
    const fuera = listaDeExclusion({
      capa: "04 Faroles", otras: ["04 Faroles y rama frontal", "01 Cielo nocturno"],
    });
    expect(fuera.toLowerCase()).not.toContain("faroles");
    expect(fuera).toContain("Cielo nocturno");
  });

  it("no se pasa del tope de longitud", () => {
    const muchas = Array.from({ length: 200 }, (_, i) => `Capa larguísima número ${i} de relleno`);
    const fuera = listaDeExclusion({ capa: "X", otras: muchas, tope: 300 });
    expect(fuera.length).toBeLessThanOrEqual(300);
    expect(fuera.length).toBeGreaterThan(0);
  });

  it("sin otras capas sigue diciendo lo básico", () => {
    expect(listaDeExclusion({ capa: "Gato", otras: [] })).toContain("moon");
  });
});
