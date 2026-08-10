import { describe, expect, it } from "vitest";
import { bytesJson, cuerpoDemasiadoGrande, MAX_BYTES_JSON_CAPITULO } from "./limites";

describe("limites de historia", () => {
  it("mide JSON en bytes UTF-8", () => {
    expect(bytesJson({ a: "ñ" })).toBeGreaterThan(4);
  });

  it("el tope de capítulo es positivo y acotado", () => {
    expect(MAX_BYTES_JSON_CAPITULO).toBeGreaterThan(100_000);
    expect(MAX_BYTES_JSON_CAPITULO).toBeLessThan(10_000_000);
  });

  it("cuerpoDemasiadoGrande respeta Content-Length", () => {
    const ok = new Request("http://x", { headers: { "content-length": "100" } });
    expect(cuerpoDemasiadoGrande(ok, 1000)).toBeNull();
    const grande = new Request("http://x", { headers: { "content-length": "9999999" } });
    expect(cuerpoDemasiadoGrande(grande, 1000)).toMatch(/demasiado/i);
  });

  it("sin Content-Length no rechaza", () => {
    expect(cuerpoDemasiadoGrande(new Request("http://x"))).toBeNull();
  });
});
