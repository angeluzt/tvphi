import { describe, it, expect, vi, beforeAll } from "vitest";
import { desplazamientoParaCentrar, centrarCeldasEnContenido } from "./sprites";

// El temblor de los sprites generados no viene del recorte: viene de que el
// modelo no pone al bicho exactamente en el mismo sitio dentro de cada celda.
// La caja común mantiene el TAMAÑO estable, pero conserva esa deriva, y al
// reproducir se ve como un brinco lateral.
//
// Centrar cada cuadro sobre su propia silueta la elimina. Estas pruebas fijan
// la aritmética, que es donde se cuela un píxel de más y vuelve el temblor.

describe("desplazamientoParaCentrar", () => {
  it("una silueta ya centrada no se mueve", () => {
    // Caja de 40 px centrada en un lienzo de 100.
    const d = desplazamientoParaCentrar({ x0: 30, y0: 30, x1: 69, y1: 69 }, 100, 100);
    expect(d).toEqual({ x: 0, y: 0 });
  });

  it("una pegada a la izquierda se empuja a la derecha", () => {
    const d = desplazamientoParaCentrar({ x0: 0, y0: 30, x1: 39, y1: 69 }, 100, 100);
    expect(d.x).toBe(30);
    expect(d.y).toBe(0);
  });

  it("y una pegada abajo se sube", () => {
    const d = desplazamientoParaCentrar({ x0: 30, y0: 60, x1: 69, y1: 99 }, 100, 100);
    expect(d.x).toBe(0);
    expect(d.y).toBe(-30);
  });

  it("dos cuadros con la MISMA silueta en sitios distintos acaban igual", () => {
    // Es el caso real: el mismo bicho, movido unos píxeles entre celdas.
    const izquierda = { x0: 10, y0: 20, x1: 49, y1: 59 };
    const derecha = { x0: 22, y0: 26, x1: 61, y1: 65 };
    const a = desplazamientoParaCentrar(izquierda, 100, 100);
    const b = desplazamientoParaCentrar(derecha, 100, 100);
    // Tras centrar, el centro de la silueta cae en el mismo punto en los dos.
    const centroA = (izquierda.x0 + izquierda.x1 + 1) / 2 + a.x;
    const centroB = (derecha.x0 + derecha.x1 + 1) / 2 + b.x;
    expect(centroA).toBe(centroB);
    expect(centroA).toBe(50);
  });

  it("aguanta siluetas de un solo píxel", () => {
    // El centro de un píxel en la posición 7 es 7,5; de 50 a 7,5 hay 42,5, que
    // se redondea a 43. Se comprueba que el resultado deja la silueta a medio
    // píxel del centro, que es lo máximo que permite una rejilla entera.
    const d = desplazamientoParaCentrar({ x0: 7, y0: 7, x1: 7, y1: 7 }, 100, 100);
    expect(Math.abs(7.5 + d.x - 50)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(7.5 + d.y - 50)).toBeLessThanOrEqual(0.5);
  });
});

describe("centrarCeldasEnContenido", () => {
  const celdas = [
    { x: 0, y: 0, ancho: 100, alto: 100 },
    { x: 100, y: 0, ancho: 100, alto: 100 },
  ];

  it("deja todas las celdas del mismo tamaño", () => {
    const r = centrarCeldasEnContenido(
      celdas,
      [{ x0: 10, y0: 10, x1: 49, y1: 49 }, { x0: 130, y0: 20, x1: 169, y1: 59 }],
      200, 100,
    );
    expect(r[0].ancho).toBe(r[1].ancho);
    expect(r[0].alto).toBe(r[1].alto);
  });

  it("centra cada celda sobre su propia silueta cuando hay sitio", () => {
    // Celdas de 60 sobre una hoja de 400: caben centradas sin tocar los bordes.
    const anchas = [{ x: 0, y: 20, ancho: 60, alto: 60 }, { x: 200, y: 20, ancho: 60, alto: 60 }];
    const cajas = [{ x0: 90, y0: 30, x1: 129, y1: 69 }, { x0: 250, y0: 26, x1: 289, y1: 65 }];
    const r = centrarCeldasEnContenido(anchas, cajas, 400, 200);
    for (let i = 0; i < 2; i++) {
      const centroSilueta = (cajas[i].x0 + cajas[i].x1 + 1) / 2;
      const centroCelda = r[i].x + r[i].ancho / 2;
      expect(Math.abs(centroSilueta - centroCelda)).toBeLessThanOrEqual(1);
    }
  });

  it("si la silueta está tan al borde que la celda se saldría, se acota", () => {
    // No es un fallo: sacar el recorte de la hoja leería píxeles que no existen.
    // Se prefiere una celda pegada al canto antes que un recorte inválido.
    const r = centrarCeldasEnContenido(
      celdas, [{ x0: 0, y0: 0, x1: 9, y1: 9 }, { x0: 190, y0: 90, x1: 199, y1: 99 }], 200, 100,
    );
    expect(r[0].x).toBe(0);
    expect(r[0].y).toBe(0);
    expect(r[1].x + r[1].ancho).toBeLessThanOrEqual(200);
  });

  it("una celda sin silueta conserva su sitio y adopta el tamaño común", () => {
    const r = centrarCeldasEnContenido(celdas, [{ x0: 10, y0: 10, x1: 49, y1: 49 }, null], 200, 100);
    expect(r[1].ancho).toBe(r[0].ancho);
    expect(r[1].alto).toBe(r[0].alto);
  });

  it("no se sale de la hoja", () => {
    const r = centrarCeldasEnContenido(
      celdas,
      [{ x0: 0, y0: 0, x1: 5, y1: 5 }, { x0: 194, y0: 94, x1: 199, y1: 99 }],
      200, 100,
    );
    for (const c of r) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.ancho).toBeLessThanOrEqual(200);
      expect(c.y + c.alto).toBeLessThanOrEqual(100);
    }
  });
});
