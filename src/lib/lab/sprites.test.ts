import { describe, expect, it } from "vitest";
import {
  celdasSpritePorDefecto, desplazamientoParaCentrar, limitesCelda, normalizarCeldasSprite,
  limpiarResiduosLinealesBorde, tamanoComunCeldasSprite,
} from "./sprites";

describe("limitesCelda", () => {
  it("reparte todos los pixeles sin huecos ni solapamientos", () => {
    const celdas = Array.from({ length: 5 }, (_, i) => limitesCelda(1536, 5, i));

    expect(celdas.map((c) => c.tam)).toEqual([307, 307, 308, 307, 307]);
    expect(celdas[0].inicio).toBe(0);
    for (let i = 1; i < celdas.length; i++) {
      expect(celdas[i].inicio).toBe(celdas[i - 1].inicio + celdas[i - 1].tam);
    }
    expect(celdas.at(-1)!.inicio + celdas.at(-1)!.tam).toBe(1536);
  });
});

describe("limpieza de residuos lineales", () => {
  const datos = (w: number, h: number) => new Uint8ClampedArray(w * h * 4);
  const pintar = (d: Uint8ClampedArray, w: number, x: number, y: number) => {
    d[(y * w + x) * 4 + 3] = 255;
  };

  it("elimina una raya larga pegada al borde", () => {
    const w = 40, h = 30, d = datos(w, h);
    for (let y = 0; y < h; y++) pintar(d, w, 1, y);
    for (let y = 10; y < 20; y++) for (let x = 14; x < 25; x++) pintar(d, w, x, y);

    expect(limpiarResiduosLinealesBorde(d, w, h)).toBe(30);
    expect(d[(15 * w + 18) * 4 + 3]).toBe(255);
  });

  it("conserva detalles delgados que no son separadores", () => {
    const w = 40, h = 30, d = datos(w, h);
    for (let y = 3; y < 12; y++) pintar(d, w, 1, y);

    expect(limpiarResiduosLinealesBorde(d, w, h)).toBe(0);
    expect(d[(7 * w + 1) * 4 + 3]).toBe(255);
  });
});

describe("desplazamientoParaCentrar", () => {
  it("centra la caja visible sin cambiar su tamano", () => {
    expect(desplazamientoParaCentrar(
      { x0: 20, y0: 10, x1: 59, y1: 29 },
      100,
      80,
    )).toEqual({ x: 10, y: 20 });
  });
});

describe("celdas de la hoja original", () => {
  it("guarda la ubicación exacta de una tira aunque no divida parejo", () => {
    expect(celdasSpritePorDefecto(1536, 1024, 5, "tira")).toEqual([
      { x: 0, y: 0, ancho: 307, alto: 1024 },
      { x: 307, y: 0, ancho: 307, alto: 1024 },
      { x: 614, y: 0, ancho: 308, alto: 1024 },
      { x: 922, y: 0, ancho: 307, alto: 1024 },
      { x: 1229, y: 0, ancho: 307, alto: 1024 },
    ]);
  });

  it("acota una celda movida para que nunca lea fuera de la hoja", () => {
    expect(normalizarCeldasSprite([
      { x: -20, y: 900, ancho: 2000, alto: 300 },
    ], 1536, 1024)).toEqual([
      { x: 0, y: 724, ancho: 1536, alto: 300 },
    ]);
  });

  it("cambia el tamaño de todos los cuadros juntos y respeta los bordes", () => {
    expect(tamanoComunCeldasSprite([
      { x: 10, y: 10, ancho: 100, alto: 80 },
      { x: 250, y: 150, ancho: 120, alto: 90 },
    ], 300, 200, 140, 100)).toEqual([
      { x: 10, y: 10, ancho: 140, alto: 100 },
      { x: 160, y: 100, ancho: 140, alto: 100 },
    ]);
  });
});
