import { describe, it, expect } from "vitest";
import {
  normalizarEfectos, aEntradaVfx, claveEfectos, nombreEfecto,
} from "./efectos-escena";

describe("normalizarEfectos", () => {
  it("lee la forma corta que se le pide a la IA", () => {
    // Es literalmente el ejemplo del prompt de la ruta del laboratorio.
    const { efectos } = normalizarEfectos([
      { id: "humo", espacio: "imagen", x: 0.5, y: 0.7, escala: 0.4 },
    ]);
    expect(efectos).toHaveLength(1);
    expect(efectos[0].kind).toBe("humo");
    expect(efectos[0].espacio).toBe("imagen");
    expect(efectos[0].x).toBeCloseTo(0.5);
    expect(efectos[0].y).toBeCloseTo(0.7);
  });

  it("tira los efectos que no existen, con aviso", () => {
    const { efectos, avisos } = normalizarEfectos([
      { id: "purpurina-magica", x: 0.5, y: 0.5 },
      { id: "fuego", x: 0.2, y: 0.8 },
    ]);
    expect(efectos).toHaveLength(1);
    expect(efectos[0].kind).toBe("fuego");
    expect(avisos[0]).toMatch(/purpurina-magica/);
  });

  it("la lluvia y la niebla son del aire aunque digan «imagen»", () => {
    // Pegarlas a un sitio se ve mal siempre: crecerían al acercar la cámara.
    const { efectos } = normalizarEfectos([
      { id: "lluvia", espacio: "imagen", x: 0.5, y: 0.5 },
    ]);
    expect(efectos[0].shape).toBe("arriba");
    expect(efectos[0].espacio).toBe("encuadre");
  });

  it("una forma que el efecto no admite se cambia por la suya, no se descarta", () => {
    const { efectos } = normalizarEfectos([
      { id: "explosion", shape: "arriba", x: 0.4, y: 0.4 },
    ]);
    expect(efectos).toHaveLength(1);
    expect(efectos[0].shape).toBe("punto");
  });

  it("acota coordenadas disparatadas", () => {
    const { efectos } = normalizarEfectos([{ id: "fuego", x: 99, y: -99 }]);
    expect(efectos[0].x).toBe(1.5);
    expect(efectos[0].y).toBe(-0.5);
  });

  it("respeta los ajustes que vengan, dentro de su rango", () => {
    const { efectos } = normalizarEfectos([
      { id: "fuego", x: 0.5, y: 0.5, params: { size: 999, intensity: -50 } },
    ]);
    expect(efectos[0].params.size).toBeLessThanOrEqual(3);
    expect(efectos[0].params.intensity).toBeGreaterThanOrEqual(0.2);
  });

  it("«escala» agranda el efecto", () => {
    const chico = normalizarEfectos([{ id: "fuego", x: 0.5, y: 0.5, escala: 0.2 }]).efectos[0];
    const grande = normalizarEfectos([{ id: "fuego", x: 0.5, y: 0.5, escala: 0.9 }]).efectos[0];
    expect(grande.params.size).toBeGreaterThan(chico.params.size);
  });

  it("cada efecto sale con un id propio", () => {
    const { efectos } = normalizarEfectos([
      { id: "fuego", x: 0.1, y: 0.1 },
      { id: "fuego", x: 0.9, y: 0.1 },
    ]);
    expect(efectos[0].id).not.toBe(efectos[1].id);
  });

  it("aguanta basura sin reventar", () => {
    expect(normalizarEfectos(null).efectos).toEqual([]);
    expect(normalizarEfectos("humo").efectos).toEqual([]);
    expect(normalizarEfectos([null, 3, "x"]).efectos).toEqual([]);
  });

  it("no se traga una lista infinita", () => {
    const muchos = Array.from({ length: 200 }, () => ({ id: "chispas", x: 0.5, y: 0.5 }));
    expect(normalizarEfectos(muchos).efectos.length).toBe(24);
  });
});

describe("aEntradaVfx", () => {
  it("usa la posición de PANTALLA que le den, no la de la escena", () => {
    const e = normalizarEfectos([{ id: "fuego", x: 0.2, y: 0.9 }]).efectos[0];
    const v = aEntradaVfx(e, { x: 0.7, y: 0.3, x2: 0.7, y2: 0.3 });
    expect(v.nodes[0]).toEqual({ x: 0.7, y: 0.3, x2: 0.7, y2: 0.3 });
    expect(v.kind).toBe("fuego");
  });

  it("la ventana cubre toda la reproducción", () => {
    // En el laboratorio no hay tomas: con una ventana corta los efectos se
    // darían de baja a los pocos segundos y parecería que están rotos.
    const e = normalizarEfectos([{ id: "humo", x: 0.5, y: 0.5 }]).efectos[0];
    const v = aEntradaVfx(e, { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 });
    expect(v.start).toBe(0);
    expect(v.end).toBeGreaterThan(1e6);
  });
});

describe("claveEfectos", () => {
  it("NO cambia al moverse la cámara", () => {
    // Si la posición entrara en la clave, cada fotograma reiniciaría las
    // partículas y solo se vería el primer instante del efecto en bucle.
    const { efectos } = normalizarEfectos([{ id: "fuego", x: 0.2, y: 0.8 }]);
    const antes = claveEfectos(efectos);
    const movido = [{ ...efectos[0], x: 0.9, y: 0.1 }];
    expect(claveEfectos(movido)).toBe(antes);
  });

  it("cambia si se añade o se quita un efecto", () => {
    const uno = normalizarEfectos([{ id: "fuego", x: 0.2, y: 0.8 }]).efectos;
    const dos = normalizarEfectos([
      { id: "fuego", x: 0.2, y: 0.8 }, { id: "humo", x: 0.5, y: 0.5 },
    ]).efectos;
    expect(claveEfectos(uno)).not.toBe(claveEfectos(dos));
  });
});

describe("nombreEfecto", () => {
  it("da algo legible", () => {
    expect(nombreEfecto("lluvia")).toBeTruthy();
    expect(nombreEfecto("lluvia")).not.toBe("lluvia");
  });
});
