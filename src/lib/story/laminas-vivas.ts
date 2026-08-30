// Qué láminas de un paralaje respiran, y cuáles se quedan quietas.
//
// EL PROBLEMA. La IA decide en el plan del capítulo qué se mueve —«el agua»,
// «las antorchas»—, pero quien reparte la escena en láminas es OTRA llamada,
// más tarde, y a esa nadie le cuenta el plan: pone los nombres que quiere («03
// Río y orilla», «04 Antorchas del muro»). Así que hay dos vocabularios que
// hablan de lo mismo y hay que casarlos, porque animar una lámina cuesta cinco
// imágenes y equivocarse de lámina es pagarlas para nada.
//
// CÓMO SE CASAN. Por palabras: se busca cada pista dentro del nombre de la
// lámina y dentro de lo que ese nombre lleva marcado en el mapa. Si no encaja
// ninguna —o si el plan no dijo nada—, se cae a lo que se mueve solo por
// naturaleza: agua, cielo, fuego y vegetación.
//
// LO QUE NUNCA SE ANIMA. Suelos, muros, terreno y escaleras. No porque no
// puedan moverse, sino porque el ojo los usa de referencia: en cuanto la piedra
// del suelo cambia entre cuadro y cuadro, la escena entera parece que hierve.

/** Una lámina, tal y como la deja el mapa de la escena. */
export interface LaminaCandidata {
  id: string;
  nombre: string;
  /** Los «semantic» de sus objetos: sky, water, floor, vegetation… */
  semanticas?: string[];
  /**
   * Si la lámina es una foto entera y opaca, o un recorte con transparencia.
   *
   * ES LO QUE MANDA, por encima de cualquier otra cosa. Animar por cuadros
   * significa mandarle la lámina a /v1/images/edits para que la repinte, y ese
   * endpoint entiende la zona transparente como «esto es lo que hay que
   * inventar». A una lámina recortada al 82% —una ciudadela, unas rocas— se le
   * estaría pidiendo que se invente el 82% que no está, y encima vuelve opaca:
   * un rectángulo sólido que tapa todo lo que tenía detrás. El paralaje
   * destruido, y tres imágenes pagadas para conseguirlo.
   *
   * Solo el fondo cumple esto, que es justo la lámina para la que la técnica
   * se pensó. Lo que se mueve en un recorte —fuego, faroles— se hace con un
   * efecto del catálogo anclado, que respeta la transparencia y no cuesta ni
   * una imagen.
   *
   * Sin dato (undefined) se supone que NO es segura: más vale una lámina
   * quieta de más que una escena rota.
   */
  opaca?: boolean;
}

/** Semánticas que se mueven solas y no rompen nada al hacerlo. */
const VIVAS_POR_NATURALEZA = new Set(["sky", "water", "light_anchor", "vegetation", "vfx_zone"]);

/** Y las que hacen de referencia: si respiran, la escena hierve. */
const QUIETAS = new Set(["floor", "wall", "terrain", "stairs", "column", "door", "window"]);

const PALABRAS_VIVAS =
  /\b(agua|mar|oc[ée]ano|r[ií]o|lago|olas?|cascada|lluvia|fuego|llamas?|hoguera|antorchas?|vela|farol|humo|vapor|niebla|bruma|nube|nubes|cielo|estrellas?|viento|hojas?|follaje|vegetaci[oó]n|hierba|trigo|banderas?|cortinas?|polvo|ceniza|water|sea|river|waves?|fire|flames?|smoke|fog|mist|clouds?|sky|foliage|grass)\b/i;

const PALABRAS_QUIETAS =
  /\b(suelo|piso|terreno|roca|rocas|muro|muros|pared|paredes|escaleras?|columnas?|puerta|ventana|edificio|edificios|floor|ground|wall|stairs|column)\b/i;

/** Deja un texto comparable: sin tildes, sin números de orden, en minúsculas. */
export function llano(texto: string): string {
  return texto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*[.·-]?\s*/, "")
    .trim();
}

// Palabras que aparecen en todo y no distinguen nada. Sin quitarlas, la pista
// «el agua del río» encajaría con «la puerta del muro» por culpa del «del».
const VACIAS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "y", "o", "en", "con", "sin", "sobre", "para", "por", "que", "lo",
  "the", "of", "and", "a", "an", "in", "on", "with",
]);

