import { describe, expect, it } from "vitest";
import { promptFotograma } from "./prompt-fotograma";

describe("promptFotograma", () => {
  it("pide una sola foto entera y prohíbe la rejilla", () => {
    const t = promptFotograma({ escena: "a dock at night" });
    expect(t).toMatch(/ONE complete picture/i);
    expect(t).toMatch(/sprite sheet/i);
    expect(t).toMatch(/2x2/i);
    expect(t).not.toMatch(/frame N of a short looping animation/i);
  });

  it("mete el movimiento concreto si lo hay", () => {
    const t = promptFotograma({ escena: "dock", movimiento: "the water at the shore" });
    expect(t).toMatch(/the water at the shore/);
  });
});
