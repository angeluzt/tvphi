import { describe, it, expect } from "vitest";
import {
  emparejar, separar, mover, llevarA, quitar, duplicar, invertir, repetidos,
  distancia, parecidos, aQueSeParece,
} from "./orden-fotogramas";

// El modelo casi siempre dibuja bien los cuadros, pero no siempre en orden: un
// ciclo de caminar sale con el paso 3 antes que el 2, o repite una pose. Antes
// eso obligaba a tirar la imagen y pagarla otra vez para arreglar algo que ya
// estaba dibujado.
//
// LO QUE MÁS SE PRUEBA AQUÍ es que fotograma y celda viajen JUNTOS. Son dos
// listas paralelas y las dos se guardan; mover una y no la otra deja un sprite
// que se ve bien en la tira y se recorta mal al reabrirlo, un día después y sin
// forma de relacionarlo con esto.

const fotos = ["a", "b", "c", "d"];
const celdas = [{ x: 0 }, { x: 10 }, { x: 20 }, { x: 30 }];

describe("emparejar y separar", () => {
  it("van y vuelven sin cambiar nada", () => {
    const { fotos: f, celdas: c } = separar(emparejar(fotos, celdas));
    expect(f).toEqual(fotos);
    expect(c).toEqual(celdas);
  });

  it("si una lista es más corta, sobra lo que no tiene pareja", () => {
    // Un par a medias no se puede guardar: la ruta exige tantas celdas como
    // fotogramas y rechazaría la petición entera.
    const p = emparejar(["a", "b", "c"], [{ x: 0 }]);
    expect(p).toHaveLength(1);
  });
});

describe("mover", () => {
  it("intercambia con el vecino", () => {
    expect(mover(fotos, 1, 1)).toEqual(["a", "c", "b", "d"]);
    expect(mover(fotos, 2, -1)).toEqual(["a", "c", "b", "d"]);
  });

  it("en los extremos no hace nada, y devuelve LA MISMA lista", () => {
    // Importa la identidad, no solo el contenido: quien llama la usa para saber
    // si hace falta recomponer la tira, que es caro. Con una copia, cada clic
    // en un botón apagado volvería a componer la imagen.
    expect(mover(fotos, 0, -1)).toBe(fotos);
    expect(mover(fotos, 3, 1)).toBe(fotos);
    expect(mover(fotos, -5, 1)).toBe(fotos);
  });

  it("mover y devolver deja la lista igual", () => {
    expect(mover(mover(fotos, 1, 1), 2, -1)).toEqual(fotos);
  });

  it("el par se mueve entero: foto y celda no se separan", () => {
    const movido = mover(emparejar(fotos, celdas), 0, 1);
    const { fotos: f, celdas: c } = separar(movido);
    expect(f).toEqual(["b", "a", "c", "d"]);
    expect(c).toEqual([{ x: 10 }, { x: 0 }, { x: 20 }, { x: 30 }]);
  });
});

