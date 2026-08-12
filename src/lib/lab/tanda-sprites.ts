// Una TANDA: varias animaciones del mismo personaje, de una tacada.
//
// EL PROBLEMA. Un personaje que pesca, se levanta, se da la vuelta, se va
// caminando y se queda pensando son CINCO animaciones. Hacerlas hoy es cinco
// vueltas completas por el taller: escribir el prompt, generar, esperar,
// guardar, «nueva animación de este personaje», elegir de cuál se hereda la
// cara, y otra vez. Media hora de clics para algo que es una sola idea.
//
// Y hay una parte que no es comodidad: para que el personaje NO cambie de cara
// entre animaciones, cada una tiene que heredar un fotograma de la anterior
// (`referenciaAnimacionId` + el cuadro). Encadenarlo a mano es exactamente el
// paso que se olvida, y entonces salen cinco criaturas parecidas en vez de una.
// Aquí el encadenado es automático porque es lo único que funciona.
//
// Este archivo NO llama a la IA: solo arma los encargos. Así se puede probar
// que la cadena se construye bien sin gastar un céntimo.

import type { AccionSprite, DireccionSprite, VistaSprite } from "./biblioteca";

/** Lo que pide UNA animación. Es lo que el taller sabe generar. */
export interface EncargoSprite {
  que: string;
  fotogramas?: number;
  distribucion?: "equilibrada" | "fila" | "columna";
  vista?: VistaSprite;
  direccion?: DireccionSprite;
  accion?: AccionSprite;
  /** A qué personaje se cuelga. Vacío en la primera: la crea. */
  personajeId?: string;
  /** De qué animación se hereda la cara. */
  refAnimacionId?: string;
  refCuadro?: "primero" | "ultimo" | "medio";
  nombrePersonaje?: string;
  descripcionPersonaje?: string;
  /**
   * Rehacer ESTA animación en vez de crear otra.
   *
   * Es «editar con IA» sobre un sprite ya guardado: se cambia el prompt o el
   * número de cuadros y la versión nueva SUSTITUYE a la vieja. Sin esto cada
   * intento dejaba una animación más colgando, la biblioteca se llenaba de
   * «Pescador 1, 2, 3» y los montajes seguían usando la primera, que era la
   * que se quería tirar.
   */
  rehacerAnimacionId?: string;
  /**
   * Cómo se llama ESTA animación en la biblioteca.
   *
   * Sin esto el nombre salía del prompt entero, que empieza por el personaje:
   * las cinco animaciones del pescador se llamaban «Pescador viejo con sombrero
   * de paja» y en la lista no había forma de distinguirlas. El nombre sale de
   * la ACCIÓN, que es lo que cambia entre una y otra.
   */
  nombre?: string;
}

/** Una acción de la tanda, tal y como se escribe en el formulario. */
export interface PasoTanda {
  id: string;
  /** «pescando sentado en la orilla», «se levanta y se da la vuelta»… */
  que: string;
  fotogramas: number;
  vista: VistaSprite;
  direccion: DireccionSprite;
  accion: AccionSprite;
}

export const MAX_PASOS_TANDA = 8;

/**
 * El tope de cuadros de UNA animación.
 *
 * Sale del generador de imagen, no de un capricho: la hoja es UNA imagen
 * partida en rejilla, así que cuantos más cuadros, más pequeño sale el bicho en
 * cada celda. Doce es lo que acepta la ruta de sprites.
 *
 * Estaba escrito en tres sitios con tres números distintos —12 en el campo, 10
 * al normalizar el plan de la IA, 12 en la ruta—, así que pedir 11 se quedaba
 * en 10 sin decir nada y parecía que el campo no dejaba escribir. Ahora es esta
 * constante y punto.
 */
export const MAX_CUADROS = 12;

/**
 * Lo más largo que puede ser el prompt de una animación.
 *
 * Lo fijan las dos rutas que lo reciben —la que dibuja y la que guarda—, las
 * dos en 400. Sumar personaje (200) y acción (200) se pasaba por dos letras, y
 * el resultado era pagar la imagen y que el guardado la rechazara.
 */
export const MAX_PROMPT = 400;

