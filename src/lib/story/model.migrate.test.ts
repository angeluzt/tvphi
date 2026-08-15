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
});
