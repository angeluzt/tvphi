// Paleta de lo que la IA puede gastar al escribir un capítulo.
//
// SIN ESTO, «generar una historia compleja» es un cheque en blanco: seis
// escenas en 2.5D más un par de APNG son decenas de imágenes. El interruptor
// no es cosmética —es el contrato de lo que se puede pagar.
//
// Lo apagado no se inventa en el JSON ni se ofrece después. Lo encendido se
// PUEDE usar; materializarlo sigue siendo un paso aparte.

export interface PaletaIa {
  /** Foto plana. Siempre encendida: es el suelo del resto. */
  still: true;
  /** Escena partida en láminas con profundidad. */
  paralaje: boolean;
  /** Foto viva: N fotogramas con cambios mínimos, en loop. */
  apng: boolean;
  /** Actores de la biblioteca / tiras de sprites. */
  sprites: boolean;
  /** Efectos del catálogo (fuego, lluvia, portal…). */
  vfx: boolean;
  /** Música de fondo en audioLayers. */
  musica: boolean;
}

export const PALETA_VACIA: PaletaIa = {
  still: true,
  paralaje: false,
  apng: false,
  sprites: false,
  vfx: true,
  musica: true,
};

const BOOL = (v: unknown, sino: boolean) => (typeof v === "boolean" ? v : sino);

/** Acepta basura y devuelve una paleta usable. Lo desconocido se apaga. */
export function normalizarPaleta(raw: unknown): PaletaIa {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    still: true,
    paralaje: BOOL(r.paralaje, false),
    apng: BOOL(r.apng, false),
    sprites: BOOL(r.sprites, false),
    vfx: BOOL(r.vfx, true),
    musica: BOOL(r.musica, true),
  };
}

export type MedioEscena = "still" | "apng" | "paralaje";

const MEDIOS: MedioEscena[] = ["still", "apng", "paralaje"];

/** El medio que pidió la IA, recortado a lo que la paleta permite. */
export function medioPermitido(pedido: unknown, paleta: PaletaIa): MedioEscena {
  const m = MEDIOS.includes(pedido as MedioEscena) ? (pedido as MedioEscena) : "still";
  if (m === "apng" && !paleta.apng) return "still";
  if (m === "paralaje" && !paleta.paralaje) return "still";
  return m;
}

/**
 * Lo que hay que decirle si puede usar foto viva.
 *
 * ESTO ES LO QUE FALTABA. Antes bastaba con marcar `"medio":"apng"` y el
 * servidor generaba seis cuadros con un texto genérico —«algún movimiento
 * pequeño»—, así que cada fotograma elegía mover una cosa distinta: en uno
 * temblaba el agua, en el siguiente cambiaba una nube, en el tercero se movía
 * una persona. El resultado no era una animación, era una imagen inquieta que
 * además parpadeaba. Ahora la escena que se marca como apng tiene que decir QUÉ
 * se mueve, con CUÁNTOS dibujos y a qué VELOCIDAD, que son las tres cosas que
 * no se pueden adivinar mirando solo el prompt.
 */
const INSTRUCCIONES_APNG = [
  "",
  "SI MARCAS UNA ESCENA COMO \"apng\", ES OBLIGATORIO SU OBJETO \"animacion\":",
  '  "animacion": {"movimiento":"...", "fotogramas":5, "fps":6}',
  "- \"movimiento\" EN INGLÉS y en UNA frase: solo lo que se mueve, nombrando la parte concreta de la imagen. Bien: \"the campfire flames flicker and the smoke drifts right\", \"the rain falls and the puddle ripples\", \"her hair and scarf sway in the wind\". Mal: \"small motion\", \"the scene moves\", \"ambiance\".",
  "- Elige SOLO cosas que cambian de forma por sí solas: fuego, humo, agua, vapor, tela, pelo, hojas, chispas, una luz que late. NUNCA muevas la cámara, ni desplaces objetos o personas por la escena, ni hagas entrar o salir a nadie: eso no es este efecto y sale mal.",
  "- Nada de cambiar la composición, el encuadre, la ropa, la hora del día ni el estilo.",
  "- \"fotogramas\": 2 a 12, contando la foto que ya existe. Cada uno cuesta una imagen, así que 3-4 para algo lento (humo, nubes, tela) y 6-8 para algo rápido y que cambia mucho (fuego, agua agitada).",
  "- \"fps\": 1 a 30. Fuego 8-12; agua o tela 5-7; humo o una luz que respira 2-4. Poner fps alto con pocos fotogramas hace que el bucle vaya a tirones.",
  "- Si no sabes qué parte concreta se mueve en esa imagen, NO la marques como apng: déjala en still.",
].join("\n");

/** Texto para el modelo: qué puede y qué no. */
export function instruccionesPaleta(p: PaletaIa): string {
  const si: string[] = ["still (foto plana: SIEMPRE permitido, es el suelo)"];
  const no: string[] = [];
  (p.paralaje ? si : no).push("paralaje (escena en láminas 2.5D)");
  (p.apng ? si : no).push("apng (foto viva: loop de fotogramas con movimiento mínimo)");
  (p.sprites ? si : no).push("sprites (actores animados de la biblioteca)");
  (p.vfx ? si : no).push("efectos del catálogo (scenes[].vfx y shots[].vfx)");
  (p.musica ? si : no).push("música en audioLayers");

  return [
    "PALETA DE ESTE CAPÍTULO (lo que el usuario ha encendido):",
    `Permitido: ${si.join("; ")}.`,
    no.length ? `PROHIBIDO inventar: ${no.join("; ")}.` : "Nada más está prohibido por paleta.",
    "Cada escena lleva \"medio\": \"still\" | \"apng\" | \"paralaje\".",
    "Por defecto still. Usa apng SOLO si el movimiento es inherente (agua, fuego, viento, respirar) y está permitido.",
    "Usa paralaje SOLO si la profundidad ayuda a un movimiento de cámara y está permitido.",
    "No marques apng ni paralaje en todas las escenas: dos o tres como mucho, el resto still.",
    "Marcar un medio NO dibuja nada: solo dice qué se materializará después. El prompt de la imagen se escribe igual: UNA foto entera, nunca una rejilla, storyboard ni hoja de sprites.",
    ...(p.apng ? [INSTRUCCIONES_APNG] : []),
  ].join("\n");
}
