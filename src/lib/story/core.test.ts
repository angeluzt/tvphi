import { describe, expect, it } from "vitest";
import { desenrollarEntradaMapa, revisar } from "@/lib/lab/escena";
import { cn, jsonSafe } from "@/lib/utils";

describe("utils", () => {
  it("cn fusiona clases", () => {
    expect(cn("px-2", "px-4")).toContain("px-4");
  });

  it("jsonSafe convierte BigInt", () => {
    expect(jsonSafe({ n: 10n })).toEqual({ n: 10 });
  });
});

describe("desenrollarEntradaMapa", () => {
  it("devuelve el objeto si ya es un mapa", () => {
    const mapa = { scene: { id: "a" }, layers: [] };
    expect(desenrollarEntradaMapa(mapa)).toBe(mapa);
  });

  it("extrae .escena de un montaje.json", () => {
    const mapa = { scene: { id: "a", width: 16, height: 9 }, layers: [{ id: "1" }] };
    expect(desenrollarEntradaMapa({ version: 2, capas: [], escena: mapa })).toEqual(mapa);
  });
});

describe("revisar historiarutas story save schema shape", () => {
  it("rechaza basura", () => {
    const r = revisar({ foo: 1 });
    expect("error" in r).toBe(true);
  });
});
