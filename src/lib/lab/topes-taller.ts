// Los topes del taller de sprites, en un solo sitio.
//
// POR QUÉ ESTÁN JUNTOS. Estaban repetidos en tres archivos: la ruta que guarda,
// la que genera la imagen y el módulo que persiste el borrador. Tres constantes
// con el mismo valor sobreviven bien hasta que alguien cambia una, y entonces
// la aplicación se comporta de dos maneras según por dónde entres. Ya pasó con
// los fotogramas —12 en un sitio, 10 en otro— y el síntoma fue «no me deja
// poner once» sin ninguna explicación.
//
// PARA QUÉ SIRVEN. Para que una cuenta cualquiera no llene el disco del
// despliegue ella sola: cada animación guarda hasta tres imágenes en la base de
// datos y nadie más las va a limpiar. Es una defensa contra un desconocido, no
// una regla de producto.
//
// Y POR ESO QUIEN ADMINISTRA NO LOS TIENE. El despliegue es suyo, el disco es
// suyo y la factura es suya; ponerle un tope de veinte personajes en su propio
// taller es tratarle como a un visitante. Los mismos correos que ya están
// exentos del cupo de IA (STORY_QUOTA_EXEMPT_EMAILS) lo están de esto.

import { esAdminHistorias } from "@/lib/story/cupo";

/** Cuántos personajes distintos puede tener una cuenta normal. */
export const MAX_PERSONAJES = 20;

/** Y cuántas animaciones cuelgan de cada uno. */
export const MAX_ANIMACIONES = 30;

/** Lo que puede ocupar en total, contando hojas, tiras y páginas de atlas. */
export const MAX_BYTES_TALLER = 120 * 1024 * 1024;

/** Sin tope. `Infinity` compara bien con todo y no obliga a repartir `if`s. */
const SIN_TOPE = Number.POSITIVE_INFINITY;

export interface TopesTaller {
  personajes: number;
  animaciones: number;
  bytes: number;
  /** Para poder decirlo en pantalla en vez de que parezca que no hay reglas. */
  ilimitado: boolean;
}

/**
 * Los topes que le tocan a este correo.
 *
 * Se pasa el correo y no un booleano a propósito: quien llama no tiene que
 * acordarse de preguntar si es admin, y así no se puede olvidar en uno de los
 * tres sitios —que es exactamente como se rompen estas cosas—.
 */
export function topesDe(email: string): TopesTaller {
  if (esAdminHistorias(email)) {
    return { personajes: SIN_TOPE, animaciones: SIN_TOPE, bytes: SIN_TOPE, ilimitado: true };
  }
  return {
    personajes: MAX_PERSONAJES,
    animaciones: MAX_ANIMACIONES,
    bytes: MAX_BYTES_TALLER,
    ilimitado: false,
  };
}

/**
 * El aviso de que no cabe otro personaje.
 *
 * Dice QUÉ HACER, que es lo que le faltaba: «Ya tienes 20 personajes.» a secas
 * deja al usuario mirando la pantalla sin ninguna salida, y encima aparecía
 * después de haber pagado la imagen.
 */
export const sinSitioPersonajes = (tope: number) =>
  `Ya tienes ${tope} personajes, que es el tope. Borra alguno en la biblioteca de abajo, `
  + "o elige uno de los que ya tienes para colgarle esta animación en vez de crear otro.";

/** Y el de que un personaje ya no admite más animaciones. */
export const sinSitioAnimaciones = (tope: number) =>
  `Ese personaje ya tiene ${tope} animaciones, que es el tope. Borra alguna suya, `
  + "o crea otro personaje para las siguientes.";

/** Cuando lo que se acaba es el espacio, no la cuenta. */
export const sinEspacio = (bytes: number) =>
  `Tu biblioteca alcanzó ${Math.round(bytes / (1024 * 1024))} MB, que es el tope. `
  + "Borra sprites que ya no uses para hacer sitio.";
