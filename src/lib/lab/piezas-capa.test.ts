import { describe, expect, it } from "vitest";
import {
  etiquetarPiezas, nombreDePieza, pivoteDePieza, repartirPorZona, zonaNormalizada,
} from "./piezas-capa";

/** Pinta un rectángulo opaco sobre un lienzo de alfa. */
function pintar(alfa: Uint8Array, ancho: number, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) alfa[y * ancho + x] = 255;
  }
}

describe("separar una capa por sus trozos sueltos", () => {
  it("da una pieza por cada mancha que no se toca con las demás", () => {
    const ancho = 60, alto = 40;
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 2, 2, 10, 10);   // izquierda
    pintar(alfa, ancho, 40, 20, 12, 12); // derecha, bien lejos

    const m = etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0 });
    expect(m.piezas).toHaveLength(2);
    expect(m.piezas.every((p) => !p.resto)).toBe(true);
    // Cada píxel pintado acaba en una pieza y solo en una.
    expect(m.piezas.reduce((s, p) => s + p.pixeles, 0)).toBe(100 + 144);
  });

  it("respeta la caja de cada pieza para poder girarla por su centro", () => {
    const ancho = 60, alto = 40;
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 40, 20, 12, 12);
    const m = etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0 });
    const p = m.piezas[0];
    expect([p.x0, p.y0, p.x1, p.y1]).toEqual([40, 20, 51, 31]);
    const piv = pivoteDePieza(p, ancho, alto);
    expect(piv.pivoteX).toBeCloseTo(46 / 60, 5);
    expect(piv.pivoteY).toBeCloseTo(26 / 40, 5);
  });

  it("junta lo que casi se toca en vez de sacar una capa por hoja", () => {
    const ancho = 40, alto = 20;
    const alfa = new Uint8Array(ancho * alto);
    // Tres manchitas separadas por dos píxeles: una copa de árbol, no tres cosas.
    pintar(alfa, ancho, 2, 6, 6, 6);
    pintar(alfa, ancho, 10, 6, 6, 6);
    pintar(alfa, ancho, 18, 6, 6, 6);

    expect(etiquetarPiezas(alfa, ancho, alto, { union: 0, minimo: 0 }).piezas).toHaveLength(3);
    expect(etiquetarPiezas(alfa, ancho, alto, { union: 2, minimo: 0 }).piezas).toHaveLength(1);
  });

  it("no engorda las cuentas al engordar la silueta", () => {
    const ancho = 30, alto = 30;
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 10, 10, 6, 6);
    const m = etiquetarPiezas(alfa, ancho, alto, { union: 3, minimo: 0 });
    // 36 píxeles pintados siguen siendo 36, con holgura o sin ella.
    expect(m.piezas[0].resto).toBe(false);
    expect(m.piezas[0].pixeles).toBe(36);
    expect([m.piezas[0].x0, m.piezas[0].y0, m.piezas[0].x1, m.piezas[0].y1])
      .toEqual([10, 10, 15, 15]);
  });

  it("no pierde ni un píxel: lo pequeño va al resto, no a la basura", () => {
    const ancho = 100, alto = 100;
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 0, 0, 40, 40);   // grande
    pintar(alfa, ancho, 90, 90, 2, 2);   // mota
    pintar(alfa, ancho, 90, 10, 2, 2);   // otra mota, lejos de la primera

    const m = etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0.01 });
    expect(m.encontradas).toBe(3);
    expect(m.piezas).toHaveLength(2);
    const resto = m.piezas.find((p) => p.resto)!;
    expect(resto.pixeles).toBe(8);
    // La caja del resto abarca las dos motas, aunque estén en esquinas distintas.
    expect([resto.x0, resto.y0, resto.x1, resto.y1]).toEqual([90, 10, 91, 91]);
    expect(m.piezas.reduce((s, p) => s + p.pixeles, 0)).toBe(1600 + 8);
  });

  it("no parte una capa opaca de fondo", () => {
    const ancho = 20, alto = 20;
    const alfa = new Uint8Array(ancho * alto).fill(255);
    const m = etiquetarPiezas(alfa, ancho, alto);
    expect(m.piezas).toHaveLength(1);
    expect(m.piezas[0].pixeles).toBe(400);
  });

  it("trata el casi-transparente como vacío", () => {
    const ancho = 20, alto = 20;
    const alfa = new Uint8Array(ancho * alto).fill(8);
    pintar(alfa, ancho, 5, 5, 4, 4);
    const m = etiquetarPiezas(alfa, ancho, alto, { umbral: 24, union: 0, minimo: 0 });
    expect(m.piezas).toHaveLength(1);
    expect(m.piezas[0].pixeles).toBe(16);
  });

  it("se queda con las más grandes cuando hay demasiadas", () => {
    const ancho = 200, alto = 40;
    const alfa = new Uint8Array(ancho * alto);
    // Diez manchas de tamaños distintos, cada una en su sitio.
    for (let i = 0; i < 10; i++) pintar(alfa, ancho, i * 20, 5, 2 + i, 2 + i);
    const m = etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0, maximo: 3 });
    expect(m.piezas.filter((p) => !p.resto)).toHaveLength(3);
    expect(m.piezas.filter((p) => p.resto)).toHaveLength(1);
    // Ordenadas de mayor a menor: la primera es la mancha de 11×11.
    expect(m.piezas[0].pixeles).toBe(121);
    expect(m.piezas[1].pixeles).toBe(100);
  });

  it("nombra las piezas sin encadenar sufijos al volver a partirlas", () => {
    const p = { etiqueta: 1, pixeles: 1, x0: 0, y0: 0, x1: 1, y1: 1, resto: false };
    expect(nombreDePieza("04 Farolillos", p, 0)).toBe("04 Farolillos · pieza 1");
    expect(nombreDePieza("04 Farolillos · pieza 1", p, 2)).toBe("04 Farolillos · pieza 3");
    expect(nombreDePieza("04 Farolillos · pieza 1", { ...p, resto: true }, 4))
      .toBe("04 Farolillos · resto");
  });

  it("aguanta una capa vacía sin inventarse piezas", () => {
    const m = etiquetarPiezas(new Uint8Array(400), 20, 20);
    expect(m.piezas).toHaveLength(0);
    expect(m.etiquetas).toHaveLength(400);
  });
});

