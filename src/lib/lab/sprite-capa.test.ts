import { describe, expect, it } from "vitest";
import {
  cajaSprite,
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