/** Un paso vacío con valores que ya funcionan. */
export function pasoNuevo(id: string): PasoTanda {
  return { id, que: "", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "otro" };
}

/**
 * El prompt de cada animación.
 *
 * La descripción del personaje va DELANTE y la acción detrás, siempre en el
 * mismo orden. No es estilo: los modelos de imagen pesan mucho más lo que
 * viene primero, y si la acción encabeza el prompt se obtiene «alguien
 * pescando» —otra persona cada vez— en vez de «este señor, pescando».
 */
export function promptDelPaso(personaje: string, paso: PasoTanda): string {
  const quien = personaje.trim().replace(/[.,\s]+$/, "");
  const que = paso.que.trim().replace(/^[.,\s]+/, "");
  if (!quien) return que.slice(0, MAX_PROMPT);
  if (!que) return quien.slice(0, MAX_PROMPT);
  // El tope no es decorativo: las dos rutas que reciben esto —la que dibuja y
  // la que guarda— rechazan por encima de 400, y el fallo salía DESPUÉS de
  // pagar la imagen, con un «Proyecto incompleto o inválido» que no decía qué
  // campo era. Con 200 de personaje y 200 de acción se llegaba a 402.
  return `${quien}, ${que}`.slice(0, MAX_PROMPT);
}

/**
 * El nombre corto de una animación, sacado de lo que HACE.
 *
 * Se corta por la primera coma: «se levanta y recoge la caña» se queda entero,
 * pero «camina de perfil hacia la izquierda, con la caña al hombro» se queda en
 * lo primero, que es lo que la distingue de las demás en una lista.
 */
export function nombreDeAccion(que: string): string {
  const limpio = que.trim().split(/[,;.]/)[0].trim().slice(0, 60);
  if (!limpio) return "Animación";
  return limpio[0].toLocaleUpperCase("es") + limpio.slice(1);
}

/**
 * Cómo se llama el personaje EN LA BIBLIOTECA.
 *
 * No es el prompt. El prompt es una frase larga en inglés con la ropa y el
 * estilo de dibujo —«old fisherman with a straw hat and worn blue jacket,
 * anime style, clean cel shading»— y cortarla a sesenta letras deja en la
 * lista un «…blue jacket, anime s» que no se puede ni leer. Se prefiere la
 * descripción corta si la hay, y si no, lo que va antes de la primera coma.
 */
export function nombreDePersonaje(personaje: string, descripcion?: string): string {
  const fuente = (descripcion?.trim() || personaje).trim();
  const corto = fuente.split(/[,;]/)[0].trim().slice(0, 60);
  if (!corto) return "Personaje";
  return corto[0].toLocaleUpperCase("es") + corto.slice(1);
}

/**
 * Los encargos en orden, ya encadenados.
 *
 * El primero crea el personaje (sin `personajeId`) y los demás se cuelgan de
 * él. La referencia de cara es SIEMPRE la animación inmediatamente anterior y
 * su ÚLTIMO cuadro: así la pose final de una enlaza con la inicial de la
 * siguiente, que es lo que hace que la secuencia se pueda reproducir seguida
 * sin un salto en medio.
 *
 * `idsPrevios` son las animaciones ya generadas de esta misma tanda; se pasan
 * al ir avanzando, porque hasta que el servidor no contesta no existe el id.
 */
export function encargosDeTanda(opts: {
  personaje: string;
  descripcion?: string;
  pasos: PasoTanda[];
  /** Si ya existe el personaje, para colgarle la tanda entera. */
  personajeId?: string;
  /** Y de qué animación suya hereda la cara la PRIMERA de la tanda. */
  refInicialId?: string;
}): EncargoSprite[] {
  const utiles = opts.pasos.filter((p) => p.que.trim().length >= 3).slice(0, MAX_PASOS_TANDA);
  return utiles.map((p, i) => ({
    que: promptDelPaso(opts.personaje, p),
    fotogramas: p.fotogramas,
    vista: p.vista,
    direccion: p.direccion,
    accion: p.accion,
    // El id real de las siguientes lo pone quien ejecuta, con lo que devolvió
    // la anterior; aquí solo se marca la primera, que es la única que se sabe.
    personajeId: i === 0 ? opts.personajeId : undefined,
    refAnimacionId: i === 0 ? opts.refInicialId : undefined,
    refCuadro: "ultimo" as const,
    nombre: nombreDeAccion(p.que),
    nombrePersonaje: nombreDePersonaje(opts.personaje, opts.descripcion),
    descripcionPersonaje: (opts.descripcion?.trim() || opts.personaje.trim()).slice(0, 600),
  }));
}

