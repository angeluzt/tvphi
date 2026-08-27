import { describe, expect, it } from "vitest";
import { capasDeVivaSprites, nombreDeActor } from "./viva-sprites";
import { medioDe, vivaConSprites } from "./medio";
import type { ElementoVivo } from "./plan-medios";

const actor = (p: Partial<ElementoVivo> = {}): ElementoVivo => ({
  que: "a grey seagull gliding", x: 0.2, y: 0.3, alto: 0.1,
  fotogramas: 6, fps: 10, vista: "lateral", direccion: "derecha",
  accion: "volar", anclaje: "centro", ...p,
});

describe("capasDeVivaSprites", () => {
  it("la foto va la primera y sin sprite: es el fondo opaco", () => {
    const capas = capasDeVivaSprites({
      stillId: "foto-1",
      actores: [{ elemento: actor(), imageId: "tira-1", fotogramas: 6 }],
    });
    expect(capas).toHaveLength(2);
    expect(capas[0].imageId).toBe("foto-1");
    expect(capas[0].spr).toBeUndefined();
    expect(capas[1].spr).toBeDefined();
  });

  it("el actor conserva lo que dijo el plan", () => {
    const [, capa] = capasDeVivaSprites({
      stillId: "foto",
      actores: [{
        elemento: actor({ x: -0.2, y: 0.7, alto: 0.25, fps: 12, espejo: true }),
        imageId: "tira", fotogramas: 6,
      }],
    });
    expect(capa.spr).toMatchObject({
      x: -0.2, y: 0.7, alto: 0.25, fps: 12, espejo: true,
      vista: "lateral", direccionBase: "derecha", accion: "volar", anclaje: "centro",
      espacio: "capa",
    });
  });

  it("usa los fotogramas que quedaron, no los que se pidieron", () => {
    const [, capa] = capasDeVivaSprites({
      stillId: "foto",
      actores: [{ elemento: actor({ fotogramas: 8 }), imageId: "tira", fotogramas: 5 }],
    });
    expect((capa.spr as any).fotogramas).toBe(5);
  });

  it("un destino se convierte en trayectoria", () => {
    const [, capa] = capasDeVivaSprites({
      stillId: "foto",
      actores: [{
        elemento: actor({ hasta: { x: 1.2, y: 0.25, segundos: 7, bucle: true } }),
        imageId: "tira", fotogramas: 6,
      }],
    });
    expect((capa.spr as any).trayectoria).toEqual({ x: 1.2, y: 0.25, segundos: 7, bucle: true });
  });

  it("sin destino, el actor se anima en su sitio", () => {
    const [, capa] = capasDeVivaSprites({
      stillId: "foto", actores: [{ elemento: actor(), imageId: "tira", fotogramas: 6 }],
    });
    expect((capa.spr as any).trayectoria).toBeUndefined();
  });

  it("lo que está más abajo del cuadro queda delante", () => {
    const capas = capasDeVivaSprites({
      stillId: "foto",
      actores: [
        { elemento: actor({ y: 0.1 }), imageId: "a", fotogramas: 4 },
        { elemento: actor({ y: 0.9 }), imageId: "b", fotogramas: 4 },
      ],
    });
    expect(capas[2].depth).toBeGreaterThan(capas[1].depth);
    // Y las dos por delante de la foto, o no se verían.
    expect(capas[1].depth).toBeGreaterThan(capas[0].depth);
  });

  it("lo que sale de aquí se lee como foto viva, no como paralaje", () => {
    const capas = capasDeVivaSprites({
      stillId: "foto", actores: [{ elemento: actor(), imageId: "t", fotogramas: 6 }],
    });
    const escena = { medio: "apng" as const, capas };
    expect(medioDe(escena)).toBe("apng");
    expect(vivaConSprites(escena)).toBe(true);
  });
});

describe("nombreDeActor", () => {
  it("acorta a algo que quepa en la lista", () => {
    expect(nombreDeActor("a grey seagull gliding over the harbour", 0)).toBe("a grey seagull");
  });

  it("con una descripción impronunciable, cae a un número", () => {
    expect(nombreDeActor("!!! ???", 2)).toBe("Actor 3");
  });
});
