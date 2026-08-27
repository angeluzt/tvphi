import { describe, expect, it } from "vitest";
import { migrateProject, projectAssets } from "./model";

describe("migrateProject conserva lo vivo", () => {
  it("no tira cámara, movimiento ni loop al recargar", () => {
    const p = migrateProject({
      aspect: "16:9",
      paleta: { paralaje: true, apng: true },
      scenes: [{
        id: "s1",
        imageId: "img-1",
        imgW: 16, imgH: 9,
        medio: "paralaje",
        camara: [{ tipo: "acercar", ms: 1000 }],
        loop: { imageIds: ["img-1", "img-2"], fps: 8 },
        capas: [{
          id: "c1", imageId: "capa-1", nombre: "cielo",
          depth: 0.2, escala: 1.1, opacidad: 1,
          mov: { tipo: "deriva", vx: 0.01 },
          spr: { fotogramas: 4, fps: 8 },
          loop: { imageIds: ["capa-1", "capa-1b"], fps: 6 },
        }],
        shots: [{ id: "t1", autoDuration: true, durationSec: 4, holdSec: 0,
          motionMode: "preset", preset: { kind: "fixed", cx: 0.5, cy: 0.5, w: 1, distance: 0 },
          from: { cx: 0.5, cy: 0.5, w: 1 }, to: { cx: 0.5, cy: 0.5, w: 1 },
          transition: "cut", transitionDur: 0, dialogues: [], sfx: [], overlays: [],
          audioOverrides: [], vfx: [], usarVfxEscena: true, omitirVfxEscena: [] }],
        vfx: [],
      }],
    });
    const sc = p.scenes[0];
    expect(sc.medio).toBe("paralaje");
    expect(sc.camara).toHaveLength(1);
    expect(sc.loop?.imageIds).toEqual(["img-1", "img-2"]);
    expect(sc.capas?.[0].mov).toEqual({ tipo: "deriva", vx: 0.01 });
    expect(sc.capas?.[0].spr).toEqual({ fotogramas: 4, fps: 8 });
    expect(sc.capas?.[0].loop?.imageIds).toEqual(["capa-1", "capa-1b"]);
    expect(p.paleta?.paralaje).toBe(true);
    expect(p.paleta?.apng).toBe(true);
  });

  it("projectAssets incluye fotogramas de loop y láminas", () => {
    const p = migrateProject({
      scenes: [{
        id: "s1", imageId: "img-1", imgW: 16, imgH: 9,
        loop: { imageIds: ["img-1", "img-2"], fps: 6 },
        capas: [{ id: "c1", imageId: "capa-1", nombre: "a", depth: 0, escala: 1, opacidad: 1,
          loop: { imageIds: ["capa-1", "capa-x"], fps: 4 } }],
        shots: [], vfx: [],
      }],
    });
    const ids = projectAssets(p);
    expect(ids).toEqual(expect.arrayContaining(["img-1", "img-2", "capa-1", "capa-x"]));
  });

  it("el plan de la escena sobrevive al recargar", () => {
    const p = migrateProject({
      paleta: { apng: true, sprites: true },
      scenes: [{
        id: "s1", imageId: "img-1", imgW: 16, imgH: 9, medio: "apng", shots: [], vfx: [],
        plan: {
          viva: {
            tecnica: "sprites",
            elementos: [{
              que: "a seagull", x: 0.2, y: 0.3, alto: 0.1, fotogramas: 6, fps: 10,
              vista: "lateral", direccion: "derecha", accion: "volar", anclaje: "centro",
            }],
          },
        },
      }],
    });
    expect(p.scenes[0].plan?.viva?.tecnica).toBe("sprites");
    expect(p.scenes[0].plan?.viva?.elementos).toHaveLength(1);
  });

  it("sin sprites en la paleta, un plan de sprites guardado NO revive", () => {
    const p = migrateProject({
      paleta: { apng: true, sprites: false },
      scenes: [{
        id: "s1", imageId: "img-1", imgW: 16, imgH: 9, medio: "apng", shots: [], vfx: [],
        plan: { viva: { tecnica: "sprites", elementos: [{ que: "a seagull" }] } },
      }],
    });
    expect(p.scenes[0].plan?.viva?.tecnica).toBe("cuadros");
    expect(p.scenes[0].plan?.viva?.elementos).toEqual([]);
  });

  it("una escena sin plan no se inventa uno al abrirla", () => {
    const p = migrateProject({
      scenes: [{
        id: "s1", imageId: "img-1", imgW: 16, imgH: 9, medio: "apng",
        loop: { imageIds: ["img-1", "img-2", "img-3"], fps: 9 },
        shots: [], vfx: [],
      }],
    });
    expect(p.scenes[0].plan).toBeUndefined();
  });
});
