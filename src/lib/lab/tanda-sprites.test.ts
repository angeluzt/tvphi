import { describe, it, expect } from "vitest";
import {
  encargosDeTanda, conCadena, promptDelPaso, nombreDeAccion, pasoNuevo, RECETAS, MAX_PASOS_TANDA,
  type PasoTanda,
} from "./tanda-sprites";

// Encadenar varias animaciones del MISMO personaje.
//
// Lo que se prueba aquí no es comodidad: es lo que hace que salga un personaje
// y no cinco parecidos. Cada animación tiene que heredar un fotograma de la
// anterior; el paso que se olvida al hacerlo a mano es exactamente ese.

const paso = (que: string, extra: Partial<PasoTanda> = {}): PasoTanda => ({
  ...pasoNuevo(que.slice(0, 4)), que, ...extra,
});

describe("promptDelPaso", () => {
  it("el personaje va DELANTE de la acción", () => {
    // Los modelos de imagen pesan más lo primero: con la acción delante sale
    // «alguien pescando» —otra persona cada vez— en vez de «este señor».
    expect(promptDelPaso("pescador viejo con sombrero", paso("pescando en la orilla")))
      .toBe("pescador viejo con sombrero, pescando en la orilla");
  });

  it("no encadena comas ni espacios sueltos", () => {
    expect(promptDelPaso("pescador viejo,  ", paso("  , pescando")))
      .toBe("pescador viejo, pescando");
  });

  it("aguanta que falte una de las dos partes", () => {
    expect(promptDelPaso("", paso("pescando"))).toBe("pescando");
    expect(promptDelPaso("pescador", { ...paso(""), que: "" })).toBe("pescador");
  });
});

describe("encargosDeTanda", () => {
  const pasos = [paso("pescando"), paso("se levanta"), paso("camina", { accion: "caminar" })];

  it("saca un encargo por acción, en orden", () => {
    const e = encargosDeTanda({ personaje: "pescador viejo", pasos });
    expect(e).toHaveLength(3);
    expect(e.map((x) => x.que)).toEqual([
      "pescador viejo, pescando",
      "pescador viejo, se levanta",
      "pescador viejo, camina",
    ]);
  });

  it("la PRIMERA crea el personaje: va sin personajeId", () => {
    const e = encargosDeTanda({ personaje: "pescador", pasos });
    expect(e[0].personajeId).toBeUndefined();
    expect(e[0].refAnimacionId).toBeUndefined();
  });

  it("si el personaje ya existe, la primera se le cuelga", () => {
    const e = encargosDeTanda({
      personaje: "pescador", pasos, personajeId: "p1", refInicialId: "a9",
    });
    expect(e[0].personajeId).toBe("p1");
    expect(e[0].refAnimacionId).toBe("a9");
    // Las siguientes no: su cadena la pone `conCadena` con lo que devolvió la
    // anterior, que hasta que el servidor no contesta no existe.
    expect(e[1].personajeId).toBeUndefined();
  });

  it("todas heredan del ÚLTIMO cuadro", () => {
    // Es lo que hace que la pose final de una enlace con la inicial de la
    // siguiente y la secuencia se pueda reproducir seguida.
    for (const x of encargosDeTanda({ personaje: "p", pasos })) {
      expect(x.refCuadro).toBe("ultimo");
    }
  });

  it("conserva vista, dirección, acción y fotogramas de cada paso", () => {
    const e = encargosDeTanda({
      personaje: "p",
      pasos: [paso("gira", { vista: "frontal", direccion: "frente", accion: "girar", fotogramas: 4 })],
    });
    expect(e[0]).toMatchObject({ vista: "frontal", direccion: "frente", accion: "girar", fotogramas: 4 });
  });

  it("descarta los pasos vacíos o de una letra", () => {
    const e = encargosDeTanda({ personaje: "p", pasos: [paso("pescando"), paso(""), paso("ab")] });
    expect(e).toHaveLength(1);
  });

  it("corta en el tope: una tanda de treinta serían treinta imágenes pagadas", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => paso(`accion numero ${i}`));
    expect(encargosDeTanda({ personaje: "p", pasos: muchos })).toHaveLength(MAX_PASOS_TANDA);
  });

  it("la descripción del personaje cae a su nombre si no se escribe", () => {
    const e = encargosDeTanda({ personaje: "pescador viejo", pasos });
    expect(e[0].descripcionPersonaje).toBe("pescador viejo");
    const f = encargosDeTanda({ personaje: "pescador", descripcion: "un señor de 70 años", pasos });
    expect(f[0].descripcionPersonaje).toBe("un señor de 70 años");
  });
});

