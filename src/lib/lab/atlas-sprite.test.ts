import { describe, expect, it } from "vitest";
import { normalizarMarcosAtlas, reservarMarcoAtlas } from "./atlas-sprite";
describe("atlas de sprites", () => {
  it("salta de fila sin solapar", () => {
    const e = { ancho: 100, alto: 100, cursorX: 2, cursorY: 2, altoFila: 0 };
    const a = reservarMarcoAtlas(e, 40, 30)!, b = reservarMarcoAtlas(a.siguiente, 40, 20)!;
    const c = reservarMarcoAtlas(b.siguiente, 40, 10)!;
    expect([a.x, a.y, b.x, b.y, c.x, c.y]).toEqual([2, 2, 44, 2, 2, 34]);
  });
  it("no reduce cuadros que no caben", () => expect(reservarMarcoAtlas(
    { ancho: 64, alto: 64, cursorX: 2, cursorY: 2, altoFila: 0 }, 64, 20,
  )).toBeNull());
  it("valida metadatos exactos", () => {
    const m = [{ atlasId: "a", x: 2, y: 2, ancho: 16, alto: 20 }];
    expect(normalizarMarcosAtlas(m, 1, 16, 20)).toEqual(m);
    expect(normalizarMarcosAtlas(m, 2, 16, 20)).toBeNull();
  });
});
