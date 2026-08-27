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

/** Texto para el modelo: qué puede y qué no. */
export function instruccionesPaleta(p: PaletaIa): string {
  const si: string[] = ["still (foto plana: SIEMPRE permitido, es el suelo)"];
  const no: string[] = [];
  (p.paralaje ? si : no).push("paralaje (escena en láminas 2.5D)");
  (p.apng ? si : no).push("apng (foto viva: loop de fotogramas con movimiento mínimo)");
  (p.sprites ? si : no).push("sprites (actores animados recortados: foto viva con actores, y actores sobre las láminas del paralaje)");
  (p.vfx ? si : no).push("efectos del catálogo (scenes[].vfx y shots[].vfx)");
  (p.musica ? si : no).push("música en audioLayers");

  return [
    "PALETA DE ESTE CAPÍTULO (lo que el usuario ha encendido):",
    `Permitido: ${si.join("; ")}.`,
    no.length ? `PROHIBIDO inventar: ${no.join("; ")}.` : "Nada más está prohibido por paleta.",
    "Cada escena lleva \"medio\": \"still\" | \"apng\" | \"paralaje\".",
    // CUÁNTAS de cada cosa ya no se dice aquí: lo dice el reparto, con números
    // cerrados. Decirlo en dos sitios con dos vocabularios («dos o tres como
    // mucho» aquí, «exactamente 2» allí) es pedirle al modelo que elija a cuál
    // hace caso, y elegía al más flojo.
    "Marcar un medio NO dibuja nada: solo dice qué se materializará después. El prompt de la imagen se escribe igual: UNA foto entera, nunca una rejilla, storyboard ni hoja de sprites.",
  ].join("\n");
}