describe("conCadena", () => {
  const base = { que: "camina", refCuadro: "ultimo" as const };

  it("sin anterior, no toca nada: es la primera de la tanda", () => {
    expect(conCadena(base, null)).toEqual(base);
  });

  it("con anterior, se cuelga de su personaje y hereda su cara", () => {
    const r = conCadena(base, { personajeId: "p1", animacionId: "a1" });
    expect(r.personajeId).toBe("p1");
    expect(r.refAnimacionId).toBe("a1");
    expect(r.refCuadro).toBe("ultimo");
  });

  it("la cadena PISA lo que trajera el encargo", () => {
    // Importa: el encargo puede venir con el personaje que se eligió en el
    // formulario, y a mitad de tanda manda el que se acaba de crear.
    const r = conCadena({ ...base, personajeId: "viejo", refAnimacionId: "vieja" },
      { personajeId: "p2", animacionId: "a2" });
    expect(r.personajeId).toBe("p2");
    expect(r.refAnimacionId).toBe("a2");
  });

  it("una tanda entera queda encadenada de principio a fin", () => {
    const encargos = encargosDeTanda({
      personaje: "pescador",
      pasos: [paso("pesca"), paso("se levanta"), paso("camina")],
    });
    const hechos: { personajeId: string; animacionId: string }[] = [];
    const mandados = encargos.map((e, i) => {
      const listo = conCadena(e, hechos[i - 1] ?? null);
      hechos.push({ personajeId: "p1", animacionId: `a${i + 1}` });
      return listo;
    });
    expect(mandados[0].personajeId).toBeUndefined();       // crea el personaje
    expect(mandados[1].refAnimacionId).toBe("a1");          // hereda de la 1ª
    expect(mandados[2].refAnimacionId).toBe("a2");          // y de la 2ª
    expect(mandados.slice(1).every((m) => m.personajeId === "p1")).toBe(true);
  });
});

describe("nombreDeAccion", () => {
  it("nombra por lo que HACE, no por quién es", () => {
    // Sin esto, las cinco animaciones del pescador se llamaban «Pescador viejo
    // con sombrero de paja» y en la biblioteca no había forma de distinguirlas.
    expect(nombreDeAccion("se levanta y recoge la caña")).toBe("Se levanta y recoge la caña");
  });

  it("corta por la primera coma: lo que sigue son detalles de dibujo", () => {
    expect(nombreDeAccion("camina de perfil, con la caña al hombro, estilo anime"))
      .toBe("Camina de perfil");
  });

  it("cada paso de una tanda sale con nombre distinto", () => {
    const e = encargosDeTanda({
      personaje: "pescador viejo",
      pasos: [paso("pescando en la orilla"), paso("se levanta"), paso("camina de perfil")],
    });
    expect(e.map((x) => x.nombre)).toEqual([
      "Pescando en la orilla", "Se levanta", "Camina de perfil",
    ]);
    expect(new Set(e.map((x) => x.nombre)).size).toBe(3);
  });

  it("no revienta con un texto raro", () => {
    expect(nombreDeAccion("   ")).toBe("Animación");
    expect(nombreDeAccion(",,,")).toBe("Animación");
  });
});

describe("recetas", () => {
  it("todas tienen pasos utilizables", () => {
    for (const r of RECETAS) {
      expect(r.pasos.length).toBeGreaterThan(1);
      expect(r.pasos.length).toBeLessThanOrEqual(MAX_PASOS_TANDA);
      for (const p of r.pasos) expect(p.que.trim().length).toBeGreaterThanOrEqual(3);
    }
  });

  it("la del pescador es justo la secuencia que se pidió", () => {
    const r = RECETAS.find((x) => x.id === "pescador")!;
    expect(r.pasos.map((p) => p.accion)).toEqual(["quieto", "otro", "girar", "caminar", "quieto"]);
    // Al girar hacia la izquierda, los pasos siguientes miran a la izquierda.
    expect(r.pasos[3].direccion).toBe("izquierda");
    expect(r.pasos[4].direccion).toBe("izquierda");
  });

  it("una receta se convierte en encargos sin tocar nada más", () => {
    const r = RECETAS.find((x) => x.id === "pescador")!;
    const e = encargosDeTanda({
      personaje: "pescador viejo con sombrero de paja",
      pasos: r.pasos.map((p, i) => ({ ...p, id: `p${i}` })),
    });
    expect(e).toHaveLength(5);
    expect(e[0].que).toMatch(/^pescador viejo con sombrero de paja, sentado en la orilla/);
  });
});
