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
  if (!quien) return que;
  if (!que) return quien;
  return `${quien}, ${que}`;
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
    nombrePersonaje: opts.personaje.trim().slice(0, 60) || undefined,
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

/**
 * Ejemplos que se pueden meter de un toque.
 *
 * No son «plantillas de escena» de las que borran tu trabajo: son listas de
 * ACCIONES que se copian en el formulario y se editan. Lo que cuesta escribir
 * no es el personaje —eso lo tiene claro quien lo pide— sino acordarse de que
 * una secuencia necesita un paso de transición entre dos poses lejanas.
 */
export const RECETAS: { id: string; nombre: string; pasos: Omit<PasoTanda, "id">[] }[] = [
  {
    id: "pescador",
    nombre: "Pesca, se va y se queda pensando",
    pasos: [
      { que: "sentado en la orilla, pescando con la caña quieta", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "quieto" },
      { que: "se levanta y recoge la caña", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "otro" },
      { que: "se da la vuelta hacia la izquierda", fotogramas: 4, vista: "lateral", direccion: "derecha", accion: "girar" },
      { que: "camina de perfil hacia la izquierda", fotogramas: 8, vista: "lateral", direccion: "izquierda", accion: "caminar" },
      { que: "parado de perfil, pensando, con la mano en la barbilla", fotogramas: 6, vista: "lateral", direccion: "izquierda", accion: "quieto" },
    ],
  },
  {
    id: "andar",
    nombre: "Quieto, camina, corre",
    pasos: [
      { que: "de pie, respirando, quieto", fotogramas: 6, vista: "lateral", direccion: "derecha", accion: "quieto" },
      { que: "caminando de perfil", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "caminar" },
      { que: "corriendo de perfil", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "correr" },
    ],
  },
  {
    id: "saludo",
    nombre: "Llega, se para y saluda",
    pasos: [
      { que: "caminando de perfil hacia la derecha", fotogramas: 8, vista: "lateral", direccion: "derecha", accion: "caminar" },
      { que: "se detiene y se gira hacia el frente", fotogramas: 4, vista: "lateral", direccion: "derecha", accion: "girar" },
      { que: "de frente, saludando con la mano", fotogramas: 6, vista: "frontal", direccion: "frente", accion: "quieto" },
    ],
  },
];
