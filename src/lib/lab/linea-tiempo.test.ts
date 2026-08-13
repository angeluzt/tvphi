import { describe, it, expect } from "vitest";
import {
  duracionCamara, duracionRuta, pistaCamara, pistaSprite, pistaEfectos,
  lineaDeTiempo, bloqueEn, cortes, saltar, reloj, nombreMov,
  type PasoCamaraLT, type SpriteLT,
} from "./linea-tiempo";

// Hay TRES relojes corriendo a la vez —cámara en ms, rutas de sprite en
// segundos y con bucle propio, efectos sin tiempo ninguno— y hasta ahora no
// había forma de contestar «¿qué pasa en el segundo 7?». Lo que más se prueba
// aquí es qué ocurre cuando esos relojes NO cuadran, que es siempre.

const cam: PasoCamaraLT[] = [
  { id: "a", durMs: 3000, mov: "acercar", distancia: 40 },
  { id: "b", durMs: 2000, mov: "der", mov2: "arriba" },
  { id: "c", durMs: 5000, mov: "atravesar", fade: { accion: "aparecer", capa: "frente" } },
];

describe("duraciones", () => {
  it("la cámara suma sus pasos", () => {
    expect(duracionCamara(cam)).toBe(10000);
  });

  it("la ruta pasa de segundos a milisegundos", () => {
    expect(duracionRuta([{ tipo: "mover", segundos: 2 }, { tipo: "pausa", segundos: 0.5 }])).toBe(2500);
  });

  it("sin pasos, cero", () => {
    expect(duracionCamara([])).toBe(0);
    expect(duracionRuta([])).toBe(0);
  });
});

describe("pista de cámara", () => {
  it("encadena los bloques sin huecos ni solapes", () => {
    const p = pistaCamara(cam);
    expect(p.bloques.map((b) => [b.desde, b.hasta])).toEqual([[0, 3000], [3000, 5000], [5000, 10000]]);
  });

  it("nombra el movimiento, y los dos si son dos", () => {
    const p = pistaCamara(cam);
    expect(p.bloques[0].etiqueta).toBe("Acercar");
    expect(p.bloques[1].etiqueta).toBe("Derecha → + ↑ Arriba");
  });

  it("el fundido es una MARCA, no un bloque", () => {
    // Un fundido no ocupa tiempo por su cuenta: pasa dentro del tramo. Como
    // bloque haría creer que la cámara se para a hacerlo.
    const p = pistaCamara(cam);
    expect(p.bloques).toHaveLength(3);
    expect(p.marcas).toEqual([{ ms: 5000, etiqueta: "aparece capa", clase: "fundido" }]);
  });

  it("un paso de duración cero sigue siendo pulsable", () => {
    const p = pistaCamara([{ id: "z", durMs: 0, mov: "quieto" }]);
    expect(p.bloques[0].hasta - p.bloques[0].desde).toBeGreaterThan(0);
  });
});

describe("pista de sprite", () => {
  const andar: SpriteLT = {
    capaId: "c1", nombre: "Pescador",
    pasos: [
      { tipo: "mover", segundos: 2, x: 0.8, y: 0.6 },
      { tipo: "pausa", segundos: 1 },
      { tipo: "cambiar", segundos: 0, anim: "pescar" },
      { tipo: "mover", segundos: 1, x: 0.2 },
    ],
  };

  it("reparte los pasos en orden desde cero", () => {
    const p = pistaSprite(andar, 10000);
    expect(p.bloques.map((b) => b.desde)).toEqual([0, 2000, 3000, 3080]);
  });

  it("NO se estira para llenar la escena", () => {
    // Una ruta de 4 s en una escena de 10 dura 4 y el bicho se queda donde
    // llegó. Estirarla pondría los destinos en un sitio distinto del que se ve.
    const p = pistaSprite(andar, 10000);
    const fin = Math.max(...p.bloques.map((b) => b.hasta));
    expect(fin).toBeLessThan(5000);
    expect(p.marcas.some((m) => m.clase === "fin" && m.etiqueta === "se queda quieto")).toBe(true);
  });

  it("si la ruta es más larga que la escena, se CORTA", () => {
    const p = pistaSprite(andar, 2500);
    expect(Math.max(...p.bloques.map((b) => b.hasta))).toBe(2500);
    expect(p.marcas.some((m) => m.clase === "fin")).toBe(false);
  });

  it("el cambio de sprite sale como marca aunque dure cero", () => {
    // Es EL momento que hay que poder encontrar, y en un bloque de 0,08 s no
    // se ve.
    const p = pistaSprite(andar, 10000);
    expect(p.marcas.filter((m) => m.clase === "cambio")).toEqual([
      { ms: 3000, etiqueta: "cambia a pescar", clase: "cambio" },
    ]);
  });

  it("en bucle se repite y se marca cada vuelta", () => {
    const p = pistaSprite({ ...andar, bucle: true }, 10000);
    expect(p.marcas.filter((m) => m.clase === "vuelta").length).toBeGreaterThan(0);
    expect(Math.max(...p.bloques.map((b) => b.hasta))).toBe(10000);
  });

  it("una ruta diminuta en bucle no cuelga el navegador", () => {
    const p = pistaSprite(
      { capaId: "x", nombre: "mosca", bucle: true, pasos: [{ tipo: "mover", segundos: 0.001 }] },
      600000,
    );
    expect(p.bloques.length).toBeLessThan(1000);
  });

  it("un sprite sin ruta da una pista vacía, no un error", () => {
    const p = pistaSprite({ capaId: "y", nombre: "quieto", pasos: [] }, 5000);
    expect(p.bloques).toEqual([]);
    expect(p.nombre).toBe("quieto");
  });
});

