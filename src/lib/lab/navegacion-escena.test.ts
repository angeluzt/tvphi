import { describe, expect, it } from "vitest";
import type { Escena, SuperficieNavegable } from "./escena";
import { normalizar } from "./escena";
import { ajustarSpriteALaEscena, elegirSuperficie, superficiesDeEscena, yEnSuperficie } from "./navegacion-escena";

const rampa: SuperficieNavegable = {
  id: "rampa", tipo: "suelo", puntos: [[0, 0.8], [0.5, 0.6], [1, 0.7]],
  acciones: ["caminar", "correr"],
};

describe("navegación semántica de sprites", () => {
  it("interpola el apoyo sobre una polilínea", () => {
    expect(yEnSuperficie(rampa, 0.25)).toBeCloseTo(0.7);
    expect(yEnSuperficie(rampa, 0.75)).toBeCloseTo(0.65);
  });

  it("ajusta los pies y orienta cada tramo según el dibujo original", () => {
    const spr = ajustarSpriteALaEscena({
      fotogramas: 6, fps: 10, vista: "lateral", direccionBase: "izquierda",
      accion: "caminar", anclaje: "pies", x: 0.1, y: 0.2, alto: 0.18,
      espacio: "pantalla", ruta: { pasos: [
        { tipo: "mover", x: 0.9, y: 0.1, segundos: 3 },
        { tipo: "pausa", segundos: 1 },
        { tipo: "mover", x: 0.2, y: 0.1, segundos: 3 },
      ] },
    }, rampa);
    expect(spr.y).toBeCloseTo(0.76);
    expect(spr.ruta?.pasos[0]).toMatchObject({ espejo: true });
    expect(spr.ruta?.pasos[0].y).toBeCloseTo(0.68);
    expect(spr.ruta?.pasos[2]).toMatchObject({ espejo: false });
    expect(spr.ruta?.pasos[2].y).toBeCloseTo(0.72);
  });

  it("deriva un suelo de mapas antiguos sin romperlos", () => {
    const escena: Escena = {
      scene: { id: "vieja", title: "Vieja", width: 100, height: 100 },
      layers: [{ id: "piso", name: "Piso", depth: 0.7, objects: [
        { id: "suelo", shape: "rect", semantic: "floor", x: 0, y: 0.82, w: 1, h: 0.18 },
      ] }],
    };
    expect(superficiesDeEscena(escena)[0]).toMatchObject({
      id: "auto-piso-suelo", tipo: "suelo", puntos: [[0, 0.82], [1, 0.82]],
    });
  });

  it("conserva y valida las superficies explícitas al normalizar la escena", () => {
    const escena: Escena = {
      scene: { id: "nueva", title: "Nueva", width: 100, height: 100 },
      layers: [{ id: "fondo", name: "Fondo", depth: 0.1, objects: [] }],
      navegacion: { superficies: [{ ...rampa, puntos: [[-9, 0.8], [9, 0.7]] }] },
    };
    expect(normalizar(escena).navegacion?.superficies[0].puntos)
      .toEqual([[-0.5, 0.8], [1.5, 0.7]]);
  });

  it("no acepta una superficie incompatible aunque la IA escriba su id", () => {
    const agua: SuperficieNavegable = { id: "canal", tipo: "agua", puntos: [[0, 0.7], [1, 0.7]], acciones: ["nadar"] };
    expect(elegirSuperficie([agua, rampa], "canal", "caminar", 0.4, 0.7)?.id).toBe("rampa");
  });
});