describe("sacar lo que hay dentro de un rectángulo", () => {
  const ancho = 100, alto = 100;
  const conDosManchas = () => {
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 5, 5, 20, 20);   // izquierda arriba
    pintar(alfa, ancho, 60, 60, 20, 20); // derecha abajo
    return etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0 });
  };

  it("endereza un rectángulo dibujado de derecha a izquierda", () => {
    expect(zonaNormalizada({ x0: 0.8, y0: 0.9, x1: 0.2, y1: 0.1 }))
      .toEqual({ x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 });
    expect(zonaNormalizada({ x0: -3, y0: 0.5, x1: 9, y1: 0.5 }))
      .toEqual({ x0: 0, y0: 0.5, x1: 1, y1: 0.5 });
  });

  it("se lleva la silueta entera aunque el recuadro la corte un poco", () => {
    // El recuadro deja fuera la esquina de la mancha; como es una pieza suelta,
    // se la lleva completa en vez de partirla por la raya.
    const r = repartirPorZona(conDosManchas(), { x0: 0, y0: 0, x1: 0.22, y1: 0.22 });
    expect(r.aTijera).toBe(false);
    expect([...r.dentro]).toHaveLength(1);
  });

  it("corta a tijera cuando lo de dentro es parte de una sola mancha", () => {
    const alfa = new Uint8Array(ancho * alto);
    pintar(alfa, ancho, 0, 40, 100, 20); // una banda de lado a lado
    const mapa = etiquetarPiezas(alfa, ancho, alto, { union: 1, minimo: 0 });
    const r = repartirPorZona(mapa, { x0: 0, y0: 0, x1: 0.3, y1: 1 });
    expect(r.dentro.size).toBe(0);
    expect(r.aTijera).toBe(true);
    expect(r.pixelesDentro).toBe(30 * 20);
  });

  it("no propone nada cuando el recuadro cae sobre el vacío", () => {
    const r = repartirPorZona(conDosManchas(), { x0: 0.35, y0: 0.35, x1: 0.5, y1: 0.5 });
    expect(r.aTijera).toBe(false);
    expect(r.pixelesDentro).toBe(0);
  });

  it("deja fuera la pieza que solo asoma por el borde del recuadro", () => {
    // Solo entra una esquina de la segunda mancha: no es lo que se quería coger.
    const r = repartirPorZona(conDosManchas(), { x0: 0, y0: 0, x1: 0.65, y1: 0.65 });
    expect(r.dentro.size).toBe(1);
  });
});
