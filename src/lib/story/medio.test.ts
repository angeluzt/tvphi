import { describe, expect, it } from "vitest";
import { idLoopEn, indiceLoop, medioDe, normalizarLoop } from "./medio";

describe("normalizarLoop", () => {
  it("rechaza un solo fotograma", () => {
    expect(normalizarLoop({ imageIds: ["a"], fps: 6 })).toBeUndefined();
  });

  it("acota fps y recorta ids", () => {
    const l = normalizarLoop({ imageIds: ["a", "b", "c"], fps: 99 });
    expect(l?.fps).toBe(30);
    expect(l?.imageIds).toEqual(["a", "b", "c"]);
  });
});

describe("indiceLoop", () => {
  const loop = { imageIds: ["a", "b", "c", "d"], fps: 2 };
  it("avanza y da la vuelta", () => {
    expect(indiceLoop(loop, 0)).toBe(0);
    expect(indiceLoop(loop, 0.6)).toBe(1);
    expect(indiceLoop(loop, 2)).toBe(0);
  });
});

describe("idLoopEn", () => {
  it("cae al respaldo si no hay loop", () => {
    expect(idLoopEn(undefined, 1, "still")).toBe("still");
  });
});

describe("medioDe", () => {
  it("las capas mandan sobre lo declarado", () => {
    expect(medioDe({ medio: "still", capas: [{ loop: undefined }] })).toBe("paralaje");
    expect(medioDe({ medio: "still", loop: { imageIds: ["a", "b"], fps: 6 } })).toBe("apng");
    expect(medioDe({ medio: "apng" })).toBe("still");
    expect(medioDe({})).toBe("still");
  });
});
