import { describe, expect, it } from "vitest";
import { pngBase64ABlob } from "./png-base64";

// PNG 1×1 transparente mínimo.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("pngBase64ABlob", () => {
  it("converte base64 a Blob PNG sin fetch(data:)", async () => {
    const blob = pngBase64ABlob(PNG_1X1);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(20);
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 4);
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("tolera prefijo data:url", async () => {
    const blob = pngBase64ABlob(`data:image/png;base64,${PNG_1X1}`);
    expect(blob.size).toBeGreaterThan(20);
  });
});
