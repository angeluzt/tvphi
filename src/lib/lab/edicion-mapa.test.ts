import { describe, it, expect } from "vitest";
import {
  formaNueva, anadirForma, anadirCapa, formasEnOrden, recorrerFormas,
  puestoDe, capaEditable, centroDeObjeto, nombreDe, SEMANTICAS,
} from "./edicion-mapa";
import type { Escena } from "./escena";

// El mapa se podía mover, estirar y borrar, pero no CREAR: si la IA no puso un
// arco, no había forma de añadirlo. Y para llegar a una forma concreta solo se
// podía cazarla con el dedo, que con dieciocho amontonadas es una lotería: las
// de detrás son inalcanzables porque siempre coge la de delante.

const esc = {
  scene: { id: "e", title: "E", width: 1536, height: 1024, description: "", style: "" },
  layers: [
    { id: "fondo", name: "01 Fondo", depth: 0.05, ai: { prompt: "", exclude: "" },
      objects: [{ id: "cielo", shape: "rect", semantic: "sky", x: 0, y: 0, w: 1, h: 1, label: "CIELO" }] },
    { id: "medio", name: "02 Medio", depth: 0.5, ai: { prompt: "", exclude: "" },
      objects: [
        { id: "muro", shape: "rect", semantic: "wall", x: 0.1, y: 0.5, w: 0.3, h: 0.3, label: "MURO" },
        { id: "arco", shape: "rect", semantic: "arch", x: 0.5, y: 0.4, w: 0.2, h: 0.4, label: "ARCO" },
      ] },
  ],
} as unknown as Escena;

describe("crear una forma", () => {
  it("nace grande y en el centro, para poder encontrarla", () => {
    // Una forma diminuta en un mapa lleno no se ve, y lo primero que hace
    // cualquiera es agrandarla. Es más fácil encoger que buscar.
    const o = formaNueva(esc, "arch") as any;
    expect(o.w).toBeGreaterThan(0.3);
    expect(o.x + o.w / 2).toBeCloseTo(0.5, 2);
    expect(o.y + o.h / 2).toBeCloseTo(0.5, 2);
  });

  it("su id no choca con los que ya hay", () => {
    const uno = formaNueva(esc, "arch") as any;
    const conUno = anadirForma(esc, "medio", uno);
    const dos = formaNueva(conUno, "arch") as any;
    expect(dos.id).not.toBe(uno.id);
  });

  it("la etiqueta va en mayúsculas: es lo que lee el modelo", () => {
    expect((formaNueva(esc, "vegetation") as any).label).toBe("VEGETACIÓN");
    expect((formaNueva(esc, "arch", "arco roto") as any).label).toBe("ARCO ROTO");
  });

  it("se mete en la capa que se pide y no toca las demás", () => {
    const r = anadirForma(esc, "medio", formaNueva(esc, "door"));
    expect(r.layers[1].objects).toHaveLength(3);
    expect(r.layers[0].objects).toHaveLength(1);
  });

  it("una capa que no existe deja la escena igual", () => {
    expect(anadirForma(esc, "no-existe", formaNueva(esc, "door"))).toBe(esc);
  });
});

describe("crear una capa", () => {
  it("va DELANTE, nunca detrás", () => {
    // La primera capa es el fondo, opaca y a pantalla completa: una capa nueva
    // metida ahí taparía la escena entera.
    const { escena, capaId } = anadirCapa(esc);
    expect(escena.layers[escena.layers.length - 1].id).toBe(capaId);
  });

  it("su profundidad queda entre la última y el frente", () => {
    const { escena } = anadirCapa(esc);
    const nueva = escena.layers[escena.layers.length - 1];
    expect(nueva.depth).toBeGreaterThan(0.5);
    expect(nueva.depth).toBeLessThan(1);
  });

  it("nace vacía y con id propio", () => {
    const { escena, capaId } = anadirCapa(esc);
    const nueva = escena.layers.find((c) => c.id === capaId)!;
    expect(nueva.objects).toEqual([]);
    expect(esc.layers.some((c) => c.id === capaId)).toBe(false);
  });
});

describe("recorrer las formas con los botones", () => {
  it("las lista de atrás hacia delante", () => {
    expect(formasEnOrden(esc).map((f) => f.objetoId)).toEqual(["cielo", "muro", "arco"]);
  });

  it("avanza y retrocede", () => {
    expect(recorrerFormas(esc, { capaId: "fondo", objetoId: "cielo" }, 1)?.objetoId).toBe("muro");
    expect(recorrerFormas(esc, { capaId: "medio", objetoId: "muro" }, -1)?.objetoId).toBe("cielo");
  });

  it("DA LA VUELTA en los extremos", () => {
    // Llegar al final y que el botón deje de responder se siente roto.
    expect(recorrerFormas(esc, { capaId: "medio", objetoId: "arco" }, 1)?.objetoId).toBe("cielo");
    expect(recorrerFormas(esc, { capaId: "fondo", objetoId: "cielo" }, -1)?.objetoId).toBe("arco");
  });

  it("sin nada seleccionado coge la primera, no se queda quieto", () => {
    expect(recorrerFormas(esc, null, 1)?.objetoId).toBe("cielo");
    expect(recorrerFormas(esc, null, -1)?.objetoId).toBe("arco");
  });

  it("si la selección ya no existe, empieza por el principio", () => {
    expect(recorrerFormas(esc, { capaId: "x", objetoId: "borrada" }, 1)?.objetoId).toBe("cielo");
  });

  it("con el mapa vacío no revienta", () => {
    const vacia = { ...esc, layers: [] } as Escena;
    expect(recorrerFormas(vacia, null, 1)).toBeNull();
  });

  it("dice en qué puesto va, para poder enseñar «2 de 3»", () => {
    expect(puestoDe(esc, { capaId: "medio", objetoId: "muro" })).toEqual({ i: 2, total: 3 });
    expect(puestoDe(esc, null)).toEqual({ i: 0, total: 3 });
  });
});

describe("qué se puede tocar", () => {
  it("con el lienzo bloqueado, nada", () => {
    expect(capaEditable("medio", null, true)).toBe(false);
    expect(capaEditable("medio", "medio", true)).toBe(false);
  });

  it("sin aislar, todas", () => {
    expect(capaEditable("fondo", null, false)).toBe(true);
    expect(capaEditable("medio", null, false)).toBe(true);
  });

  it("aislada una, SOLO esa", () => {
    // Sin esto, aislar servía para mirar y el dedo seguía agarrando una forma
    // de otra capa que estaba encima, que es justo lo que se quería evitar.
    expect(capaEditable("medio", "medio", false)).toBe(true);
    expect(capaEditable("fondo", "medio", false)).toBe(false);
  });
});

describe("centro de una forma", () => {
  it("sale del centro de su caja, sea la forma que sea", () => {
    expect(centroDeObjeto({ id: "a", shape: "rect", x: 0.2, y: 0.4, w: 0.4, h: 0.2 } as any))
      .toEqual({ x: 0.4, y: 0.5 });
    expect(centroDeObjeto({ id: "b", shape: "circle", cx: 0.7, cy: 0.3, r: 0.1 } as any))
      .toEqual({ x: 0.7, y: 0.3 });
  });
});

describe("nombres de las etiquetas", () => {
  it("traduce las conocidas y deja pasar las raras", () => {
    expect(nombreDe("water")).toBe("Agua");
    expect(nombreDe("inventada")).toBe("inventada");
  });

  it("no hay ids repetidos en el catálogo", () => {
    const ids = SEMANTICAS.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
