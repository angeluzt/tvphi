import { describe, expect, it } from "vitest";
import { armarApng, leerPng } from "./apng";

// PNG 1×1 transparente mínimo (el mismo de png-base64.test).
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function bytesPng(): Uint8Array {
  const bin = atob(PNG_1X1);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

describe("leerPng / armarApng", () => {
  it("lee IHDR y IDAT de un PNG mínimo", () => {
    const p = leerPng(bytesPng());
    expect(p.ancho).toBe(1);
    expect(p.alto).toBe(1);
    expect(p.idat.length).toBeGreaterThan(0);
  });

  it("arma un APNG de dos cuadros con firma PNG y acTL", () => {
    const f = leerPng(bytesPng());
    const out = armarApng([f, f], 6, true);
    expect([...out.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const txt = new TextDecoder().decode(out);
    expect(txt).toContain("acTL");
    expect(txt).toContain("fcTL");
    expect(txt).toContain("fdAT");
  });

  it("no arma con un solo fotograma", () => {
    const f = leerPng(bytesPng());
    expect(() => armarApng([f], 6)).toThrow(/dos fotogramas/);
  });
});
