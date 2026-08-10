import { describe, it, expect } from "vitest";
import {
  duracionRuta, posicionEnRuta, normalizarMov, desplazamientoCapa,
  type PuntoRutaCapa,
} from "./movimiento-capa";

const A: PuntoRutaCapa[] = [
  { x: 0.5, y: 0, segundos: 2 },
  { x: 0.5, y: 0.4, segundos: 2 },
];

describe("duracionRuta", () => {
  it("suma los tramos", () => {
    expect(duracionRuta(A)).toBe(4);
  });

  it("cuenta las esperas", () => {
    expect(duracionRuta([{ x: 1, y: 0, segundos: 2, espera: 3 }])).toBe(5);
  });

  it("al volver repite los tramos pero NO las esperas", () => {
    // La parada es del viaje de ida: al regresar no se vuelve a parar allí.
    expect(duracionRuta([{ x: 1, y: 0, segundos: 2, espera: 3 }], true)).toBe(7);
  });
});

describe("posicionEnRuta", () => {
  it("arranca en el sitio de la capa, no en el primer punto", () => {
    expect(posicionEnRuta(A, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("llega exactamente a cada punto en su momento", () => {
    expect(posicionEnRuta(A, 2).dx).toBeCloseTo(0.5, 6);
    expect(posicionEnRuta(A, 2).dy).toBeCloseTo(0, 6);
    expect(posicionEnRuta(A, 4).dy).toBeCloseTo(0.4, 6);
  });

  it("se queda en el último punto cuando acaba y no hay bucle", () => {
    expect(posicionEnRuta(A, 99).dy).toBeCloseTo(0.4, 6);
  });

  it("con espera se queda quieto el tiempo pedido", () => {
    const p: PuntoRutaCapa[] = [{ x: 1, y: 0, segundos: 1, espera: 2 }];
    expect(posicionEnRuta(p, 1).dx).toBeCloseTo(1, 6);
    expect(posicionEnRuta(p, 2).dx).toBeCloseTo(1, 6);
    expect(posicionEnRuta(p, 2.9).dx).toBeCloseTo(1, 6);
  });

  it("al volver deshace el camino por los MISMOS puntos", () => {
    // Ida 0→(1,0)→(1,1) en 2 s; vuelta (1,1)→(1,0)→(0,0) en otros 2 s.
    const p: PuntoRutaCapa[] = [
      { x: 1, y: 0, segundos: 1, suavizado: "lineal" },
      { x: 1, y: 1, segundos: 1, suavizado: "lineal" },
    ];
    expect(duracionRuta(p, true)).toBe(4);
    // A mitad de la vuelta del primer tramo va de (1,1) hacia (1,0).
    const m = posicionEnRuta(p, 2.5, { volver: true });
    expect(m.dx).toBeCloseTo(1, 6);
    expect(m.dy).toBeCloseTo(0.5, 6);
    // Y termina en el origen, no de un salto.
    const fin = posicionEnRuta(p, 4, { volver: true });
    expect(fin.dx).toBeCloseTo(0, 6);
    expect(fin.dy).toBeCloseTo(0, 6);
  });

  it("con bucle vuelve a empezar sin salirse", () => {
    const a = posicionEnRuta(A, 0.5);
    const b = posicionEnRuta(A, 4.5, { bucle: true });
    expect(b.dx).toBeCloseTo(a.dx, 6);
    expect(b.dy).toBeCloseTo(a.dy, 6);
  });

  it("una ruta vacía deja la capa quieta", () => {
    expect(posicionEnRuta([], 3)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("normalizarMov con ruta", () => {
  it("acota los puntos que llegan de tocar la pantalla", () => {
    const m = normalizarMov({ tipo: "ruta", pasos: [{ x: 99, y: -99, segundos: 999 }] });
    expect(m?.pasos?.[0].x).toBe(3);
    expect(m?.pasos?.[0].y).toBe(-3);
    expect(m?.pasos?.[0].segundos).toBe(120);
  });

  it("una ruta que no se mueve de su sitio no es un movimiento", () => {
    expect(normalizarMov({ tipo: "ruta", pasos: [{ x: 0, y: 0, segundos: 2 }] })).toBeUndefined();
    expect(normalizarMov({ tipo: "ruta", pasos: [] })).toBeUndefined();
  });

  it("conserva repetir y volver", () => {
    const m = normalizarMov({ tipo: "ruta", pasos: [{ x: 1, y: 0, segundos: 1 }], bucle: true, volver: true });
    expect(m?.bucle).toBe(true);
    expect(m?.volver).toBe(true);
  });

  it("no se traga más de 24 puntos", () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ x: i / 60, y: 0, segundos: 1 }));
    expect(normalizarMov({ tipo: "ruta", pasos: muchos })?.pasos?.length).toBe(24);
  });
});

describe("desplazamientoCapa con ruta", () => {
  it("la usa al pintar", () => {
    const mov = normalizarMov({ tipo: "ruta", pasos: A })!;
    expect(desplazamientoCapa(mov, 0).dx).toBeCloseTo(0, 6);
    expect(desplazamientoCapa(mov, 2).dx).toBeCloseTo(0.5, 6);
    expect(desplazamientoCapa(mov, 2).escala).toBe(1);
  });
});
