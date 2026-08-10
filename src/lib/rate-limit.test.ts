import { beforeEach, describe, expect, it } from "vitest";
import { olvidarTodo, pasarse, origen } from "./rate-limit";

describe("rate-limit en memoria", () => {
  beforeEach(() => olvidarTodo());

  it("deja pasar bajo el tope", () => {
    expect(pasarse("t:a", 3, 60_000)).toBe(false);
    expect(pasarse("t:a", 3, 60_000)).toBe(false);
    expect(pasarse("t:a", 3, 60_000)).toBe(false);
  });

  it("bloquea al superar el tope", () => {
    for (let i = 0; i < 3; i++) pasarse("t:b", 3, 60_000);
    expect(pasarse("t:b", 3, 60_000)).toBe(true);
  });

  it("aísla claves distintas", () => {
    for (let i = 0; i < 3; i++) pasarse("t:c", 3, 60_000);
    expect(pasarse("t:d", 3, 60_000)).toBe(false);
  });

  it("origen usa la primera IP de x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(origen(req)).toBe("1.2.3.4");
  });
});
