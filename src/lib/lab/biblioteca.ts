// Lo que la biblioteca de sprites tiene en común entre servidor y navegador.
//
// Vive aparte porque una ruta de Next solo puede exportar sus verbos: si estos
// tipos y estos topes estuvieran en la ruta, no se podrían importar desde el
// panel, y acabarían copiados en dos sitios que se separan a la primera.

/** Un sprite de la biblioteca, sin los bytes. Es lo que va en el listado. */
export interface SpriteMeta {
  id: string;
  nombre: string;
  que: string;
  fotogramas: number;
  fps: number;
  ancho: number;
  alto: number;
  bytes: number;
  creadoEn: string;
}

/**
 * El tope de lo que se acepta guardar.
 *
 * Doce fotogramas de un bicho recortado son unos pocos cientos de kilobytes;
 * cuatro megas es holgado incluso para calidad alta. El tope no está por
 * avaricia de disco: sin él, esta ruta es un sitio donde subir lo que sea.
 */
export const TOPE_BYTES = 4 * 1024 * 1024;

/** Cuántos caben. Pasado esto, elegir en la biblioteca deja de ser cómodo. */
export const TOPE_SPRITES = 200;

/** La firma de un PNG. Ocho bytes que no se pueden fingir por accidente. */
export const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const esPng = (b: Uint8Array) =>
  b.length > 8 && FIRMA_PNG.every((v, i) => b[i] === v);

/** «231 KB», para poder decir lo que ocupa sin hacer cuentas mentales. */
export const pesoLegible = (b: number) =>
  b < 1024 ? `${b} B`
    : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB`
      : `${(b / (1024 * 1024)).toFixed(1)} MB`;

/** De dónde se baja el PNG de un sprite. Un solo sitio para no equivocarse. */
export const urlSprite = (id: string) => `/api/story/lab/sprites/${id}`;
