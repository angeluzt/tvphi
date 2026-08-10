// Lo que la biblioteca de sprites tiene en común entre servidor y navegador.
//
// Vive aparte porque una ruta de Next solo puede exportar sus verbos: si estos
// tipos y estos topes estuvieran en la ruta, no se podrían importar desde el
// panel, y acabarían copiados en dos sitios que se separan a la primera.

export type VistaSprite = "lateral" | "frontal" | "trasera" | "superior" | "libre";
export type DireccionSprite = "derecha" | "izquierda" | "frente" | "espaldas" | "arriba" | "abajo" | "ninguna";
export type AccionSprite = "quieto" | "caminar" | "correr" | "volar" | "flotar" | "nadar" | "caer" | "girar" | "otro";
export type AnclajeSprite = "centro" | "pies";

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
  /** Cómo está dibujado, no hacia dónde lo moverá una escena concreta. */
  vista: VistaSprite;
  direccion: DireccionSprite;
  accion: AccionSprite;
  /** Centro para objetos voladores; pies para personajes apoyados en superficies. */
  anclaje: AnclajeSprite;
  /** Si existe, se puede reabrir la plantilla editable (hoja/celdas) en el taller. */
  animationId?: string | null;
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

// ── Nombres que quepan en la biblioteca ─────────────────────────────────────
//
// EL PROBLEMA. Cuando nadie escribe un nombre, se usaba el prompt cortado a 60
// letras. Los prompts que funcionan son largos a propósito —«Beautiful
// anime-aesthetic girl sprite sheet of the same full-body character, standing
// and facing forward while gently breathing. Clean 2D cel shading…»— así que la
// biblioteca acababa siendo una lista de párrafos cortados a media palabra,
// todos empezando igual y por tanto imposibles de distinguir de un vistazo.
//
// LA IDEA. Lo que identifica un sprite está al PRINCIPIO del prompt, antes de
// la primera coma; el resto son instrucciones de dibujo que se repiten en todos.
// Así que se corta ahí, se tira la palabrería técnica y se deja algo corto.

/**
 * Ruido que aparece en casi todos los prompts y no distingue a nadie.
 * Se quita por completo, no se acorta: «sprite sheet of the same full-body
 * character» es exactamente igual en los doce sprites que tengas.
 */
const RELLENO = [
  /\bsprite\s*-?\s*sheet\b/gi,
  /\bof\s+the\s+same\b/gi,
  /\bfull[-\s]?body\b/gi,
  /\bcharacter\b/gi,
  /\bclean\s+2d\s+cel\s+shading\b/gi,
  /\btransparent\s+background\b/gi,
  /\bequal[-\s]?size\s+cells?\b/gi,
  /\bno\s+scenery\b/gi,
  /\bside\s+view\b/gi,
  /\bfront\s+view\b/gi,
];

const TOPE_NOMBRE = 38;

/**
 * Un nombre corto y legible a partir de lo que se le pidió al modelo.
 *
 * No pretende ser bonito, pretende ser DISTINGUIBLE: es lo que se lee en una
 * lista de treinta sprites. Si al limpiar no queda nada aprovechable, se cae al
 * prompt crudo recortado, que es feo pero al menos dice algo.
 */
export function nombreCorto(que: string, porDefecto = "Sprite"): string {
  const crudo = (que ?? "").trim();
  if (!crudo) return porDefecto;

  // La primera oración: lo que viene después son instrucciones de dibujo.
  const primera = crudo.split(/[.;\n]|,\s+(?=[a-z])/)[0] ?? crudo;

  let limpio = primera;
  for (const r of RELLENO) limpio = limpio.replace(r, " ");
  limpio = limpio.replace(/\s{2,}/g, " ").replace(/^[\s,\-–—]+|[\s,\-–—]+$/g, "");

  // Si la limpieza se lo comió todo, mejor el original que una cadena vacía.
  const base = limpio.length >= 3 ? limpio : primera.trim();
  if (!base) return porDefecto;

  const corto = recortarPalabras(base, TOPE_NOMBRE);
  return corto.charAt(0).toLocaleUpperCase("es") + corto.slice(1);
}

/** Recorta sin partir palabras: «Beautiful anime…» y no «Beautiful anim…». */
function recortarPalabras(s: string, max: number): string {
  if (s.length <= max) return s;
  const trozo = s.slice(0, max);
  const corte = trozo.lastIndexOf(" ");
  // Si la primera palabra ya pasa del tope, no queda otra que cortarla.
  return (corte > max * 0.5 ? trozo.slice(0, corte) : trozo).replace(/[\s,\-–—]+$/, "") + "…";
}

/**
 * Lo que se enseña debajo del nombre: el prompt, pero acotado.
 *
 * Se deja más largo que el nombre porque aquí sí importa poder leer en qué se
 * diferencian dos sprites parecidos, pero no tanto como para que una tarjeta
 * ocupe media pantalla.
 */
export const resumenPrompt = (que: string, max = 120) =>
  recortarPalabras((que ?? "").trim().replace(/\s+/g, " "), max);
