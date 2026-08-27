// El techo de los efectos de sonido.
//
// EL PROBLEMA. Un efecto entraba al 80% y la narración desaparecía debajo. No
// es una cuestión de gusto: los archivos de la biblioteca están masterizados
// alto —cerca de -14 dBFS— y una voz de TTS sale bastante más baja, así que un
// número que en el editor parece «normal» tapa la frase entera. Y el que monta
// el capítulo no lo oye mientras trabaja: lo oye el que ve el vídeo.
//
// LOS DOS NIVELES.
//
//   TOPE (12%) — lo más alto que puede sonar un efecto, pase lo que pase. Es
//   para el golpe puntual: la explosión, el portazo, el rugido. Dura dos
//   segundos y tiene que pegar, pero por encima de aquí se come la voz.
//
//   BAJO (4%) — el de lo que suena TODO EL RATO por debajo: la lluvia, la
//   taberna, el latido, un ambiente en bucle. Compite con la narración durante
//   la escena entera, no durante dos segundos, así que su sitio es mucho más
//   abajo. Al 12% una lluvia continua ya molesta, y al 5% todavía se notaba.
//
// POR QUÉ SE FUERZA Y NO SE SUGIERE. Porque los volúmenes entran por cuatro
// puertas —lo que pone la IA al escribir el capítulo, lo que trae un proyecto
// viejo, lo que arrastra alguien en la barra y lo que cambia una excepción de
// otra toma— y basta que una se salte el criterio para que el capítulo salga
// con la voz tapada. Se acota en todas.
//
// LA MÚSICA NO ENTRA EN ESTO, y hay que decirlo porque una pista de música
// puede vivir DENTRO de `sfx`: es como se pone música por escena en vez de una
// cama global. Ese caso conserva su regla de siempre (VOL_MUSICA, 12%), porque
// la música ya se aparta sola mientras se narra —a un tercio— y su número es el
// de los silencios, no el de la mezcla con voz. Meterla en el cajón de los
// ambientes la habría bajado al techo de los ambientes sin que nadie lo pidiera.
//
// Se distingue por el id: `lib:` es una pista de música y `son:` un sonido.

/** Lo más alto que puede sonar un efecto. */
export const VOL_SFX_MAX = 0.12;

/** Lo que suena de continuo debajo de la escena: ambientes y bucles. */
export const VOL_SFX_BAJO = 0.04;

/** El techo de una pista de música metida como bucle de una escena. */
export const VOL_MUSICA_EN_ESCENA = 0.12;

/** `lib:` es el prefijo de la biblioteca de música (ver `musica.ts`). */
export const esPistaDeMusica = (audioId?: string | null) =>
  !!audioId && audioId.startsWith("lib:");

/** El techo de un efecto, para pintar la barra hasta ahí y no más. */
export function techoSfx(bucle: boolean, esMusica = false): number {
  if (esMusica) return VOL_MUSICA_EN_ESCENA;
  return bucle ? VOL_SFX_BAJO : VOL_SFX_MAX;
}

/**
 * El volumen que de verdad se aplica.
 *
 * `bucle` no es un detalle de reproducción, es lo que decide el techo: lo que
 * se repite bajo toda la escena vive en 5%, y lo puntual puede llegar a 12%.
 */
export function topeSfx(volumen: unknown, bucle: boolean, esMusica = false): number {
  const techo = techoSfx(bucle, esMusica);
  const v = Number(volumen);
  if (!Number.isFinite(v) || v < 0) return techo;
  return Math.min(v, techo);
}

/**
 * El volumen con el que entra un efecto recién puesto.
 *
 * Entra ya EN SU SITIO, no en el máximo: un ambiente al 4% se oye desde el
 * primer play sin tener que ir a buscar la barra, y un golpe al 12% pega. Si
 * hace falta menos, se baja; para arriba no hay sitio.
 */
export const volumenInicialSfx = (bucle: boolean, esMusica = false) =>
  techoSfx(bucle, esMusica);

/**
 * Una excepción de volumen desde otra toma, acotada.
 *
 * `null` significa «déjalo como venía» y tiene que seguir significando eso:
 * convertirlo en un número aquí borraría la diferencia entre no tocar nada y
 * poner el volumen a cero.
 */
export function topeOverride(
  volumen: number | null | undefined, bucle: boolean, esMusica = false,
): number | null {
  if (volumen === null || volumen === undefined) return null;
  return topeSfx(volumen, bucle, esMusica);
}
