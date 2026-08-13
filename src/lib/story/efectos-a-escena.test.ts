import { describe, expect, it } from "vitest";
import { aCapaVfx, capasVfxDeLaIa, efectoSigueALaImagen } from "./efectos-a-escena";
import type { EfectoEscena } from "@/lib/lab/efectos-escena";

const base: EfectoEscena = {
  id: "e1", kind: "fuego", shape: "punto", espacio: "imagen",
  x: 0.4, y: 0.7, x2: 0, y2: 0, depth: 0.5,
  colorHex: "#ff8800", params: { escala: 0.4 },
};

describe("los efectos de la IA, guardados en la escena", () => {
  it("lo que va en un sitio se mide sobre la imagen", () => {
    // La IA sitúa sobre la imagen entera; guardarlo como «encuadre» movería el
    // efecto en cuanto alguien recortara la toma.
    expect(aCapaVfx(base).espacio).toBe("imagen");
  });

  it("lo que cae del cielo se mide sobre el encuadre", () => {
    // La lluvia moja lo que se ve, no un trozo concreto de la foto.
    expect(aCapaVfx({ ...base, kind: "lluvia", shape: "arriba" }).espacio).toBe("encuadre");
  });

  it("un punto repite su sitio en el segundo extremo", () => {
    const c = aCapaVfx(base);
    expect(c.nodes).toEqual([{ x: 0.4, y: 0.7, x2: 0.4, y2: 0.7 }]);
  });

  it("una línea conserva sus dos extremos", () => {
    const c = aCapaVfx({ ...base, kind: "electricidad", shape: "linea", x: 0.1, y: 0.2, x2: 0.9, y2: 0.3 });
    expect(c.nodes[0]).toEqual({ x: 0.1, y: 0.2, x2: 0.9, y2: 0.3 });
  });

  it("ancla lo que está en un sitio y suelta lo que cae sobre todo el cuadro", () => {
    // Una hoguera se queda flotando si no sigue a la imagen; la lluvia, al
    // revés, viajaría pegada a un trozo de foto.
    expect(efectoSigueALaImagen("fuego", "punto")).toBe(true);
    expect(efectoSigueALaImagen("lluvia", "arriba")).toBe(false);
    expect(efectoSigueALaImagen("nieve", "punto")).toBe(false);
    expect(aCapaVfx(base).follow).toBe(true);
    expect(aCapaVfx({ ...base, kind: "lluvia", shape: "arriba" }).follow).toBe(false);
  });

  it("no los marca «de serie»: los colocó la IA mirando el mapa", () => {
    // Con `auto` en true, añadir uno a mano borraría estos.
    expect(aCapaVfx(base).auto).toBe(false);
  });

  it("dura toda la toma y conserva color y ajustes", () => {
    const c = aCapaVfx(base);
    expect(c.timing).toBe("all");
    expect(c.colorHex).toBe("#ff8800");
    expect(c.params).toEqual({ escala: 0.4 });
    // Copia, no la misma referencia: tocar la escena no debe tocar el original.
    expect(c.params).not.toBe(base.params);
  });

  it("acota sitios imposibles en vez de sacarlos del mundo", () => {
    const c = aCapaVfx({ ...base, x: 9, y: -8 });
    expect(c.nodes[0].x).toBe(1.5);
    expect(c.nodes[0].y).toBe(-0.5);
    expect(aCapaVfx({ ...base, x: Number.NaN }).nodes[0].x).toBe(0.5);
  });

  it("uno ilegible no se lleva por delante a los demás", () => {
    const lista = capasVfxDeLaIa([base, null, { kind: "humo" }, "nada", { ...base, id: "e2" }]);
    expect(lista.map((c) => c.id)).toEqual(["e1", "e2"]);
  });

  it("sin efectos, lista vacía", () => {
    expect(capasVfxDeLaIa(undefined)).toEqual([]);
    expect(capasVfxDeLaIa("no es una lista")).toEqual([]);
  });
});
