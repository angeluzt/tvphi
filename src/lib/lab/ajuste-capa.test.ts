import { describe, expect, it } from "vitest";
import {
  ajusteNeutro, anclaAjuste, conAjuste, desplazarAjuste, esAjusteNeutro, estaColocadaAMano,
  holguraDelAjuste, necesitaTransformar, normalizarAjuste, planoAjustado,
} from "./ajuste-capa";
import { planoCentrado } from "./plano-movimiento";

const plano = () => planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 1 });

describe("colocar una capa a mano", () => {
  it("desplaza en fracción del plano, así que el zoom no despega la pieza", () => {
    const a = conAjuste(undefined, { dx: 0.25, dy: -0.1 });
    const normal = planoAjustado(planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 1 }), a);
    const zoom = planoAjustado(planoCentrado({ lienzoW: 1000, lienzoH: 500, escala: 2 }), a);
    expect(normal.x0).toBe(250);
    expect(normal.y0).toBe(-50);
    // Con el plano al doble, el mismo cuarto de plano son 500 px: la pieza
    // sigue cayendo sobre el mismo punto del decorado.
    expect(zoom.x0).toBe(-500 + 500);
  });

  it("ancla el giro en el centro de la pieza, no en el del lienzo", () => {
    const a = conAjuste(undefined, { pivoteX: 0.9, pivoteY: 0.25 });
    const p = anclaAjuste(plano(), a);
    expect(p.x).toBe(900);
    expect(p.y).toBe(125);
  });

  it("mueve el ancla junto con la pieza al empujarla", () => {
    const a = desplazarAjuste(conAjuste(undefined, { pivoteX: 0.9, pivoteY: 0.5 }), 0.1, 0);
    const p = anclaAjuste(planoAjustado(plano(), a), a);
    expect(p.x).toBe(1000); // 900 + 0,1 × 1000
  });

  it("acumula empujones en vez de saltar a donde caiga el dedo", () => {
    let a = desplazarAjuste(undefined, 0.02, 0);
    a = desplazarAjuste(a, 0.03, -0.01);
    expect(a.dx).toBeCloseTo(0.05, 6);
    expect(a.dy).toBeCloseTo(-0.01, 6);
  });

  it("conserva giro y pivote al empujar", () => {
    const base = conAjuste(undefined, { giro: 30, pivoteX: 0.8, escala: 1.5 });
    const a = desplazarAjuste(base, 0.1, 0.1);
    expect(a.giro).toBe(30);
    expect(a.pivoteX).toBe(0.8);
    expect(a.escala).toBe(1.5);
  });

  it("no guarda un ajuste que no hace nada", () => {
    expect(esAjusteNeutro(ajusteNeutro())).toBe(true);
    expect(normalizarAjuste(ajusteNeutro())).toBeUndefined();
    expect(normalizarAjuste(undefined)).toBeUndefined();
    expect(normalizarAjuste({ dx: 0.2 })?.dx).toBe(0.2);
  });

  it("guarda el pivote aunque la pieza todavía no se haya tocado", () => {
    // Si esto se diera por neutro, al reabrir el proyecto la pieza giraría
    // alrededor del centro del lienzo en vez de por donde está.
    const recienSeparada = { dx: 0, dy: 0, giro: 0, escala: 1, pivoteX: 0.87, pivoteY: 0.31 };
    expect(esAjusteNeutro(recienSeparada)).toBe(false);
    expect(normalizarAjuste(recienSeparada)).toEqual(recienSeparada);
  });

  it("acota lo que venga de fuera y descarta la basura", () => {
    const a = normalizarAjuste({ dx: 99, giro: -900, escala: 0, pivoteY: "x" })!;
    expect(a.dx).toBe(2);
    expect(a.giro).toBe(-180);
    expect(a.escala).toBe(0.1);
    expect(a.pivoteY).toBe(0.5);
    expect(normalizarAjuste("nada")).toBeUndefined();
    expect(normalizarAjuste({ dx: Number.NaN })).toBeUndefined();
  });

  it("solo pide transformar el contexto cuando hay giro o tamaño", () => {
    expect(necesitaTransformar(undefined)).toBe(false);
    expect(necesitaTransformar(conAjuste(undefined, { dx: 0.5 }))).toBe(false);
    expect(necesitaTransformar(conAjuste(undefined, { giro: 5 }))).toBe(true);
    expect(necesitaTransformar(conAjuste(undefined, { escala: 1.2 }))).toBe(true);
  });

  it("mide cuánto hay que agrandar el fondo para no enseñar el negro", () => {
    expect(holguraDelAjuste(undefined)).toBe(0);
    expect(holguraDelAjuste(conAjuste(undefined, { dx: -0.3, dy: 0.1 }))).toBeCloseTo(0.3, 6);
  });

  it("deja el plano igual cuando no hay nada que desplazar", () => {
    const p = plano();
    expect(planoAjustado(p, undefined)).toBe(p);
    expect(planoAjustado(p, conAjuste(undefined, { giro: 20 }))).toBe(p);
  });
});

describe("distinguir una pieza colocada de una recién separada", () => {
  it("no da por movida una pieza que solo trae su pivote", () => {
    // Al separar una capa, cada trozo nace con su centro apuntado y sin tocar.
    const recienSeparada = conAjuste(undefined, { pivoteX: 0.75, pivoteY: 0.55 });
    expect(estaColocadaAMano(recienSeparada)).toBe(false);
    expect(esAjusteNeutro(recienSeparada)).toBe(false);
  });

  it("da por movida la que se ha empujado, girado o encogido", () => {
    expect(estaColocadaAMano(undefined)).toBe(false);
    expect(estaColocadaAMano(conAjuste(undefined, { dx: 0.02 }))).toBe(true);
    expect(estaColocadaAMano(conAjuste(undefined, { giro: -5 }))).toBe(true);
    expect(estaColocadaAMano(conAjuste(undefined, { escala: 0.9 }))).toBe(true);
  });
});
