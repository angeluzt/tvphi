import { describe, it, expect } from "vitest";
import {
  cajaDeObjeto, tocaObjeto, objetoEn, moverObjeto, redimensionarObjeto,
  cajaArrastrando, puntoDeEsquina, idLibre, duplicarObjeto, borrarObjeto,
  cambiarObjeto, moverObjetoDeCapa,
} from "./geometria-mapa";
import type { Escena, Objeto } from "./escena";

// El mapa se veía pero solo se editaba escribiendo JSON a mano. Esto es lo que
// hace que se pueda tocar con el dedo.
//
// La dificultad está en que cada forma guarda su geometría a su manera —el
// rectángulo x/y/w/h, el círculo cx/cy/r, la línea x1/y1/x2/y2, el polígono una
// lista de puntos—, así que un arrastre que solo supiera de rectángulos
// «funcionaría» y mandaría el resto a la esquina. Aquí se fija que todas las
// formas se comporten igual.

const rect: Objeto = { id: "r", shape: "rect", semantic: "wall", x: 0.2, y: 0.3, w: 0.4, h: 0.2 };
const circ: Objeto = { id: "c", shape: "circle", semantic: "prop", cx: 0.5, cy: 0.5, r: 0.1 };
const elip: Objeto = { id: "e", shape: "ellipse", semantic: "water", cx: 0.5, cy: 0.4, rx: 0.2, ry: 0.1 };
const linea: Objeto = { id: "l", shape: "line", semantic: "floor", x1: 0.1, y1: 0.8, x2: 0.9, y2: 0.6 };
const poli: Objeto = { id: "p", shape: "polygon", semantic: "terrain", points: [[0.1, 0.9], [0.5, 0.5], [0.9, 0.9]] };

