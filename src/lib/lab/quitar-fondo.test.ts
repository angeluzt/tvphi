import { describe, expect, it } from "vitest";
import {
  colorDominanteEnArea, diagnosticarCroma, quitarColorDePixeles,
} from "./quitar-fondo";

const MAGENTA: [number, number, number] = [255, 0, 255];

function imagen(w: number, h: number, color: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = color(x, y);
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3];
    }
  }
  return d;
}

describe("extracción de croma conectado", () => {
  it("quita píxel por píxel un fondo magenta sombreado sin borrar el objeto", () => {
    const w = 13, h = 9;
    const d = imagen(w, h, (x, y) => {
      if (x >= 4 && x <= 8 && y >= 3 && y <= 6) return [18, 35, 48, 255];
      // El fondo no es un RGB plano: simula gradiente, compresión y sombreado.
      return [Math.min(255, 218 + x * 3), 22 + y * 4, Math.min(255, 224 + x * 2), 255];
    });

    const antes = diagnosticarCroma(d, w, h, MAGENTA);
    const resultado = quitarColorDePixeles(d, w, h, MAGENTA);

    expect(antes.conectado).toBeGreaterThan(0.7);
    expect(resultado.residuo).toBeLessThan(0.01);
    expect(d[(4 * w + 6) * 4 + 3]).toBe(255);
    expect(d[3]).toBe(0);
    expect(d[((h - 1) * w + w - 1) * 4 + 3]).toBe(0);
  });

  it("limpia una isla de magenta puro encerrada dentro de una figura", () => {
    const w = 9, h = 9;
    const d = imagen(w, h, (x, y) => {
      if (x === 4 && y === 4) return [255, 0, 255, 255];
      if (x >= 2 && x <= 6 && y >= 2 && y <= 6) return [20, 30, 40, 255];
      return [245, 12, 248, 255];
    });

    quitarColorDePixeles(d, w, h, MAGENTA);

    expect(d[(4 * w + 4) * 4 + 3]).toBe(0);
    expect(d[(3 * w + 4) * 4 + 3]).toBe(255);
  });

  it("conserva un detalle violeta aislado que no es el color técnico", () => {
    const w = 11, h = 9;
    const d = imagen(w, h, (x, y) => {
      if (x >= 3 && x <= 7 && y >= 2 && y <= 6) {
        if (x === 5 && y === 4) return [118, 18, 150, 255];
        return [22, 32, 42, 255];
      }
      return [250, 8, 252, 255];
    });

    quitarColorDePixeles(d, w, h, MAGENTA);

    expect(d[(4 * w + 5) * 4 + 3]).toBe(255);
    expect(Array.from(d.slice((4 * w + 5) * 4, (4 * w + 5) * 4 + 3)))
      .toEqual([118, 18, 150]);
  });

  it("detecta croma aunque el PNG ya tenga algunos píxeles transparentes", () => {
    const w = 10, h = 6;
    const d = imagen(w, h, (x, y) => (
      x === 0 && y < 2 ? [0, 0, 0, 0] : [238, 35, 242, 255]
    ));

    const r = diagnosticarCroma(d, w, h, MAGENTA);

    expect(r.conectado).toBeGreaterThan(0.9);
  });

  it("elige el rosa dominante del área marcada e ignora transparencia y objetos", () => {
    const w = 8, h = 6;
    const d = imagen(w, h, (x, y) => {
      if (x === 0) return [0, 0, 0, 0];
      if (x === 6 && y >= 2) return [18, 30, 44, 255];
      return y % 2 ? [238, 31, 241, 255] : [242, 28, 244, 255];
    });

    const color = colorDominanteEnArea(d, w, h, { x: 0, y: 0 }, { x: 7, y: 5 });

    expect(color?.[0]).toBeGreaterThan(235);
    expect(color?.[1]).toBeLessThan(36);
    expect(color?.[2]).toBeGreaterThan(238);
  });
});
