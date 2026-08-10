import { describe, it, expect } from "vitest";
import { mensajeLegible } from "./pedir-json";

// «Failed to fetch» es lo que enseñaba el taller de sprites cada vez que se
// creaba un sprite. Ni decía qué pasó ni qué hacer, y encima suena a que el
// servidor falló cuando en ese caso concreto ni se llegaba a llamar: era un
// `fetch()` sobre un data: URL grande, que Chromium rechaza sin mandar nada.
//
// La causa está arreglada. Esto es la red de seguridad: aunque se escape otro,
// el usuario no lee jerga del navegador.

describe("mensajeLegible", () => {
  it("traduce «Failed to fetch»", () => {
    expect(mensajeLegible(new Error("Failed to fetch"))).toMatch(/conectar con el servidor/i);
    expect(mensajeLegible(new Error("TypeError: Failed to fetch"))).toMatch(/conectar con el servidor/i);
    expect(mensajeLegible(new Error("failed to fetch"))).toMatch(/conectar con el servidor/i);
  });

  it("traduce las cancelaciones", () => {
    expect(mensajeLegible(new Error("AbortError: signal is aborted"))).toMatch(/canceló/i);
  });

  it("NO toca los mensajes que sí explican algo", () => {
    // Los del servidor son los buenos: son los que dicen qué pasó de verdad.
    const bueno = "Se acabaron tus 3 imágenes con IA de hoy. Vuelve mañana.";
    expect(mensajeLegible(new Error(bueno))).toBe(bueno);
  });

  it("no confunde un mensaje que solo MENCIONA fetch", () => {
    const m = "No se pudo leer la imagen (500).";
    expect(mensajeLegible(new Error(m))).toBe(m);
  });

  it("da algo útil si no hay mensaje", () => {
    expect(mensajeLegible(new Error(""))).toMatch(/no se pudo/i);
    expect(mensajeLegible(null)).toMatch(/no se pudo/i);
    expect(mensajeLegible(undefined, "Vaya.")).toBe("Vaya.");
  });
});