/**
 * El encargo `i` con la cadena ya resuelta.
 *
 * Se llama justo antes de mandar cada uno, cuando ya se conocen los ids de los
 * anteriores. Separarlo de `encargosDeTanda` es lo que deja probar la cadena
 * entera sin ejecutarla.
 */
export function conCadena(
  encargo: EncargoSprite,
  anterior: { personajeId: string; animacionId: string } | null,
): EncargoSprite {
  if (!anterior) return encargo;
  return {
    ...encargo,
    personajeId: anterior.personajeId,
    refAnimacionId: anterior.animacionId,
    refCuadro: "ultimo",
  };
}

// ── El plan que escribe la IA ───────────────────────────────────────────────
//
// POR QUÉ HACE FALTA. La primera versión de esto te hacía escribir las cinco
// acciones a mano, una fila cada una, con sus desplegables. O sea, el mismo
// trabajo manual que la tanda venía a quitar, solo que en vertical. Lo natural
// es decir «un pescador que pesca, se levanta, se da la vuelta y se va
// caminando» y que el reparto en animaciones lo haga quien sabe hacerlo.
//
// Y HAY UN PASO INTERMEDIO A PROPÓSITO: el plan se enseña ANTES de generar
// nada. Planear es una llamada de texto —céntimos, un segundo—; generar son N
// imágenes que se pagan. Encadenarlo directo convertiría una frase mal escrita
// en ocho imágenes tiradas. Así la IA propone, tú corriges lo que no encaja, y
// entonces se paga.

const VISTAS: VistaSprite[] = ["lateral", "frontal", "trasera", "superior", "libre"];
const DIRECCIONES: DireccionSprite[] = [
  "derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna",
];
const ACCIONES: AccionSprite[] = [
  "quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro",
];

const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const num = (v: unknown, def: number) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : def;
};
const enUno = <T extends string>(v: unknown, ops: T[], def: T): T =>
  (typeof v === "string" && (ops as string[]).includes(v) ? v as T : def);

export interface PlanTanda {
  personaje: string;
  descripcion: string;
  pasos: PasoTanda[];
}

/**
 * Deja el plan del modelo en algo que el taller pueda ejecutar.
 *
 * No es paranoia de esquema: un modelo que devuelve `"vista": "de lado"` o
 * doce fotogramas para un parpadeo no rompe nada visible aquí —rompe la imagen
 * que se paga treinta segundos después—, y para entonces ya no se sabe de
 * dónde salió el valor raro.
 */
export function normalizarPlan(crudo: any, idFn: (i: number) => string = (i) => `ia${i}`): PlanTanda {
  const personaje = String(crudo?.personaje ?? "").trim().slice(0, 200);
  const pasosCrudos = Array.isArray(crudo?.pasos) ? crudo.pasos : [];
  const pasos: PasoTanda[] = [];
  for (const p of pasosCrudos.slice(0, MAX_PASOS_TANDA)) {
    const que = String(p?.que ?? "").trim().slice(0, 200);
    if (que.length < 3) continue;
    pasos.push({
      id: idFn(pasos.length),
      que,
      // Se acota aquí y no solo en el prompt: lo que el modelo promete y lo que
      // devuelve no siempre coincide.
      fotogramas: Math.round(acotar(num(p?.fotogramas, 6), 1, MAX_CUADROS)),
      vista: enUno(p?.vista, VISTAS, "lateral"),
      direccion: enUno(p?.direccion, DIRECCIONES, "derecha"),
      accion: enUno(p?.accion, ACCIONES, "otro"),
    });
  }
  return {
    personaje,
    descripcion: String(crudo?.descripcion ?? "").trim().slice(0, 600) || personaje,
    pasos,
  };
}

