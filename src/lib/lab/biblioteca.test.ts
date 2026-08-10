import { describe, it, expect } from "vitest";
import { nombreCorto, resumenPrompt } from "./biblioteca";

// Los casos son prompts REALES de la biblioteca: son los que producían nombres
// de párrafo, todos empezando igual y cortados a media palabra.

describe("nombreCorto", () => {
  it("se queda con lo que distingue, no con las instrucciones de dibujo", () => {
    const n = nombreCorto(
      "Beautiful anime-aesthetic girl sprite sheet of the same full-body character, "
      + "standing and facing forward while gently breathing. Clean 2D cel shading; "
      + "consistent face, body, clothes, colors and scale.",
    );
    expect(n).toBe("Beautiful anime-aesthetic girl");
  });

  it("no parte palabras por la mitad", () => {
    const n = nombreCorto("Anime sequential sprite sheet of the same full-body character");
    expect(n.replace("…", "")).not.toMatch(/\s\w{1,2}$/);
    expect(n.length).toBeLessThanOrEqual(39);
  });

  it("deja en paz lo que ya era corto", () => {
    expect(nombreCorto("bird flying, wings flapping")).toBe("Bird flying");
    expect(nombreCorto("bat flying")).toBe("Bat flying");
  });

  it("cae al valor por defecto si no hay nada", () => {
    expect(nombreCorto("")).toBe("Sprite");
    expect(nombreCorto("   ")).toBe("Sprite");
    expect(nombreCorto("", "Sin nombre")).toBe("Sin nombre");
  });

  it("si la limpieza se lo come todo, prefiere el original a quedarse vacío", () => {
    // Todo el prompt es relleno: aun así tiene que salir algo.
    const n = nombreCorto("sprite sheet of the same full-body character");
    expect(n.length).toBeGreaterThan(2);
  });

  it("dos prompts que solo se diferencian al principio dan nombres distintos", () => {
    const a = nombreCorto("Beautiful anime girl sprite sheet of the same full-body character, walking");
    const b = nombreCorto("Beautiful anime boy sprite sheet of the same full-body character, walking");
    expect(a).not.toBe(b);
  });
});

describe("resumenPrompt", () => {
  it("acorta sin partir palabras y avisa con puntos suspensivos", () => {
    const r = resumenPrompt("a".repeat(10) + " " + "b".repeat(200), 40);
    expect(r.length).toBeLessThanOrEqual(41);
    expect(r.endsWith("…")).toBe(true);
  });

  it("colapsa los saltos de línea para que no rompan la tarjeta", () => {
    expect(resumenPrompt("uno\n\n  dos")).toBe("uno dos");
  });
});
