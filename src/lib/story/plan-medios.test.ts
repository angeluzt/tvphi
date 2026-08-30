import { describe, expect, it } from "vitest";
import {
  imagenesDelCapitulo, imagenesDelPlan, MAX_ELEMENTOS_VIVOS, MAX_LAMINAS_VIVAS,
  normalizarPlanMedio, resumenPlan,
} from "./plan-medios";
import { FOTOS_LOOP_DEFECTO, MAX_FOTOS_LOOP } from "./medio";

const ELEMENTO = {
  que: "a seagull gliding", x: 0.3, y: 0.4, alto: 0.12,
  fotogramas: 6, fps: 10, vista: "lateral", direccion: "derecha",
  accion: "volar", anclaje: "centro",
};

describe("normalizarPlanMedio", () => {
  it("una escena plana no tiene plan", () => {
    expect(normalizarPlanMedio({ viva: { tecnica: "sprites" } }, "still")).toBeUndefined();
  });

  it("lee la foto viva de cuadros con sus números", () => {
    const p = normalizarPlanMedio(
      { viva: { tecnica: "cuadros", movimiento: "the water", fotogramas: 9, fps: 4 } }, "apng");
    expect(p?.viva).toMatchObject({ tecnica: "cuadros", movimiento: "the water", fotogramas: 9, fps: 4 });
  });

  it("acota fotogramas y fps disparatados", () => {
    const p = normalizarPlanMedio({ viva: { fotogramas: 99, fps: 999 } }, "apng");
    expect(p?.viva?.fotogramas).toBe(MAX_FOTOS_LOOP);
    expect(p?.viva?.fps).toBe(16);
  });

  it("sin fotogramas pedidos, la foto viva sale con el defecto barato", () => {
    expect(normalizarPlanMedio({ viva: {} }, "apng")?.viva?.fotogramas).toBe(FOTOS_LOOP_DEFECTO);
    expect(normalizarPlanMedio(null, "apng")?.viva?.fotogramas).toBe(FOTOS_LOOP_DEFECTO);
  });

  it("pero respeta que se pidan más, hasta el tope", () => {
    expect(normalizarPlanMedio({ viva: { fotogramas: 8 } }, "apng")?.viva?.fotogramas).toBe(8);
    expect(normalizarPlanMedio({ viva: { fotogramas: MAX_FOTOS_LOOP } }, "apng")?.viva?.fotogramas)
      .toBe(MAX_FOTOS_LOOP);
  });

  it("sin sprites en la paleta, la técnica cae a cuadros", () => {
    const p = normalizarPlanMedio(
      { viva: { tecnica: "sprites", elementos: [ELEMENTO] } }, "apng", { sprites: false });
    expect(p?.viva?.tecnica).toBe("cuadros");
    expect(p?.viva?.elementos).toEqual([]);
  });

  it("con sprites encendidos, monta los actores", () => {
    const p = normalizarPlanMedio(
      { viva: { tecnica: "sprites", elementos: [ELEMENTO] } }, "apng", { sprites: true });
    expect(p?.viva?.tecnica).toBe("sprites");
    expect(p?.viva?.elementos[0]).toMatchObject({ que: "a seagull gliding", accion: "volar" });
  });

  it("una foto viva de sprites SIN actores vuelve a cuadros", () => {
    const p = normalizarPlanMedio(
      { viva: { tecnica: "sprites", elementos: [] } }, "apng", { sprites: true });
    expect(p?.viva?.tecnica).toBe("cuadros");
  });

  it("tira los actores sin descripción y topa el número", () => {
    const muchos = Array.from({ length: 9 }, () => ELEMENTO);
    const p = normalizarPlanMedio(
      { viva: { tecnica: "sprites", elementos: [{ que: "" }, ...muchos] } },
      "apng", { sprites: true });
    expect(p?.viva?.elementos).toHaveLength(MAX_ELEMENTOS_VIVOS);
  });

  it("deja al actor salirse un poco del cuadro para poder entrar", () => {
    const p = normalizarPlanMedio(
      { viva: { tecnica: "sprites", elementos: [{ ...ELEMENTO, x: -0.3 }] } },
      "apng", { sprites: true });
    expect(p?.viva?.elementos[0].x).toBe(-0.3);
  });

  it("lee el paralaje con sus láminas vivas", () => {
    const p = normalizarPlanMedio(
      { paralaje: { capas: 5, vivas: ["agua", "cielo"], sprites: true } },
      "paralaje", { sprites: true });
    expect(p?.paralaje).toEqual({ capas: 5, vivas: ["agua", "cielo"], sprites: true });
  });

  it("acota las láminas al rango que sabe dibujar", () => {
    expect(normalizarPlanMedio({ paralaje: { capas: 40 } }, "paralaje")?.paralaje?.capas).toBe(6);
    expect(normalizarPlanMedio({ paralaje: { capas: 1 } }, "paralaje")?.paralaje?.capas).toBe(3);
  });

  it("aguanta basura", () => {
    expect(normalizarPlanMedio(null, "apng")?.viva?.tecnica).toBe("cuadros");
    expect(normalizarPlanMedio("x", "paralaje")?.paralaje?.capas).toBe(4);
  });
});

describe("imagenesDelPlan", () => {
  it("una foto plana es una imagen", () => {
    expect(imagenesDelPlan("still", undefined)).toBe(1);
  });

  it("la foto viva de sprites cuesta MUCHO menos que la de cuadros", () => {
    const cuadros = imagenesDelPlan("apng", {
      viva: { tecnica: "cuadros", fotogramas: 6, fps: 6, elementos: [] },
    });
    const sprites = imagenesDelPlan("apng", {
      viva: { tecnica: "sprites", fotogramas: 6, fps: 6, elementos: [ELEMENTO as any] },
    });
    expect(cuadros).toBe(6);
    expect(sprites).toBe(2);
  });

  it("el paralaje suma las láminas y lo que se anima", () => {
    expect(imagenesDelPlan("paralaje", {
      paralaje: { capas: 4, vivas: ["agua"], sprites: false },
    })).toBe(1 + 4 + (FOTOS_LOOP_DEFECTO - 1));
  });

  it("no cuenta más láminas vivas de las que se van a animar", () => {
    // Se piden cinco, se animan dos: el precio tiene que ser el de dos, que es
    // lo que se va a gastar de verdad.
    expect(imagenesDelPlan("paralaje", {
      paralaje: { capas: 3, vivas: ["a", "b", "c", "d", "e"], sprites: false },
    })).toBe(1 + 3 + MAX_LAMINAS_VIVAS * (FOTOS_LOOP_DEFECTO - 1));
  });
});

describe("imagenesDelCapitulo", () => {
  it("suma escena a escena", () => {
    expect(imagenesDelCapitulo([
      { medio: "still" },
      { medio: "apng", plan: { viva: { tecnica: "cuadros", fotogramas: 4, fps: 6, elementos: [] } } },
    ])).toBe(1 + 4);
  });
});

describe("resumenPlan", () => {
  it("dice qué es y cuánto cuesta", () => {
    expect(resumenPlan("still", undefined)).toContain("1 imagen");
    expect(resumenPlan("apng", {
      viva: { tecnica: "sprites", fotogramas: 6, fps: 8, elementos: [ELEMENTO as any] },
    })).toMatch(/1 actor · 2 imágenes/);
    expect(resumenPlan("paralaje", { paralaje: { capas: 4, vivas: ["agua"], sprites: false } }))
      .toMatch(/4 láminas, 1 viva/);
  });
});
