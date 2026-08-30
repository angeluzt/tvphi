import { describe, expect, it } from "vitest";
import { escenasPendientes, imagenesPendientes } from "./montar-medios";
import type { StoryScene } from "./model";
import { FOTOS_LOOP_DEFECTO } from "./medio";

const escena = (p: Partial<StoryScene>): StoryScene => ({
  id: "s1", imageId: "img-1", imgW: 1536, imgH: 1024, shots: [], vfx: [], ...p,
});

describe("escenasPendientes", () => {
  it("las planas nunca están pendientes", () => {
    expect(escenasPendientes([escena({ medio: "still" }), escena({ id: "s2" })])).toEqual([]);
  });

  it("una foto viva marcada y sin montar sí lo está", () => {
    const s = escena({ medio: "apng" });
    expect(escenasPendientes([s])).toEqual([s]);
  });

  it("lo que YA está montado no se vuelve a tocar", () => {
    expect(escenasPendientes([
      escena({ medio: "apng", loop: { imageIds: ["a", "b"], fps: 6 } }),
      escena({ id: "s2", medio: "paralaje", capas: [{ id: "c", imageId: "i", nombre: "n", depth: 0, escala: 1, opacidad: 1 }] }),
    ])).toEqual([]);
  });

  it("sin imagen dibujada no hay de dónde partir", () => {
    expect(escenasPendientes([escena({ medio: "apng", imageId: "" })])).toEqual([]);
  });
});

describe("imagenesPendientes", () => {
  it("no vuelve a contar la foto que ya está dibujada", () => {
    const total = imagenesPendientes([
      escena({ medio: "apng", plan: { viva: { tecnica: "cuadros", fotogramas: 6, fps: 6, elementos: [] } } }),
    ]);
    expect(total).toBe(5);
  });

  it("la técnica de sprites sale mucho más barata", () => {
    const conSprites = imagenesPendientes([
      escena({
        medio: "apng",
        plan: {
          viva: {
            tecnica: "sprites", fotogramas: 6, fps: 8,
            elementos: [{
              que: "a bird", x: 0.5, y: 0.5, alto: 0.1, fotogramas: 6, fps: 10,
              vista: "lateral", direccion: "derecha", accion: "volar", anclaje: "centro",
            }],
          },
        },
      }),
    ]);
    expect(conSprites).toBe(1);
  });

  it("suma láminas y láminas vivas del paralaje", () => {
    expect(imagenesPendientes([
      escena({ medio: "paralaje", plan: { paralaje: { capas: 4, vivas: ["agua"], sprites: false } } }),
    ])).toBe(4 + (FOTOS_LOOP_DEFECTO - 1));
  });

  it("un capítulo ya montado no pide nada", () => {
    expect(imagenesPendientes([escena({ medio: "apng", loop: { imageIds: ["a", "b"], fps: 6 } })])).toBe(0);
  });
});
