import { describe, expect, it } from "vitest";
import type { SpriteMeta } from "./biblioteca";
import type { Escena } from "./escena";
import { leerSpritesPlaneados } from "./plan-escena-viva";

const escena: Escena = {
  scene: { id: "taller", title: "Taller", width: 1536, height: 1024 },
  layers: [
    { id: "fondo", name: "01 Fondo", depth: 0.05, objects: [{ id: "cielo", shape: "rect", semantic: "sky", x: 0, y: 0, w: 1, h: 1 }] },
    { id: "medio", name: "02 Taller", depth: 0.48, objects: [{ id: "piso", shape: "rect", semantic: "floor", x: 0, y: 0.6, w: 1, h: 0.4 }] },
    { id: "frente", name: "03 Tuberías", depth: 0.92, objects: [{ id: "tubo", shape: "line", semantic: "prop", x1: 0, y1: 0, x2: 1, y2: 1 }] },
    { id: "reservas", name: "04 Reservas", depth: 0.95, guia: true, objects: [{ id: "actor", shape: "rect", semantic: "subject", x: 0.2, y: 0.5, w: 0.2, h: 0.3 }] },
  ],
};

const raton: SpriteMeta = {
  id: "lib-raton",
  nombre: "raton-mecanico",
  que: "small clockwork rat, strict side view",
  fotogramas: 3,
  fps: 9,
  ancho: 120,
  alto: 90,
  bytes: 1234,
  creadoEn: "2026-08-08T00:00:00.000Z",
  vista: "lateral",
  direccion: "izquierda",
  accion: "caminar",
  anclaje: "pies",
};

describe("director de sprites", () => {
  it("reutiliza el id exacto y conserva la ruta del plan", () => {
    const plan = leerSpritesPlaneados({ sprites: [{
      id: "raton",
      nombre: "Ratón nuevo",
      bibliotecaId: raton.id,
      despuesDe: "medio",
      depth: 0.6,
      x: -0.1,
      y: 0.72,
      alto: 0.16,
      espacio: "pantalla",
      fotogramas: 12,
      fps: 30,
      ruta: { pasos: [
        { tipo: "mover", x: 0.8, y: 0.72, segundos: 3 },
        { tipo: "pausa", segundos: 1 },
        { tipo: "voltear", segundos: 0.1 },
      ] },
    }] }, escena, [raton]);

    expect(plan.avisos.join(" ")).toContain("se fijó a su superficie");
    expect(plan.sprites).toHaveLength(1);
    expect(plan.sprites[0]).toMatchObject({
      nombre: raton.nombre,
      despuesDe: "medio",
      depth: 0.48,
      biblioteca: raton,
      spr: { id: raton.id, fotogramas: 3, fps: 9, espacio: "capa" },
    });
    expect(plan.sprites[0].spr.ruta?.pasos.map((p) => p.tipo))
      .toEqual(["mover", "pausa", "voltear"]);
    expect(plan.sprites[0].spr).toMatchObject({
      direccionBase: "izquierda", accion: "caminar", anclaje: "pies", y: 0.6,
    });
    expect(plan.sprites[0].spr.ruta?.pasos[0]).toMatchObject({ y: 0.6, espejo: true });
  });

  it("convierte una referencia inexistente en generación y acota valores peligrosos", () => {
    const ruta = Array.from({ length: 30 }, (_, i) => ({
      tipo: "mover",
      x: i % 2 ? -8 : 8,
      y: i % 2 ? 9 : -9,
      segundos: 0,
    }));
    const plan = leerSpritesPlaneados({ sprites: [{
      id: "meteoro",
      nombre: "Meteorito",
      bibliotecaId: "borrado",
      que: "glowing meteor",
      vista: "libre",
      forma: "columna",
      despuesDe: "capa-que-no-existe",
      depth: 99,
      x: -9,
      y: 9,
      alto: 12,
      fotogramas: 80,
      fps: 500,
      ruta: { bucle: true, pasos: ruta },
    }] }, escena, []);

    expect(plan.avisos.join(" ")).toContain("ya no está");
    expect(plan.avisos.join(" ")).toContain("capa indicada no existe");
    expect(plan.sprites[0].biblioteca).toBeUndefined();
    expect(plan.sprites[0]).toMatchObject({ vista: "libre", forma: "columna", depth: 1, despuesDe: "frente" });
    expect(plan.sprites[0].spr).toMatchObject({
      fotogramas: 12,
      fps: 60,
      x: -0.5,
      y: 1.5,
      alto: 2,
      espacio: "pantalla",
    });
    expect(plan.sprites[0].spr.ruta?.pasos).toHaveLength(24);
    expect(plan.sprites[0].spr.ruta?.pasos[0]).toMatchObject({ x: 1.5, y: -0.5, segundos: 0.1 });
  });

  it("limita el costo a seis actores y hace únicos los ids repetidos", () => {
    const plan = leerSpritesPlaneados({
      sprites: Array.from({ length: 8 }, () => ({ id: "ave", nombre: "Ave", despuesDe: "medio" })),
    }, escena, []);

    expect(plan.sprites).toHaveLength(6);
    expect(new Set(plan.sprites.map((s) => s.id)).size).toBe(6);
    expect(plan.avisos[0]).toContain("primeros 6");
  });
});
