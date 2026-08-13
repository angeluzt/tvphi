import { describe, it, expect } from "vitest";
import {
  pendientesDe, hechasVigentes, paraRehacer, textoDelBoton, avisoDeReanudar,
} from "./reanudar-capas";

// Lo que pasaba: al reintentar se repintaban TODAS las capas y se volvían a
// pagar las que ya habían salido bien. Con cinco capas en calidad alta, donde
// algo falla a menudo, eso es tirar la mitad del dinero en cada intento.

const capas = [
  { id: "fondo", name: "01 Fondo" },
  { id: "medio", name: "02 Medio" },
  { id: "calle", name: "03 Calle" },
  { id: "faroles", name: "04 Faroles" },
  { id: "ramas", name: "05 Ramas" },
];

describe("qué falta por dibujar", () => {
  it("sin nada hecho, todas", () => {
    expect(pendientesDe(capas, []).map((c) => c.id)).toEqual(
      ["fondo", "medio", "calle", "faroles", "ramas"]);
  });

  it("salta las que ya están y conserva el orden", () => {
    const hechas = [{ id: "fondo" }, { id: "calle" }];
    expect(pendientesDe(capas, hechas).map((c) => c.id)).toEqual(["medio", "faroles", "ramas"]);
  });

  it("con todas hechas, ninguna", () => {
    expect(pendientesDe(capas, capas.map((c) => ({ id: c.id })))).toEqual([]);
  });

  it("compara por id, NO por posición", () => {
    // Entre un intento y otro se puede haber añadido una capa al principio. Con
    // el índice, todas las siguientes se darían por hechas con el dibujo de la
    // de al lado, que es un fallo silencioso y carísimo de encontrar.
    const conNueva = [{ id: "nube", name: "00 Nube" }, ...capas];
    expect(pendientesDe(conNueva, [{ id: "fondo" }]).map((c) => c.id)).toEqual(
      ["nube", "medio", "calle", "faroles", "ramas"]);
  });
});

describe("hechas que ya no valen", () => {
  it("una capa borrada del mapa se cae del registro", () => {
    // Si se quedara, el montaje llevaría una capa que el mapa no conoce y
    // además contaría como hecha para siempre.
    const hechas = [{ id: "fondo" }, { id: "borrada" }];
    expect(hechasVigentes(hechas, capas).map((h) => h.id)).toEqual(["fondo"]);
  });

  it("si el mapa se cambió entero, no queda nada", () => {
    expect(hechasVigentes([{ id: "a" }, { id: "b" }], capas)).toEqual([]);
  });

  it("lo que sigue existiendo se conserva tal cual", () => {
    const hechas = [{ id: "fondo", url: "blob:1" }];
    expect(hechasVigentes(hechas, capas)).toEqual(hechas);
  });
});

describe("rehacer una sola", () => {
  it("la quita del registro y vuelve a estar pendiente", () => {
    const hechas = [{ id: "fondo" }, { id: "medio" }];
    const tras = paraRehacer(hechas, "fondo");
    expect(tras.map((h) => h.id)).toEqual(["medio"]);
    expect(pendientesDe(capas, tras).map((c) => c.id)).toContain("fondo");
  });

  it("quitar una que no está no rompe nada", () => {
    expect(paraRehacer([{ id: "a" }], "z").map((h) => h.id)).toEqual(["a"]);
  });
});

describe("lo que dice el botón", () => {
  it("dice cuántas imágenes va a costar, no «reintentar»", () => {
    // La pregunta antes de pulsar es «¿esto me cobra cinco o una?».
    expect(textoDelBoton(5, 5)).toBe("2 · Generar y montar todo · 5 imágenes");
    expect(textoDelBoton(2, 5)).toBe("2 · Continuar: faltan 2 de 5");
  });

  it("cuando ya están todas, no ofrece pagar de nuevo", () => {
    expect(textoDelBoton(0, 5)).toBe("2 · Montar (ya están todas dibujadas)");
  });

  it("sin mapa todavía, el texto de siempre", () => {
    expect(textoDelBoton(0, 0)).toBe("2 · Generar y montar todo");
  });
});

describe("el aviso de lo que se conserva", () => {
  it("dice qué se guarda y qué se paga", () => {
    expect(avisoDeReanudar(2, 5)).toContain("3 capas ya dibujadas se conservan");
    expect(avisoDeReanudar(2, 5)).toContain("generan las 2 que faltan");
  });

  it("en singular no chirría", () => {
    const t = avisoDeReanudar(1, 2)!;
    expect(t).toContain("1 capa ya dibujada se conserva");
    expect(t).toContain("genera la que falta");
  });

  it("no aparece si no hay nada que conservar ni nada que hacer", () => {
    expect(avisoDeReanudar(5, 5)).toBeNull();
    expect(avisoDeReanudar(0, 5)).toBeNull();
  });
});
