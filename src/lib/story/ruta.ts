// Dónde vive el editor dentro de la URL.
//
// POR QUÉ ESTO ES UN MÓDULO Y NO TRES LÍNEAS DENTRO DEL COMPONENTE. Porque se
// rompió, y se rompió de la peor manera: en silencio.
//
// El editor reescribe la dirección al abrir un capítulo, para que recargar no
// te devuelva al índice. Esa reescritura mandaba SIEMPRE a «/story», aunque
// hubieras entrado por «/lab/historias». Mientras no recargaras daba igual —el
// componente sigue montado y sabe que está en pruebas—, pero al recargar, o al
// volver al capítulo por esa dirección, caías en el editor normal: sin panel de
// medios, sin el aviso de lo que falta por montar y, lo peor, con la fase de
// medios del montaje automático saltada sin decir nada. El síntoma era una
// escena marcada como foto viva que nunca se movía y ningún sitio donde
// enterarse de por qué.
//
// Sacarlo aquí lo hace comprobable sin levantar el editor entero.

export const RUTA_STORY = "/story";
export const RUTA_LAB = "/lab/historias";

/**
 * En qué sección estamos, leído del camino actual.
 *
 * Se deduce del camino en vez de pasarlo por parámetro desde el componente: la
 * sección no cambia mientras el editor está abierto, y así ninguna de las
 * llamadas que reescriben la URL se puede olvidar de decirlo —que es
 * exactamente como se coló el fallo—.
 */
export function baseStory(pathname: string): string {
  return pathname.startsWith(RUTA_LAB) ? RUTA_LAB : RUTA_STORY;
}

/**
 * La dirección de una vista (índice / serie / capítulo), conservando la sección.
 *
 * `id` gana a `serie`: estando dentro de un capítulo, la serie ya no manda.
 */
export function storyPath(
  opts: { id?: string | null; serie?: string | null } = {},
  pathname = typeof window === "undefined" ? RUTA_STORY : window.location.pathname,
): string {
  const q = new URLSearchParams();
  if (opts.id) q.set("id", opts.id);
  else if (opts.serie) q.set("serie", opts.serie);
  const s = q.toString();
  const base = baseStory(pathname);
  return s ? `${base}?${s}` : base;
}