/**
 * Lo que se le cuenta al modelo de texto. Vive aquí y no en la ruta porque son
 * las mismas listas que valida `normalizarPlan`: separarlas es garantizar que
 * un día se pida un valor que luego se descarta.
 */
export function reglasDelPlan() {
  return {
    formato: {
      personaje: "descripción del personaje en INGLÉS, frase nominal, sin verbo conjugado: quién es, qué lleva puesto y el estilo de dibujo",
      descripcion: "la misma idea en español, corta, para la biblioteca",
      pasos: [{ que: "qué hace, en INGLÉS, frase nominal", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "caminar" }],
    },
    vista: VISTAS,
    direccion: DIRECCIONES,
    accion: ACCIONES,
    reglas: [
      `Entre 2 y ${MAX_PASOS_TANDA} pasos. Menos es mejor que de más: cada paso es una imagen que se paga.`,
      `fotogramas: entre 1 y ${MAX_CUADROS}. Cuantos más, más pequeño sale el personaje en cada celda.`,
      "«personaje» NO lleva la acción: es solo quién es. La acción va en cada paso, porque el personaje se antepone a todos.",
      "Los pasos van en ORDEN CRONOLÓGICO: la pose final de uno enlaza con la inicial del siguiente.",
      "Si el personaje cambia de sentido a mitad, mete un paso «girar» ANTES y cambia «direccion» en los pasos posteriores. Sin ese paso, el giro se ve como un salto.",
      "fotogramas: 4 para un giro o un gesto corto, 6 para algo quieto o un movimiento suave, 8 para caminar o correr.",
      "vista «lateral» para lo que se desplaza; «frontal» solo si mira al espectador (saludar, hablar).",
      "accion debe ser la de la lista que más se parezca; «otro» si ninguna encaja.",
      "Nada de fondo, suelo, sombra ni escenario en los textos: eso ya lo prohíbe el generador de imagen y repetirlo estorba.",
    ],
  };
}

/**
 * Ejemplos que se pueden meter de un toque, para cuando no se quiere gastar ni
 * la llamada de texto del planificador.
 *
 * No son «plantillas de escena» de las que borran tu trabajo: son listas de
 * ACCIONES que se copian en el formulario y se editan.
 *
 * EL TEXTO VA EN INGLÉS aunque la interfaz esté en español, y no es un
 * descuido: estas frases se pegan dentro del prompt del generador de imagen,
 * que va entero en inglés. Mezclar los dos idiomas en la misma instrucción
 * empeora el resultado. Los NOMBRES de las recetas sí van en español: esos se
 * leen en pantalla y no salen del navegador.
 */
export const RECETAS: { id: string; nombre: string; pasos: Omit<PasoTanda, "id">[] }[] = [
  {
    id: "pescador",
    nombre: "Pesca, se va y se queda pensando",
    pasos: [
      { que: "sitting on the riverbank, fishing, rod held still", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "quieto" },
      { que: "standing up and reeling in the rod", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "otro" },
      { que: "turning around to face the opposite way", fotogramas: 4, vista: "lateral", direccion: "derecha", accion: "girar" },
      { que: "walking in profile, rod over the shoulder", fotogramas: 8, vista: "lateral", direccion: "izquierda", accion: "caminar" },
      { que: "standing still, thinking, one hand on the chin", fotogramas: 6, vista: "lateral", direccion: "izquierda", accion: "quieto" },
    ],
  },
  {
    id: "andar",
    nombre: "Quieto, camina, corre",
    pasos: [
      { que: "standing still, breathing", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "quieto" },
      { que: "walking in profile", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "caminar" },
      { que: "running in profile", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "correr" },
    ],
  },
  {
    id: "saludo",
    nombre: "Llega, se para y saluda",
    pasos: [
      { que: "walking in profile to the right", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "caminar" },
      { que: "stopping and turning to face the viewer", fotogramas: 4, vista: "lateral", direccion: "derecha", accion: "girar" },
      { que: "facing the viewer, waving a hand", fotogramas: 6, vista: "frontal", direccion: "frente", accion: "quieto" },
    ],
  },
];