describe("cajaDeObjeto", () => {
  it("un rectángulo es su propia caja", () => {
    expect(cajaDeObjeto(rect)).toEqual({ x: 0.2, y: 0.3, w: 0.4, h: 0.2 });
  });

  it("un círculo se mide por su radio, no por cx/cy", () => {
    expect(cajaDeObjeto(circ)).toEqual({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
  });

  it("una elipse usa sus dos radios", () => {
    const c = cajaDeObjeto(elip);
    expect(c.w).toBeCloseTo(0.4);
    expect(c.h).toBeCloseTo(0.2);
  });

  it("una línea que sube da una caja con alto, no cero", () => {
    const c = cajaDeObjeto(linea);
    expect(c.x).toBeCloseTo(0.1);
    expect(c.y).toBeCloseTo(0.6);
    expect(c.w).toBeCloseTo(0.8);
    expect(c.h).toBeCloseTo(0.2);
  });

  it("un polígono encierra todos sus puntos", () => {
    expect(cajaDeObjeto(poli)).toEqual({ x: 0.1, y: 0.5, w: 0.8, h: 0.4 });
  });

  it("una forma sin datos no revienta ni devuelve NaN", () => {
    const c = cajaDeObjeto({ id: "x", shape: "polygon", semantic: "prop" });
    expect(Number.isFinite(c.x + c.y + c.w + c.h)).toBe(true);
  });
});

describe("qué hay bajo el dedo", () => {
  const esc = {
    scene: { id: "s", title: "t", width: 1920, height: 1080 },
    layers: [
      { id: "fondo", name: "Fondo", depth: 0, objects: [{ ...rect, id: "cielo", x: 0, y: 0, w: 1, h: 1 }] },
      { id: "frente", name: "Frente", depth: 0.8, objects: [circ] },
    ],
  } as unknown as Escena;

  it("gana lo de DELANTE, no lo primero de la lista", () => {
    // El cielo cubre el cuadro entero: recorriendo en orden natural ganaría
    // siempre, y no habría forma de coger nada.
    expect(objetoEn(esc, 0.5, 0.5)).toEqual({ capaId: "frente", objetoId: "c" });
  });

  it("fuera del círculo cae al fondo", () => {
    expect(objetoEn(esc, 0.05, 0.05)).toEqual({ capaId: "fondo", objetoId: "cielo" });
  });

  it("una capa oculta no se puede coger", () => {
    const oculto = { ...esc, layers: [esc.layers[0], { ...esc.layers[1], visible: false }] } as Escena;
    expect(objetoEn(oculto, 0.5, 0.5)?.objetoId).toBe("cielo");
  });

  it("se puede limitar a una sola capa", () => {
    expect(objetoEn(esc, 0.5, 0.5, "fondo")?.objetoId).toBe("cielo");
  });

  it("una línea horizontal se puede coger pese a tener alto cero", () => {
    const plana: Objeto = { id: "h", shape: "line", semantic: "floor", x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };
    expect(tocaObjeto(plana, 0.5, 0.5)).toBe(true);
    expect(tocaObjeto(plana, 0.5, 0.503)).toBe(true);
    expect(tocaObjeto(plana, 0.5, 0.7)).toBe(false);
  });
});

describe("moverObjeto", () => {
  it("mueve un rectángulo por x/y", () => {
    const m = moverObjeto(rect, 0.1, -0.05);
    expect(m.x).toBeCloseTo(0.3);
    expect(m.y).toBeCloseTo(0.25);
  });

  it("mueve un círculo por cx/cy, no por x/y", () => {
    const m = moverObjeto(circ, 0.1, 0);
    expect(m.cx).toBeCloseTo(0.6);
    expect(m.x).toBeUndefined();
  });

  it("mueve los DOS extremos de una línea", () => {
    const m = moverObjeto(linea, 0.1, 0.1);
    expect(m.x1).toBeCloseTo(0.2); expect(m.x2).toBeCloseTo(1.0);
    expect(m.y1).toBeCloseTo(0.9); expect(m.y2).toBeCloseTo(0.7);
  });

  it("mueve todos los puntos de un polígono y conserva su forma", () => {
    const m = moverObjeto(poli, 0.1, 0);
    const antes = cajaDeObjeto(poli);
    const luego = cajaDeObjeto(m);
    expect(luego.x).toBeCloseTo(antes.x + 0.1);
    expect(luego.w).toBeCloseTo(antes.w);
    expect(luego.h).toBeCloseTo(antes.h);
  });

  it("mover y devolver deja la forma donde estaba", () => {
    for (const o of [rect, circ, elip, linea, poli]) {
      const ida = cajaDeObjeto(moverObjeto(moverObjeto(o, 0.2, 0.1), -0.2, -0.1));
      const orig = cajaDeObjeto(o);
      expect(ida.x).toBeCloseTo(orig.x);
      expect(ida.y).toBeCloseTo(orig.y);
    }
  });
});

describe("redimensionarObjeto", () => {
  const destino = { x: 0.1, y: 0.1, w: 0.5, h: 0.25 };

  it("la caja resultante ES la pedida, para cualquier forma", () => {
    for (const o of [rect, elip, linea, poli]) {
      const c = cajaDeObjeto(redimensionarObjeto(o, destino));
      expect(c.x).toBeCloseTo(destino.x);
      expect(c.y).toBeCloseTo(destino.y);
      expect(c.w).toBeCloseTo(destino.w);
      expect(c.h).toBeCloseTo(destino.h);
    }
  });

  it("un círculo NO se ovala: coge el lado menor y se centra", () => {
    const r = redimensionarObjeto(circ, destino);
    expect(r.r).toBeCloseTo(0.125);
    expect(r.cx).toBeCloseTo(0.35);
    expect(r.cy).toBeCloseTo(0.225);
  });

  it("una línea conserva su sentido al estirarla", () => {
    // Baja de izquierda a derecha; tras estirar tiene que seguir bajando.
    const r = redimensionarObjeto(linea, destino);
    expect(r.y1! > r.y2!).toBe(linea.y1! > linea.y2!);
    expect(r.x1! < r.x2!).toBe(linea.x1! < linea.x2!);
  });

  it("nunca deja una forma de tamaño cero", () => {
    const c = cajaDeObjeto(redimensionarObjeto(rect, { x: 0.5, y: 0.5, w: 0, h: 0 }));
    expect(c.w).toBeGreaterThan(0);
    expect(c.h).toBeGreaterThan(0);
  });
});

describe("arrastrar una esquina", () => {
  const c = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

  it("la esquina opuesta se queda clavada", () => {
    const nueva = cajaArrastrando(c, "ai", 0.3, 0.3);
    const bd = puntoDeEsquina(nueva, "bd");
    expect(bd.x).toBeCloseTo(0.6);
    expect(bd.y).toBeCloseTo(0.6);
    expect(nueva.x).toBeCloseTo(0.3);
  });

  it("cruzar la caja entera da una caja válida, no una de ancho negativo", () => {
    const nueva = cajaArrastrando(c, "ai", 0.9, 0.9);
    expect(nueva.w).toBeGreaterThan(0);
    expect(nueva.h).toBeGreaterThan(0);
    expect(nueva.x).toBeCloseTo(0.6);
  });

  it("las cuatro esquinas caen donde deben", () => {
    expect(puntoDeEsquina(c, "ai").x).toBeCloseTo(0.2);
    expect(puntoDeEsquina(c, "ad").x).toBeCloseTo(0.6);
    expect(puntoDeEsquina(c, "bi").y).toBeCloseTo(0.6);
    expect(puntoDeEsquina(c, "bd").y).toBeCloseTo(0.6);
  });
});

describe("duplicar, borrar y cambiar de capa", () => {
  const esc = {
    scene: { id: "s", title: "t", width: 1920, height: 1080 },
    layers: [
      { id: "a", name: "A", depth: 0, objects: [rect, circ] },
      { id: "b", name: "B", depth: 0.5, objects: [poli] },
    ],
  } as unknown as Escena;

  it("la copia tiene id propio y no tapa a la original", () => {
    const { escena, nuevoId } = duplicarObjeto(esc, "a", "r");
    expect(nuevoId).toBe("r-copia");
    const copia = escena.layers[0].objects.find((o) => o.id === "r-copia")!;
    expect(cajaDeObjeto(copia).x).not.toBeCloseTo(cajaDeObjeto(rect).x);
    expect(escena.layers[0].objects).toHaveLength(3);
  });

  it("la copia va JUSTO detrás de la original, no al final", () => {
    const { escena } = duplicarObjeto(esc, "a", "r");
    expect(escena.layers[0].objects.map((o) => o.id)).toEqual(["r", "r-copia", "c"]);
  });

  it("duplicar dos veces no repite el id", () => {
    const uno = duplicarObjeto(esc, "a", "r").escena;
    const dos = duplicarObjeto(uno, "a", "r");
    expect(dos.nuevoId).toBe("r-copia-2");
  });

  it("idLibre no encadena «-copia-copia»", () => {
    expect(idLibre(esc, "r-copia")).toBe("r-copia");
    expect(idLibre(esc, "r")).toBe("r-copia");
  });

  it("borrar quita solo esa forma", () => {
    const r = borrarObjeto(esc, "a", "r");
    expect(r.layers[0].objects.map((o) => o.id)).toEqual(["c"]);
    expect(r.layers[1].objects).toHaveLength(1);
  });

  it("cambiar de capa conserva la forma tal cual", () => {
    const r = moverObjetoDeCapa(esc, "a", "b", "r");
    expect(r.layers[0].objects.map((o) => o.id)).toEqual(["c"]);
    expect(r.layers[1].objects.map((o) => o.id)).toEqual(["p", "r"]);
    expect(cajaDeObjeto(r.layers[1].objects[1])).toEqual(cajaDeObjeto(rect));
  });

  it("mover a una capa que no existe no pierde la forma", () => {
    const r = moverObjetoDeCapa(esc, "a", "fantasma", "r");
    expect(r.layers[0].objects).toHaveLength(2);
  });

  it("cambiarObjeto no toca las demás", () => {
    const r = cambiarObjeto(esc, "a", "c", (o) => ({ ...o, label: "puesto" }));
    expect(r.layers[0].objects[1].label).toBe("puesto");
    expect(r.layers[0].objects[0].label).toBeUndefined();
  });
});

describe("acertar la forma cuando el paralaje está corriendo", () => {
  // Con paralaje cada capa se dibuja corrida «offset × profundidad», así que la
  // forma NO está donde se ve. Antes esto hacía imposible coger nada sin
  // congelar el paralaje; ahora se deshace el corrimiento al buscar.
  const conProf = {
    scene: { id: "e", title: "E", width: 100, height: 100, description: "", style: "" },
    layers: [
      { id: "lejos", name: "L", depth: 0.1, ai: { prompt: "", exclude: "" },
        objects: [{ id: "a", shape: "rect", semantic: "sky", x: 0.0, y: 0.0, w: 0.2, h: 0.2, label: "A" }] },
      { id: "cerca", name: "C", depth: 0.9, ai: { prompt: "", exclude: "" },
        objects: [{ id: "b", shape: "rect", semantic: "prop", x: 0.6, y: 0.6, w: 0.2, h: 0.2, label: "B" }] },
    ],
  } as unknown as Escena;

  it("sin desfase, se acierta donde está la forma", () => {
    expect(objetoEn(conProf, 0.7, 0.7)?.objetoId).toBe("b");
  });

  it("con el paralaje corrido, el punto de pantalla también se corre", () => {
    // La capa cercana (0.9) se dibuja corrida 0,05 × 0,9 = 0,045.
    const desfase = { x: 0.05, y: 0 };
    expect(objetoEn(conProf, 0.7, 0.7, undefined, desfase)?.objetoId).toBe("b");
    // Justo en el borde de lo que se ve: sin deshacer el corrimiento, falla.
    expect(objetoEn(conProf, 0.84, 0.7, undefined, desfase)?.objetoId).toBe("b");
    expect(objetoEn(conProf, 0.84, 0.7)).toBeNull();
  });

  it("cada capa se corre lo suyo, no todas igual", () => {
    const desfase = { x: 0.1, y: 0 };
    // La lejana (0.1) apenas se mueve: 0,01.
    expect(objetoEn(conProf, 0.205, 0.1, undefined, desfase)?.objetoId).toBe("a");
    // La cercana (0.9) se mueve diez veces más: 0,09.
    expect(objetoEn(conProf, 0.75, 0.7, undefined, desfase)?.objetoId).toBe("b");
  });
});
