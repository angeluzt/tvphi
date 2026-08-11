import { describe, it, expect } from "vitest";
import {
  encargosDeTanda, conCadena, promptDelPaso, nombreDeAccion, pasoNuevo,
  normalizarPlan, reglasDelPlan, nombreDePersonaje, RECETAS,
  MAX_PASOS_TANDA, MAX_CUADROS, MAX_PROMPT,
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
  it("el texto va en INGLÉS: se pega dentro de un prompt que va entero en inglés", () => {
    // Los NOMBRES sí van en español —se leen en pantalla y no salen del
    // navegador—, pero el «que» acaba dentro de la instrucción del generador de
    // imagen, y mezclar idiomas ahí empeora el resultado.
    const acentos = /[áéíóúñ¿¡]/i;
    for (const r of RECETAS) {
      for (const p of r.pasos) expect(p.que).not.toMatch(acentos);
    }
  });

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
    expect(e[0].que).toMatch(/^pescador viejo con sombrero de paja, sitting on the riverbank/);
  });
});

describe("normalizarPlan", () => {
  // La primera versión de la tanda te hacía escribir las cinco acciones a mano.
  // Ahora se pide UNA frase y el reparto lo hace el modelo; esto es lo que deja
  // su respuesta en algo que el taller pueda ejecutar sin sorpresas.

  const bueno = {
    personaje: "old fisherman with a straw hat, anime style",
    descripcion: "Pescador viejo",
    pasos: [
      { que: "sitting on the riverbank, fishing", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "quieto" },
      { que: "walking in profile", fotogramas: 8, vista: "lateral", direccion: "izquierda", accion: "caminar" },
    ],
  };

  it("deja pasar un plan correcto tal cual", () => {
    const p = normalizarPlan(bueno);
    expect(p.personaje).toBe("old fisherman with a straw hat, anime style");
    expect(p.descripcion).toBe("Pescador viejo");
    expect(p.pasos).toHaveLength(2);
    expect(p.pasos[1]).toMatchObject({ vista: "lateral", direccion: "izquierda", accion: "caminar", fotogramas: 8 });
  });

  it("cada paso sale con id propio, que es lo que la lista necesita", () => {
    const p = normalizarPlan(bueno);
    expect(new Set(p.pasos.map((x) => x.id)).size).toBe(2);
  });

  it("un valor que no está en la lista cae a uno válido, no revienta la imagen", () => {
    // Un «vista: de lado» no rompe nada aquí: rompe la imagen que se paga
    // treinta segundos después, y para entonces no se sabe de dónde salió.
    const p = normalizarPlan({
      personaje: "x",
      pasos: [{ que: "camina", vista: "de lado", direccion: "hacia allá", accion: "pescar" }],
    });
    expect(p.pasos[0]).toMatchObject({ vista: "lateral", direccion: "derecha", accion: "otro" });
  });

  it("acota los fotogramas al tope del generador, ni uno menos", () => {
    // El tope vivía en tres sitios con tres números: pedir 11 se quedaba en 10
    // sin decir nada y parecía que el campo no dejaba escribir.
    const p = normalizarPlan({ personaje: "x", pasos: [
      { que: "uno", fotogramas: 40 }, { que: "dos", fotogramas: 0 },
      { que: "tres", fotogramas: "siete" }, { que: "cuatro", fotogramas: 11 },
    ] });
    expect(p.pasos.map((x) => x.fotogramas)).toEqual([MAX_CUADROS, 1, 6, 11]);
  });

  it("el tope que se le pide al modelo es el MISMO que se valida", () => {
    const r = reglasDelPlan();
    expect(r.reglas.join(" ")).toContain(`entre 1 y ${MAX_CUADROS}`);
  });

  it("descarta los pasos sin texto y corta en el tope", () => {
    const p = normalizarPlan({
      personaje: "x",
      pasos: [{ que: "camina" }, { que: "" }, { que: "ab" }, ...Array.from({ length: 20 }, () => ({ que: "otra cosa" }))],
    });
    expect(p.pasos.length).toBeLessThanOrEqual(MAX_PASOS_TANDA);
    expect(p.pasos.every((x) => x.que.length >= 3)).toBe(true);
  });

  it("sin descripción, se usa el personaje: la biblioteca no puede quedarse sin nombre", () => {
    expect(normalizarPlan({ personaje: "un pescador", pasos: [{ que: "pesca" }] }).descripcion)
      .toBe("un pescador");
  });

  it("aguanta basura entera sin lanzar", () => {
    for (const malo of [null, undefined, 42, "hola", {}, { pasos: "no es lista" }]) {
      const p = normalizarPlan(malo);
      expect(p.pasos).toEqual([]);
      expect(typeof p.personaje).toBe("string");
    }
  });

  it("el plan normalizado se puede ejecutar sin tocar nada", () => {
    const p = normalizarPlan(bueno);
    const e = encargosDeTanda({ personaje: p.personaje, descripcion: p.descripcion, pasos: p.pasos });
    expect(e).toHaveLength(2);
    expect(e[0].que).toMatch(/^old fisherman with a straw hat, anime style, sitting on the riverbank/);
    expect(e.every((x) => x.refCuadro === "ultimo")).toBe(true);
  });
});

