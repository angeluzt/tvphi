import { describe, it, expect } from "vitest";
import { celdasSpritePorDefecto, celdasSpriteEnRejilla } from "./sprites";

// «Rejilla original» devolvía columnas verticales que no cuadraban con la hoja,
// y no había forma de volver al reparto bueno.
//
// LA CAUSA: el botón reconstruía la rejilla con `celdasSpritePorDefecto`, que
// solo sabe hacer DOS cosas —N celdas en fila, o N en columna— porque decide a
// partir de `forma`, que únicamente distingue apaisado de alto. Una hoja
// generada en 3×2 volvía como 6 franjas verticales.
//
// El reparto de verdad lo hace `celdasSpriteEnRejilla`, con las columnas y
// filas con las que se cortó. Es lo que usa el botón ahora.

const ANCHO = 1536;
const ALTO = 1024;

describe("la rejilla de una hoja de 3×2", () => {
  const real = celdasSpriteEnRejilla(ANCHO, ALTO, 6, { columnas: 3, filas: 2 });

  it("da seis celdas repartidas en dos filas de tres", () => {
    expect(real).toHaveLength(6);
    // Tres columnas distintas…
    expect(new Set(real.map((c) => c.x)).size).toBe(3);
    // …y dos filas distintas.
    expect(new Set(real.map((c) => c.y)).size).toBe(2);
  });

  it("cada celda es un tercio de ancho y media de alto", () => {
    expect(real[0].ancho).toBe(ANCHO / 3);
    expect(real[0].alto).toBe(ALTO / 2);
  });

  it("la segunda fila empieza a media hoja", () => {
    expect(real[3].y).toBe(ALTO / 2);
    expect(real[3].x).toBe(0);
  });

  it("lo que hacía el botón antes NO se parece en nada", () => {
    // Esto es lo que devolvía: seis franjas de todo el alto, o seis de todo
    // el ancho. Ninguna de las dos cuadra con una hoja de 3×2.
    const viejoFila = celdasSpritePorDefecto(ANCHO, ALTO, 6, "tira");
    const viejoColumna = celdasSpritePorDefecto(ANCHO, ALTO, 6, "columna");
    expect(new Set(viejoFila.map((c) => c.y)).size).toBe(1);
    expect(viejoColumna.every((c) => c.ancho === ANCHO)).toBe(true);
    expect(viejoFila).not.toEqual(real);
    expect(viejoColumna).not.toEqual(real);
  });
});

describe("otras rejillas", () => {
  it("una fila sigue siendo una fila", () => {
    const r = celdasSpriteEnRejilla(ANCHO, ALTO, 4, { columnas: 4, filas: 1 });
    expect(new Set(r.map((c) => c.y)).size).toBe(1);
    expect(r[0].alto).toBe(ALTO);
  });

  it("una columna sigue siendo una columna", () => {
    const r = celdasSpriteEnRejilla(ANCHO, ALTO, 4, { columnas: 1, filas: 4 });
    expect(new Set(r.map((c) => c.x)).size).toBe(1);
    expect(r[0].ancho).toBe(ANCHO);
  });

  it("con huecos al final no se sale de la hoja", () => {
    // Cinco cuadros en una rejilla de 3×2: sobra una celda.
    const r = celdasSpriteEnRejilla(ANCHO, ALTO, 5, { columnas: 3, filas: 2 });
    expect(r).toHaveLength(5);
    for (const c of r) {
      expect(c.x + c.ancho).toBeLessThanOrEqual(ANCHO);
      expect(c.y + c.alto).toBeLessThanOrEqual(ALTO);
    }
  });

  it("si la rejilla no da para los cuadros, cae a una fila en vez de romper", () => {
    const r = celdasSpriteEnRejilla(ANCHO, ALTO, 8, { columnas: 2, filas: 2 });
    expect(r).toHaveLength(8);
    expect(new Set(r.map((c) => c.y)).size).toBe(1);
  });
});
