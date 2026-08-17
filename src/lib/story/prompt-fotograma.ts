// Prompt para UN fotograma de foto viva.
//
// TRES FALLOS QUE ESTE TEXTO TIENE QUE EVITAR, y los tres se vieron en pruebas:
//
// 1. LA REJILLA. Si le dices «frame of a looping animation», gpt-image pinta un
//    storyboard 2×2: cuatro escenas dentro de una imagen. Eso es una hoja de
//    sprites, no una foto viva. Se prohíbe con todas las letras.
//
// 2. NO SABER QUÉ MOVER. Sin decirle qué se mueve, cada cuadro elige una cosa
//    distinta: en uno tiembla el agua, en el siguiente cambia una nube y en el
//    tercero se mueve una persona. Eso no es una animación, es una imagen
//    inquieta. Por eso `movimiento` importa tanto y por eso ahora la IA que
//    escribe el capítulo tiene que rellenarlo.
//
// 3. NO SABER POR DÓNDE VA. Cada cuadro se pedía con EL MISMO texto, así que el
//    modelo no tenía forma de saber si le tocaba el principio o el final del
//    gesto: devolvía saltos al azar alrededor de la foto en vez de un
//    recorrido. Ahora se le dice en qué punto del ciclo está.
//
// SOBRE LAS DOS IMÁGENES DE REFERENCIA. Encadenar —dibujar cada cuadro a partir
// del anterior— da movimiento continuo, pero cada edición reescribe la foto
// entera y los errores se acumulan: al quinto cuadro la escena ha derivado de
// color, de luz y de detalle. Anclar siempre a la original evita la deriva pero
// da N variaciones sueltas en vez de un movimiento. Mandando LAS DOS se tienen
// las dos cosas: la original manda en la identidad y el cuadro anterior manda
// en el movimiento. `conAncla` es lo que enciende ese texto.

export interface OpcionesFotograma {
  /** Cómo es la escena. Es CONTEXTO: no se vuelve a dibujar desde cero. */
  escena: string;
  /** Qué se mueve, en una frase. Lo mejor que le puedes dar. */
  movimiento?: string;
  /** Qué cuadro del ciclo es (1..total-1). El 0 es la foto que ya existe. */
  indice?: number;
  total?: number;
  /** Se mandan dos imágenes: la original de referencia y el cuadro anterior. */
  conAncla?: boolean;
}

const POR_DEFECTO =
  "one single small natural motion that is already implied in the picture "
  + "(water rippling, cloth or hair swaying, leaves trembling, fire flickering, steam rising, a slow breath)";

export function promptFotograma(opts: OpcionesFotograma): string {
  const que = (opts.movimiento ?? "").trim() || POR_DEFECTO;
  const escena = opts.escena.trim();
  const n = opts.total ?? 0;
  const i = opts.indice ?? 0;

  const partes: string[] = [];

  // La descripción va marcada como CONTEXTO y NO la primera. Puesta arriba y a
  // secas, el modelo la lee como el encargo —«dibuja esta escena»— y devuelve
  // una escena nueva parecida en vez de una edición de la que tiene delante.
  partes.push(
    opts.conAncla
      ? "You are given TWO images. IMAGE 1 is the ORIGINAL scene: it is the authority on identity — composition, framing, characters, faces, colors, lighting and style must match it exactly. IMAGE 2 is the PREVIOUS frame of the animation: it is the authority on where the motion currently is. Continue from IMAGE 2, but correct any drift back towards IMAGE 1."
      : "Edit the input photograph. It is the authority on composition, framing, characters, colors, lighting and style.",
  );

  partes.push("Return ONE complete picture that fills the entire canvas, at the same aspect ratio as the input.");

  if (n >= 2 && i >= 1) {
    // El punto del ciclo. Con vaivén el bucle va y vuelve, así que el último
    // cuadro NO tiene que enlazar con el primero: tiene que ser el extremo del
    // gesto. Decírselo así evita que intente «cerrar» y deshaga el movimiento
    // justo al final, que es como se pierde la mitad del recorrido.
    const pct = Math.round((i / (n - 1)) * 100);
    partes.push(
      `This is frame ${i + 1} of ${n} in a short animation. The motion advances progressively from frame 1 to frame ${n}: this frame is at ${pct}% of the full movement.`
      + (i === n - 1
        ? " This is the LAST frame: the motion is at its furthest point. Do not return it to the starting position — the animation plays back and forth."
        : ""),
    );
  }

  partes.push(`THE ONLY THING THAT CHANGES IS: ${que}.`);
  partes.push(
    "Everything else is identical: same camera, same crop, same people in the same places and poses, same clothes, same objects, same background, same time of day.",
    "Keep EXACTLY the same exposure, brightness, contrast, white balance and color grade. Do not relight, do not restyle, do not sharpen, do not add or remove anything.",
  );
  partes.push(
    "FORBIDDEN: sprite sheet, storyboard, comic panels, contact sheet, filmstrip, collage, split screen, 2x2 grid, 4 images, multiple frames in one picture, borders, captions, text, watermark.",
    "If you draw more than one scene in the image, the result is unusable.",
  );
  if (escena) partes.push(`CONTEXT ONLY — what the scene shows: ${escena}`);

  return partes.join("\n\n");
}
