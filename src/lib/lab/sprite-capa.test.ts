import { describe, expect, it } from "vitest";
import {
  cajaSprite,
  duracionRutaSprite,
  estadoSpriteEn,
  normalizarSprite,
  posicionSprite,
  spriteSigueCamara,
  type SpriteEnCapa,
} from "./sprite-capa";

const base: SpriteEnCapa = {
  fotogramas: 6,
  fps: 10,
  x: -0.2,
  y: 0.25,
  alto: 0.2,
  espacio: "pantalla",
};

describe("espacio del sprite", () => {
  it("conserva el comportamiento de cámara de proyectos antiguos", () => {
    const antiguo = normalizarSprite({
      fotogramas: 6, fps: 10, x: 0.5, y: 0.5, alto: 0.2,
    });

    expect(antiguo?.espacio).toBe("capa");
    expect(spriteSigueCamara(antiguo!)).toBe(true);
  });

  it("respeta el espacio de lienzo independiente", () => {
    const actual = normalizarSprite({ ...base });

    expect(actual?.espacio).toBe("pantalla");
    expect(spriteSigueCamara(actual!)).toBe(false);
  });
});

describe("trayectoria A a B", () => {
  const sprite: SpriteEnCapa = {
    ...base,
    trayectoria: { x: 1.2, y: 0.75, segundos: 4 },
  };

  it("interpola cualquier dirección y se queda en B al terminar", () => {
    expect(posicionSprite(sprite, 0)).toEqual({ x: -0.2, y: 0.25 });
    const mitad = posicionSprite(sprite, 2);
    expect(mitad.x).toBeCloseTo(0.5);
    expect(mitad.y).toBeCloseTo(0.5);
    expect(posicionSprite(sprite, 8)).toEqual({ x: 1.2, y: 0.75 });
  });

  it("reinicia en A cuando el recorrido está en bucle", () => {
    const enBucle = { ...sprite, trayectoria: { ...sprite.trayectoria!, bucle: true } };

    expect(posicionSprite(enBucle, 4)).toEqual({ x: -0.2, y: 0.25 });
    const cuarto = posicionSprite(enBucle, 5);
    expect(cuarto.x).toBeCloseTo(0.15);
    expect(cuarto.y).toBeCloseTo(0.375);
  });

  it("usa la posición interpolada al calcular la caja de dibujo", () => {
    const caja = cajaSprite(sprite, 100, 100, { x0: 0, y0: 0, w: 1000, h: 500 }, 2);

    expect(caja.dx).toBeCloseTo(450);
    expect(caja.dy).toBeCloseTo(200);
    expect(caja.dw).toBe(100);
    expect(caja.dh).toBe(100);
  });
});

describe("ruta de varios pasos", () => {
  const sprite: SpriteEnCapa = {
    ...base,
    ruta: {
      pasos: [
        { tipo: "mover", x: 0.8, y: 0.25, segundos: 2 },
        { tipo: "pausa", segundos: 1, espejo: true },
        { tipo: "mover", x: -0.2, y: 0.75, segundos: 2, espejo: true },
      ],
    },
  };

  it("mueve, espera, voltea y continúa desde el punto anterior", () => {
    expect(estadoSpriteEn(sprite, 1).x).toBeCloseTo(0.3);
    expect(estadoSpriteEn(sprite, 2.5)).toMatchObject({ x: 0.8, y: 0.25, espejo: true, paso: 1 });
    const regreso = estadoSpriteEn(sprite, 4);
    expect(regreso.x).toBeCloseTo(0.3);
    expect(regreso).toMatchObject({ y: 0.5, espejo: true, paso: 2 });
    expect(posicionSprite(sprite, 9)).toEqual({ x: -0.2, y: 0.75 });
    expect(duracionRutaSprite(sprite)).toBe(5);
  });

  it("repite la ruta completa cuando está en bucle", () => {
    const enBucle = { ...sprite, ruta: { ...sprite.ruta!, bucle: true } };
    expect(estadoSpriteEn(enBucle, 5)).toMatchObject({ x: -0.2, y: 0.25, paso: 0 });
    expect(estadoSpriteEn(enBucle, 6).x).toBeCloseTo(0.3);
  });

  it("normaliza el JSON sin romper trayectoria ni proyectos antiguos", () => {
    const actual = normalizarSprite({
      ...base,
      sincronizar: false,
      ruta: {
        bucle: true,
        pasos: [
          { tipo: "mover", x: 4, y: -4, segundos: 0 },
          { tipo: "pausa", segundos: 500, espejo: true },
          { tipo: "inventado", segundos: 2 },
        ],
      },
    });

    expect(actual?.sincronizar).toBe(false);
    expect(actual?.ruta).toEqual({
      bucle: true,
      pasos: [
        { tipo: "mover", x: 1.5, y: -0.5, segundos: 0.1 },
        { tipo: "pausa", segundos: 120, espejo: true },
      ],
    });
  });
});