describe("llevarA", () => {
  it("empuja el resto en vez de intercambiar", () => {
    expect(llevarA(fotos, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(llevarA(fotos, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("al mismo sitio o fuera de rango, no toca nada", () => {
    expect(llevarA(fotos, 1, 1)).toBe(fotos);
    expect(llevarA(fotos, 1, 9)).toBe(fotos);
  });

  it("no pierde ni repite ninguno", () => {
    const r = llevarA(fotos, 2, 0);
    expect([...r].sort()).toEqual([...fotos].sort());
  });
});

describe("quitar", () => {
  it("quita solo ese", () => {
    expect(quitar(fotos, 1)).toEqual(["a", "c", "d"]);
  });

  it("NUNCA deja la lista vacía", () => {
    // Un sprite sin fotogramas no es un sprite, y la ruta que guarda lo
    // rechazaría con un error de esquema tras haber llegado hasta aquí.
    expect(quitar(["solo"], 0)).toEqual(["solo"]);
  });

  it("fuera de rango no hace nada", () => {
    expect(quitar(fotos, 9)).toBe(fotos);
  });

  it("borra el par entero", () => {
    const { fotos: f, celdas: c } = separar(quitar(emparejar(fotos, celdas), 1));
    expect(f).toEqual(["a", "c", "d"]);
    expect(c).toEqual([{ x: 0 }, { x: 20 }, { x: 30 }]);
  });
});

describe("duplicar", () => {
  it("mete la copia justo detrás", () => {
    expect(duplicar(fotos, 1)).toEqual(["a", "b", "b", "c", "d"]);
  });

  it("respeta el tope de la hoja", () => {
    const lleno = Array.from({ length: 24 }, (_, i) => `f${i}`);
    expect(duplicar(lleno, 0)).toBe(lleno);
    expect(duplicar(fotos, 0, 4)).toBe(fotos);
  });

  it("duplica el par, no solo la foto", () => {
    const { fotos: f, celdas: c } = separar(duplicar(emparejar(fotos, celdas), 0));
    expect(f).toEqual(["a", "a", "b", "c", "d"]);
    expect(c[0]).toEqual(c[1]);
  });
});

describe("invertir", () => {
  it("da la vuelta al ciclo", () => {
    expect(invertir(fotos)).toEqual(["d", "c", "b", "a"]);
  });

  it("con uno solo no hace nada", () => {
    const uno = ["a"];
    expect(invertir(uno)).toBe(uno);
  });

  it("no muta la lista original", () => {
    const copia = [...fotos];
    invertir(fotos);
    expect(fotos).toEqual(copia);
  });
});

describe("repetidos", () => {
  it("señala el segundo y siguientes, no el primero", () => {
    // El primero es el bueno: se marca lo que sobra, para poder borrarlo.
    expect(repetidos(["a", "b", "a", "c", "b"], (x) => x)).toEqual([2, 4]);
  });

  it("sin repetidos, lista vacía", () => {
    expect(repetidos(fotos, (x) => x)).toEqual([]);
  });

  it("compara por la clave que le den, no por identidad de objeto", () => {
    const l = [{ u: "x" }, { u: "y" }, { u: "x" }];
    expect(repetidos(l, (o) => o.u)).toEqual([2]);
  });

  it("tras quitar el repetido ya no queda ninguno", () => {
    const l = ["a", "b", "a"];
    const limpio = quitar(l, repetidos(l, (x) => x)[0]);
    expect(repetidos(limpio, (x) => x)).toEqual([]);
  });
});

describe("parecidos", () => {
  // Una firma es una miniatura reducida a claro/oscuro: aquí, 64 puntos.
  const base = "1".repeat(32) + "0".repeat(32);
  const conRuido = (n: number) =>
    base.split("").map((c, i) => (i < n ? (c === "1" ? "0" : "1") : c)).join("");

  it("no compara firmas de distinto largo: peor caso", () => {
    expect(distancia("101", "1010")).toBe(Number.POSITIVE_INFINITY);
    expect(parecidos([base, "101"])).toEqual([]);
  });

  it("una pose repetida con el contorno temblando sí se detecta", () => {
    // Lo que de verdad pasa: el modelo redibuja la misma pose y cambia cuatro
    // puntos. Comparando los PNG byte a byte no saldría ninguna coincidencia
    // y el aviso no saltaría nunca.
    expect(repetidos([base, conRuido(4)], (x) => x)).toEqual([]);
    expect(parecidos([base, conRuido(4)])).toEqual([1]);
  });

  it("dos poses distintas de verdad NO se marcan", () => {
    expect(parecidos([base, conRuido(20)])).toEqual([]);
  });

  it("señala el segundo y siguientes, nunca el primero", () => {
    expect(parecidos([base, conRuido(2), conRuido(30), conRuido(1)])).toEqual([1, 3]);
  });

  it("dice a cuál se parece cada uno, para poder nombrarlo", () => {
    expect(aQueSeParece([base, conRuido(30), conRuido(2)])).toEqual([null, null, 0]);
  });

  it("el umbral manda: con 0 solo lo idéntico", () => {
    expect(parecidos([base, conRuido(1)], 0)).toEqual([]);
    expect(parecidos([base, base], 0)).toEqual([1]);
  });

  it("tras quitar el parecido ya no queda ninguno", () => {
    const l = [base, conRuido(30), conRuido(3)];
    const limpio = quitar(l, parecidos(l)[0]);
    expect(parecidos(limpio)).toEqual([]);
  });
});

describe("una corrección de verdad, de principio a fin", () => {
  it("el paso 3 salió antes que el 2 y hay una pose repetida", () => {
    // Lo que pasa de verdad: seis cuadros, dos cambiados de sitio y uno que el
    // modelo dibujó dos veces.
    const salida = ["p1", "p3", "p2", "p4", "p4", "p5"];
    const cel = salida.map((_, i) => ({ x: i * 10 }));
    let pares = emparejar(salida, cel);

    // Se quita el repetido…
    const sobra = repetidos(pares, (p) => p.foto);
    expect(sobra).toEqual([4]);
    pares = quitar(pares, sobra[0]);

    // …y se colocan el 2 y el 3 en su sitio.
    pares = mover(pares, 1, 1);

    const { fotos: f, celdas: c } = separar(pares);
    expect(f).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    // Y las celdas siguen pegadas a su fotograma, que es lo que importa.
    expect(c).toEqual([{ x: 0 }, { x: 20 }, { x: 10 }, { x: 30 }, { x: 50 }]);
  });
});
