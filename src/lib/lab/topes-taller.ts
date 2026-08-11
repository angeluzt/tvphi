// Los topes del taller de sprites, en un solo sitio.
//
// POR QUÉ. Estaban repetidos en tres archivos: la ruta que guarda, la que
// genera la imagen y el módulo que persiste el borrador. Tres constantes con el
// mismo valor sobreviven bien hasta que alguien cambia una, y entonces la
// aplicación se comporta de dos maneras según por dónde entres. Ya pasó con los
// fotogramas —12 en un sitio, 10 en otro— y el síntoma fue «no me deja poner
// once» sin ninguna explicación.

/** Cuántos personajes distintos puede tener una cuenta. */
export const MAX_PERSONAJES = 20;

/** Y cuántas animaciones cuelgan de cada uno. */
export const MAX_ANIMACIONES = 30;

/**
 * El aviso de que no cabe otro personaje.
 *
 * Dice QUÉ HACER, que es lo que le faltaba: «Ya tienes 20 personajes.» a secas
 * deja al usuario mirando la pantalla sin ninguna salida, y encima aparecía
 * después de haber pagado la imagen.
 */
export const SIN_SITIO_PERSONAJES =
  `Ya tienes ${MAX_PERSONAJES} personajes, que es el tope. Borra alguno en la biblioteca de abajo, `
  + "o elige uno de los que ya tienes para colgarle esta animación en vez de crear otro.";

/** Y el de que un personaje ya no admite más animaciones. */
export const SIN_SITIO_ANIMACIONES =
  `Ese personaje ya tiene ${MAX_ANIMACIONES} animaciones, que es el tope. Borra alguna suya, `
  + "o crea otro personaje para las siguientes.";