describe("reglasDelPlan", () => {
  it("las listas que se le piden al modelo son las MISMAS que se validan", () => {
    // Separarlas es garantizar que un día se pida un valor que luego se
    // descarta en silencio y nadie entiende por qué salió otra cosa.
    const r = reglasDelPlan();
    const p = normalizarPlan({
      personaje: "x",
      pasos: r.vista.map((v) => ({ que: "algo", vista: v })),
    });
    expect(p.pasos.map((x) => x.vista)).toEqual(r.vista.slice(0, p.pasos.length));

    const q = normalizarPlan({
      personaje: "x",
      pasos: r.accion.map((a) => ({ que: "algo", accion: a })),
    });
    expect(q.pasos.map((x) => x.accion)).toEqual(r.accion.slice(0, q.pasos.length));
  });

  it("avisa del giro, que es donde se rompen estas secuencias", () => {
    expect(reglasDelPlan().reglas.join(" ")).toMatch(/girar/i);
  });
});

describe("nombreDePersonaje", () => {
  it("NO es el prompt cortado", () => {
    // Salía «old fisherman with a straw hat and worn blue jacket, anime s» en
    // la lista de la biblioteca. Ilegible, y todos los personajes empezando
    // igual.
    expect(nombreDePersonaje("old fisherman with a straw hat and worn blue jacket, anime style, clean cel shading"))
      .toBe("Old fisherman with a straw hat and worn blue jacket");
  });

  it("gana la descripción corta si la hay", () => {
    expect(nombreDePersonaje(
      "old fisherman with a straw hat, anime style",
      "Pescador viejo con sombrero de paja",
    )).toBe("Pescador viejo con sombrero de paja");
  });

  it("nunca pasa de 60 letras ni se queda vacío", () => {
    expect(nombreDePersonaje("x".repeat(200)).length).toBe(60);
    expect(nombreDePersonaje("")).toBe("Personaje");
    expect(nombreDePersonaje("  ,  ")).toBe("Personaje");
  });

  it("la tanda lo usa: el nombre de la biblioteca es legible", () => {
    const e = encargosDeTanda({
      personaje: "old fisherman with a straw hat, anime style, clean cel shading",
      descripcion: "Pescador viejo",
      pasos: [paso("pescando")],
    });
    expect(e[0].nombrePersonaje).toBe("Pescador viejo");
    // …pero el PROMPT sigue llevando la descripción completa en inglés.
    expect(e[0].que).toMatch(/anime style, clean cel shading/);
  });
});

describe("el prompt no se pasa del tope de las rutas", () => {
  // Las dos rutas que reciben esto rechazan por encima de 400. El fallo salía
  // DESPUÉS de pagar la imagen y con un mensaje que no decía qué campo era.
  it("personaje largo + acción larga no revientan el límite", () => {
    const p = promptDelPaso("x".repeat(200), { ...pasoNuevo("a"), que: "y".repeat(200) });
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT);
  });

  it("tampoco por separado", () => {
    expect(promptDelPaso("", { ...pasoNuevo("a"), que: "y".repeat(900) }).length)
      .toBeLessThanOrEqual(MAX_PROMPT);
    expect(promptDelPaso("x".repeat(900), { ...pasoNuevo("a"), que: "" }).length)
      .toBeLessThanOrEqual(MAX_PROMPT);
  });

  it("una tanda entera sale dentro del tope", () => {
    const e = encargosDeTanda({
      personaje: "x".repeat(200),
      pasos: [1, 2, 3].map((i) => ({ ...pasoNuevo(`p${i}`), que: "y".repeat(200) })),
    });
    for (const x of e) expect(x.que.length).toBeLessThanOrEqual(MAX_PROMPT);
  });

  it("lo normal no se toca", () => {
    const p = promptDelPaso("old fisherman with a straw hat",
      { ...pasoNuevo("a"), que: "sitting on the riverbank, fishing" });
    expect(p).toBe("old fisherman with a straw hat, sitting on the riverbank, fishing");
  });
});
