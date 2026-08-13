import { describe, expect, it } from "vitest";
import { cajaEnLienzo, colorDeGuia, puntosDeMov, resumenDeMov } from "./guia-animacion";

describe("los puntos que se enseñan de cada animación", () => {
  it("una trayectoria son dos puntos, A y B", () => {
    const p = puntosDeMov({ tipo: "trayectoria", desdeX: -0.1, desdeY: 0, x: 0.3, y: 0.05 });
    expect(p.map((q) => q.etiqueta)).toEqual(["A", "B"]);
    expect(p[0]).toMatchObject({ dx: -0.1, dy: 0 });
    expect(p[1]).toMatchObject({ dx: 0.3, dy: 0.05 });
  });

  it("una trayectoria sin punto de salida arranca donde está la capa", () => {
    const p = puntosDeMov({ tipo: "trayectoria", x: 0.2, y: 0 });
    expect(p[0]).toMatchObject({ dx: 0, dy: 0 });
  });

  it("una ruta empieza en A y sigue con una letra por punto", () => {
    const p = puntosDeMov({
      tipo: "ruta",
      pasos: [
        { x: 0.2, y: 0, segundos: 2 },
        { x: 0.2, y: 0.1, segundos: 1, espera: 1.5 },
        { x: 0, y: 0.1, segundos: 2 },
      ],
    });
    expect(p.map((q) => q.etiqueta)).toEqual(["A", "B", "C", "D"]);
    expect(p[2].espera).toBe(1.5);
    // El primero es siempre el sitio de la capa: los pasos son desplazamientos.
    expect(p[0]).toMatchObject({ dx: 0, dy: 0 });
  });

  it("no dibuja camino a lo que solo oscila donde está", () => {
    // Un «flotar» no va a ninguna parte: dos puntos harían creer que se marcha.
    expect(puntosDeMov({ tipo: "flotar", amplitud: 0.04 })).toEqual([]);
    expect(puntosDeMov({ tipo: "vaiven" })).toEqual([]);
    expect(puntosDeMov({ tipo: "pulso" })).toEqual([]);
    expect(puntosDeMov({ tipo: "deriva", x: 0.1 })).toEqual([]);
    expect(puntosDeMov(undefined)).toEqual([]);
  });

  it("una ruta sin pasos no tiene nada que enseñar", () => {
    expect(puntosDeMov({ tipo: "ruta", pasos: [] })).toEqual([]);
  });
});

describe("cómo se resume una animación en una línea", () => {
  it("dice a dónde va y cuánto tarda", () => {
    expect(resumenDeMov({ tipo: "trayectoria", segundos: 4 })).toBe("A → B · 4s");
    expect(resumenDeMov({ tipo: "trayectoria", segundos: 2.5, volver: true, bucle: true }))
      .toBe("A → B · 2.5s · vuelve · en bucle");
  });

  it("cuenta los puntos de una ruta contando el de salida", () => {
    expect(resumenDeMov({ tipo: "ruta", pasos: [{ x: 0.1, y: 0, segundos: 1 }] }))
      .toBe("Ruta de 2 puntos");
  });

  it("enseña el sentido de una deriva con flechas", () => {
    expect(resumenDeMov({ tipo: "deriva", x: 0.1 })).toBe("Deriva → · en bucle");
    expect(resumenDeMov({ tipo: "deriva", y: -0.1, bucle: false })).toBe("Deriva ↑");
  });

  it("da amplitud y ciclo de lo que oscila", () => {
    expect(resumenDeMov({ tipo: "flotar", amplitud: 0.05, segundos: 3 })).toBe("Flota 5% · 3s");
    expect(resumenDeMov({ tipo: "pulso", amplitud: 0.02, segundos: 6 })).toBe("Pulso 2% · 6s");
  });

  it("sin movimiento no dice nada", () => {
    expect(resumenDeMov(undefined)).toBe("");
  });
});

describe("dónde cae la caja del contenido", () => {
  it("se estira con el plano de la capa", () => {
    const caja = { x0: 0.5, y0: 0.25, x1: 1, y1: 0.75 };
    const r = cajaEnLienzo(caja, { x0: 0, y0: 0, w: 1000, h: 800 });
    expect(r).toEqual({ x: 500, y: 200, w: 500, h: 400 });
  });

  it("acompaña al plano cuando la cámara lo ha desplazado", () => {
    const caja = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const r = cajaEnLienzo(caja, { x0: -100, y0: -50, w: 1200, h: 900 });
    expect(r).toEqual({ x: -100, y: -50, w: 1200, h: 900 });
  });
});

describe("los colores de las guías", () => {
  it("se repiten en ciclo para no quedarse sin", () => {
    expect(colorDeGuia(0)).toBe(colorDeGuia(8));
    expect(colorDeGuia(1)).not.toBe(colorDeGuia(0));
  });
});
