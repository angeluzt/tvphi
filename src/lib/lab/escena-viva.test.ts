import { describe, expect, it } from "vitest";
import { pasoPorDefecto } from "./anim-paralaje";
import {
  duracionTramos, escenaEstaViva, planDeEscena, vistaEnTiempo, vistaQuieta,
} from "./escena-viva";

const capas = [
  { id: "a", depth: 0 },
  { id: "b", depth: 0.5 },
  { id: "c", depth: 1 },
];

const cola = (...pasos: Parameters<typeof pasoPorDefecto>[0][]) =>
  pasos.map((p, i) => pasoPorDefecto({ ...p, id: `p${i}` }));

describe("cuándo una escena necesita el dibujante del laboratorio", () => {
  it("no lo necesita si solo son láminas quietas con profundidad", () => {
    // Este es el caso de todo lo que ya está guardado: se queda como estaba.
    expect(escenaEstaViva([{ }, { }], undefined)).toBe(false);
    expect(escenaEstaViva([], [])).toBe(false);
    expect(escenaEstaViva(undefined, undefined)).toBe(false);
  });

  it("lo necesita en cuanto hay cola de cámara", () => {
    expect(escenaEstaViva([{}], [{ mov: "acercar" }])).toBe(true);
  });

  it("lo necesita si alguna lámina se mueve o es un actor", () => {
    expect(escenaEstaViva([{}, { mov: { tipo: "deriva" } }], undefined)).toBe(true);
    expect(escenaEstaViva([{ spr: { fotogramas: 4 } }], undefined)).toBe(true);
  });
});

describe("la cámara de la cola en un instante", () => {
  it("sin cola, se queda quieta", () => {
    const v = vistaEnTiempo([], 1234, capas);
    expect(v.ox).toBe(0);
    expect(v.oy).toBe(0);
    expect(v.zoom).toBe(1);
  });

  it("la escena quieta no altera ninguna lámina", () => {
    const v = vistaQuieta();
    expect(v.zoomCapa(0)).toBeCloseTo(v.zoomCapa(1), 6);
    expect(v.alphaCapa(0.5, "b")).toBe(1);
  });

  it("avanza a lo largo de la cola y suma las duraciones", () => {
    const tramos = planDeEscena(cola({ mov: "acercar", durMs: 2000 }, { mov: "der", durMs: 1000 }), capas);
    expect(tramos).toHaveLength(2);
    expect(duracionTramos(tramos)).toBe(3000);
  });

  it("empieza donde dice el primer paso y llega a su destino", () => {
    const tramos = planDeEscena(cola({ mov: "acercar", durMs: 2000, distancia: 60 }), capas);
    const inicio = vistaEnTiempo(tramos, 0, capas);
    const final = vistaEnTiempo(tramos, 2000, capas);
    // «Acercar» no toca el zoom plano: mueve el AVANCE, y es la perspectiva
    // la que agranda cada lámina según lo cerca que esté.
    expect(final.zoomCapa(1)).toBeGreaterThan(inicio.zoomCapa(1));
    expect(inicio.t).toBe(0);
    expect(final.fin).toBe(true);
  });

  it("pasado el final se queda en el último fotograma, no vuelve a empezar", () => {
    // Una toma puede durar más que su animación; repetirla daría un tirón cada
    // pocos segundos que nadie ha pedido.
    const tramos = planDeEscena(cola({ mov: "acercar", durMs: 1000 }), capas);
    const alFinal = vistaEnTiempo(tramos, 1000, capas);
    const mucho = vistaEnTiempo(tramos, 60_000, capas);
    expect(mucho.zoom).toBeCloseTo(alFinal.zoom, 6);
    expect(mucho.ox).toBeCloseTo(alFinal.ox, 6);
  });

  it("un tiempo negativo no rompe: se trata como el principio", () => {
    const tramos = planDeEscena(cola({ mov: "der", durMs: 1000 }), capas);
    expect(vistaEnTiempo(tramos, -500, capas).t).toBe(0);
  });

  it("mueve más el primer plano que el fondo: eso es el paralaje", () => {
    const tramos = planDeEscena(cola({ mov: "der", durMs: 2000, distancia: 80 }), capas);
    const v = vistaEnTiempo(tramos, 1000, capas);
    // panCapa crece con la profundidad; el fondo (0) apenas se entera.
    expect(Math.abs(v.panCapa(1))).toBeGreaterThan(Math.abs(v.panCapa(0)));
  });

  it("sin pasos no planifica nada", () => {
    expect(planDeEscena([], capas)).toEqual([]);
    expect(duracionTramos([])).toBe(0);
  });
});