function palabras(texto: string): string[] {
  return llano(texto).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !VACIAS.has(w));
}

/**
 * ¿Esta pista del plan habla de esta lámina?
 *
 * Se compara palabra a palabra y no cadena con cadena: la IA escribe «el agua
 * del río» y el mapa pone «03 Río y orilla», así que ninguna de las dos
 * contiene a la otra y aun así son lo mismo. Basta con que compartan una
 * palabra que signifique algo.
 */
function encajaPista(lamina: LaminaCandidata, pista: string): boolean {
  const dePista = palabras(pista);
  if (!dePista.length) return false;
  const deLamina = new Set(palabras(lamina.nombre));
  return dePista.some((w) => deLamina.has(w));
}

/**
 * Cuáles animar, en orden de preferencia y sin pasar del tope.
 *
 * Devuelve ids, no nombres: los nombres se repiten («02 Fondo» dos veces no es
 * imposible) y lo que hay que animar es una lámina concreta.
 */
export function elegirLaminasVivas(
  capas: LaminaCandidata[],
  pistas: string[] = [],
  tope = 2,
): string[] {
  if (tope <= 0 || !capas.length) return [];

  // Lo primero, y sin excepción: un recorte no se puede repintar. Ni con una
  // pista del plan detrás, porque el resultado no sería «peor», sería una
  // lámina opaca tapando la escena.
  const repintables = capas.filter((c) => c.opaca === true);
  if (!repintables.length) return [];

  const prohibida = (c: LaminaCandidata) =>
    (c.semanticas ?? []).some((s) => QUIETAS.has(s)) && !(c.semanticas ?? []).some((s) => VIVAS_POR_NATURALEZA.has(s))
      ? true
      : PALABRAS_QUIETAS.test(llano(c.nombre)) && !PALABRAS_VIVAS.test(llano(c.nombre));

  const elegidas: string[] = [];
  const meter = (c: LaminaCandidata) => {
    if (elegidas.length >= tope || elegidas.includes(c.id)) return;
    elegidas.push(c.id);
  };

  // 1) Lo que el plan pidió por su nombre. Manda sobre todo lo demás: si la IA
  //    dijo «las antorchas», que se animen las antorchas aunque el mapa las
  //    haya marcado como muro.
  for (const pista of pistas) {
    const encaja = repintables.find((c) => encajaPista(c, pista) && !elegidas.includes(c.id));
    if (encaja) meter(encaja);
  }

  // 2) Lo que se mueve solo, si todavía queda sitio.
  //
  // SOLO cuando el plan no pidió nada. Si pidió «los braseros» y los braseros
  // resultan ser un recorte que no se puede repintar, la respuesta correcta es
  // no animar nada: sustituirlo por el cielo es cobrarle al usuario dos
  // imágenes por un movimiento que no encargó y que además no va a buscar.
  const pidioAlgo = pistas.some((x) => x.trim().length > 0);
  if (!pidioAlgo && elegidas.length < tope) {
    for (const c of repintables) {
      if (prohibida(c)) continue;
      const porSemantica = (c.semanticas ?? []).some((s) => VIVAS_POR_NATURALEZA.has(s));
      if (porSemantica || PALABRAS_VIVAS.test(llano(c.nombre))) meter(c);
    }
  }

  return elegidas;
}

/**
 * Las láminas que el plan pidió animar y NO se pueden repintar.
 *
 * Existe para poder decirlo con nombre y apellido en vez de dejar la lámina
 * quieta sin explicación —que es exactamente cómo se perdió el primer intento:
 * el plan pedía «braseros», la lámina existía, y no pasaba nada ni se decía por
 * qué—. Quien llama lo convierte en un aviso.
 */
export function laminasPedidasNoRepintables(
  capas: LaminaCandidata[],
  pistas: string[] = [],
): string[] {
  const fuera: string[] = [];
  for (const pista of pistas) {
    const encaja = capas.find((c) => encajaPista(c, pista));
    if (encaja && encaja.opaca !== true && !fuera.includes(encaja.nombre)) {
      fuera.push(encaja.nombre);
    }
  }
  return fuera;
}