describe("efectos", () => {
  it("ocupan la escena entera, porque hoy no se pueden temporizar", () => {
    const p = pistaEfectos([{ id: "f1", nombre: "Niebla" }], 8000);
    expect(p.bloques[0]).toMatchObject({ desde: 0, hasta: 8000, etiqueta: "Niebla" });
  });

  it("sin efectos no se inventa la pista", () => {
    expect(lineaDeTiempo(cam, [], []).pistas.some((p) => p.clase === "efectos")).toBe(false);
  });
});

describe("la línea entera", () => {
  const sprites: SpriteLT[] = [{ capaId: "c1", nombre: "Pez", pasos: [{ tipo: "mover", segundos: 3 }] }];

  it("el largo lo manda la cámara", () => {
    expect(lineaDeTiempo(cam, sprites, []).totalMs).toBe(10000);
  });

  it("sin cámara, manda la ruta más larga", () => {
    // Si saliera de ancho cero no se podría ni pulsar para colocar el primer paso.
    const lt = lineaDeTiempo([], [{ capaId: "a", nombre: "x", pasos: [{ tipo: "mover", segundos: 4 }] }], []);
    expect(lt.totalMs).toBe(4000);
  });

  it("sin nada, sigue teniendo ancho", () => {
    expect(lineaDeTiempo([], [], []).totalMs).toBeGreaterThan(0);
  });

  it("cámara primero, efectos al final", () => {
    const lt = lineaDeTiempo(cam, sprites, [{ id: "f", nombre: "Humo" }]);
    expect(lt.pistas.map((p) => p.clase)).toEqual(["camara", "sprite", "efectos"]);
  });
});

describe("qué pasa en el segundo N", () => {
  it("encuentra el bloque de ese instante", () => {
    const p = pistaCamara(cam);
    expect(bloqueEn(p, 0)?.etiqueta).toBe("Acercar");
    expect(bloqueEn(p, 2999)?.etiqueta).toBe("Acercar");
    expect(bloqueEn(p, 3000)?.etiqueta).toContain("Derecha");
    expect(bloqueEn(p, 99999)).toBeNull();
  });

  it("el final de un bloque ya es del siguiente, no de los dos", () => {
    const p = pistaCamara(cam);
    expect(bloqueEn(p, 5000)?.indice).toBe(2);
  });
});

describe("saltar de suceso en suceso", () => {
  const lt = lineaDeTiempo(cam, [{
    capaId: "c1", nombre: "P",
    pasos: [{ tipo: "mover", segundos: 1 }, { tipo: "cambiar", segundos: 0, anim: "otra" }],
  }], []);

  it("los cortes salen de bloques y marcas, sin repetirse y en orden", () => {
    const c = cortes(lt);
    expect(c).toEqual([...new Set(c)].sort((a, b) => a - b));
    expect(c[0]).toBe(0);
    expect(c[c.length - 1]).toBe(10000);
  });

  it("avanza al siguiente suceso, no un tiempo fijo", () => {
    expect(saltar(lt, 0, 1)).toBe(1000);
    expect(saltar(lt, 1000, 1)).toBeGreaterThan(1000);
  });

  it("hacia atrás no se queda pegado en el corte actual", () => {
    // Sin holgura, «anterior» devuelve el mismo sitio y el botón parece roto.
    expect(saltar(lt, 3000, -1)).toBeLessThan(3000);
  });

  it("en los extremos se para, no se sale", () => {
    expect(saltar(lt, 0, -1)).toBe(0);
    expect(saltar(lt, 10000, 1)).toBe(10000);
  });
});

describe("reloj", () => {
  it("segundos sueltos y minutos", () => {
    expect(reloj(0)).toBe("0.0s");
    expect(reloj(4500)).toBe("4.5s");
    expect(reloj(64500)).toBe("1:04.5");
  });

  it("nunca en negativo", () => {
    expect(reloj(-500)).toBe("0.0s");
  });
});

describe("nombres de movimiento", () => {
  it("traduce los conocidos y deja pasar los que no", () => {
    expect(nombreMov("acercar")).toBe("Acercar");
    expect(nombreMov("inventado")).toBe("inventado");
  });
});
