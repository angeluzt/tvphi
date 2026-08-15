// Prompt para UN fotograma de foto viva.
//
// El fallo típico: si le dices «frame of a looping animation», gpt-image pinta
// un storyboard 2×2 (cuatro escenas en una sola imagen). Eso es una hoja de
// sprites, no una foto viva. Mesa de luz son N PNG enteros, uno por instante.
// Aquí se prohíbe la rejilla con todas las letras.

export function promptFotograma(opts: {
  escena: string;
  movimiento?: string;
}): string {
  const que = (opts.movimiento ?? "").trim()
    || "a very small natural motion already in the picture (water, cloth, leaves, fire flicker, breathing)";
  const escena = opts.escena.trim();
  return [
    escena,
    "Edit the input photograph. Return ONE complete picture that fills the entire canvas.",
    "Same camera, same people, same composition, same lighting. Only a tiny change of motion:",
    que + ".",
    "FORBIDDEN: sprite sheet, storyboard, comic panels, contact sheet, filmstrip, collage, split screen, 2x2 grid, 4 images, multiple frames in one picture, borders, captions, text.",
    "If you draw more than one scene in the image, the result is unusable.",
  ].join("\n\n");
}
