import { describe, expect, it } from "vitest";
import {
  FOTOGRAMAS_DEFECTO, FPS_LOOP_DEFECTO, MAX_FOTOS_LOOP,
  duracionLoop, idLoopEn, idsDeLoopEscena, indiceLoop, medioDe,
  normalizarLoop, normalizarPlanAnimacion, type LoopImagen,
} from "./medio";

const loop = (n: number, extra: Partial<LoopImagen> = {}): LoopImagen => ({
  imageIds: Array.from({ length: n }, (_, i) => `f${i}`),
  fps: 1,
  ...extra,
});

describe("normalizar un loop guardado", () => {
  it("se queda con los ids buenos y acota los fps", () => {
    const l = normalizarLoop({ imageIds: ["a", "", "b", null, "c"], fps: 99 });
    expect(l?.imageIds).toEqual(["a", "b", "c"]);
    expect(l?.fps).toBe(30);
  });

  it("con menos de dos fotos no hay loop", () => {
    expect(normalizarLoop({ imageIds: ["a"], fps: 6 })).toBeUndefined();
    expect(normalizarLoop(null)).toBeUndefined();
  });

  it("no acepta más fotos de las que se pueden pagar", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `f${i}`);
    expect(normalizarLoop({ imageIds: ids, fps: 6 })?.imageIds).toHaveLength(MAX_FOTOS_LOOP);
  });

  it("un loop viejo, sin el campo, estrena vaivén", () => {
    // El vaivén sale gratis y arregla el tirón del cierre, así que lo que ya
    // estaba guardado también se beneficia. Solo se apaga diciéndolo.
    expect(normalizarLoop({ imageIds: ["a", "b"], fps: 6 })?.vaiven).toBe(true);
    expect(normalizarLoop({ imageIds: ["a", "b"], fps: 6, vaiven: false })?.vaiven).toBe(false);
  });
});

describe("el vaivén: ir y volver en vez de cortar", () => {
  it("sube hasta el final y baja sin repetir los extremos", () => {
    // Los cuadros se dibujan encadenados, así que el último se parece al
    // penúltimo y NO al primero: cortando de 4 a 0 se repetiría una vez por
    // vuelta el mayor salto de todo el ciclo, que es el parpadeo que se veía.
    const l = loop(5);
    const salida = Array.from({ length: 10 }, (_, t) => indiceLoop(l, t));
    expect(salida).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0, 1]);
  });

  it("con dos fotos alterna, que es lo único que puede hacer", () => {
    const l = loop(2);
    expect([0, 1, 2, 3].map((t) => indiceLoop(l, t))).toEqual([0, 1, 0, 1]);
  });

  it("apagado, corta al primero como antes", () => {
    const l = loop(4, { vaiven: false });
    expect([0, 1, 2, 3, 4, 5].map((t) => indiceLoop(l, t))).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it("nunca se sale de la lista, mire donde mire", () => {
    // Un índice fuera de rango deja la escena en negro a mitad del vídeo.
    for (const n of [2, 3, 4, 7, 12]) {
      const l = loop(n, { fps: 7 });
      for (let t = 0; t < 60; t += 0.37) {
        const i = indiceLoop(l, t);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      }
    }
  });

  it("un tiempo raro no rompe: se queda en el primero", () => {
    const l = loop(5);
    expect(indiceLoop(l, -3)).toBe(0);
    expect(indiceLoop(l, NaN)).toBe(0);
    expect(indiceLoop({ ...l, fps: 0 }, 2)).toBe(0);
  });

  it("la vuelta dura casi el doble yendo y volviendo", () => {
    expect(duracionLoop(loop(5, { fps: 5 }))).toBeCloseTo(8 / 5, 5);
    expect(duracionLoop(loop(5, { fps: 5, vaiven: false }))).toBeCloseTo(1, 5);
  });
});

describe("elegir el id que toca", () => {
  it("sin loop se queda con la foto de siempre", () => {
    expect(idLoopEn(undefined, 3, "still")).toBe("still");
    expect(idLoopEn({ imageIds: ["a"], fps: 6 }, 3, "still")).toBe("still");
  });

  it("con loop devuelve el fotograma del momento", () => {
    expect(idLoopEn(loop(3), 1, "still")).toBe("f1");
    expect(idLoopEn(loop(3), 3, "still")).toBe("f1"); // ya de vuelta
  });
});

describe("qué medio es de verdad una escena", () => {
  it("manda lo que HAY montado, no lo que se apuntó", () => {
    // Marcar «apng» no dibuja nada: hasta que no hay fotos, es una foto fija.
    expect(medioDe({ medio: "apng" })).toBe("still");
    expect(medioDe({ medio: "still", loop: loop(3) })).toBe("apng");
    expect(medioDe({ medio: "apng", capas: [{}], loop: loop(3) })).toBe("paralaje");
  });

  it("junta los fotogramas de la escena y los de sus láminas", () => {
    const ids = idsDeLoopEscena({ loop: loop(2), capas: [{ loop: { imageIds: ["c0", "c1"], fps: 6 } }] });
    expect(ids).toEqual(["f0", "f1", "c0", "c1"]);
  });
});

describe("el plan de animación que escribe la IA", () => {
  it("se queda con la frase y acota los números", () => {
    expect(normalizarPlanAnimacion({
      movimiento: "  the flames   flicker ", fotogramas: 99, fps: 400,
    })).toEqual({ movimiento: "the flames flicker", fotogramas: MAX_FOTOS_LOOP, fps: 30 });
  });

  it("sin frase no hay plan", () => {
    // Generar cinco imágenes con un «qué se mueve» vacío es pagar cinco veces
    // por el genérico que causaba el problema.
    expect(normalizarPlanAnimacion({ movimiento: "ok", fotogramas: 5 })).toBeUndefined();
    expect(normalizarPlanAnimacion({ fotogramas: 5, fps: 6 })).toBeUndefined();
    expect(normalizarPlanAnimacion(null)).toBeUndefined();
  });

  it("sin números, los de siempre", () => {
    expect(normalizarPlanAnimacion({ movimiento: "the smoke rises" })).toEqual({
      movimiento: "the smoke rises",
      fotogramas: FOTOGRAMAS_DEFECTO,
      fps: FPS_LOOP_DEFECTO,
    });
  });
});
