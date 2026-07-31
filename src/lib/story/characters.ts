// Ficha de personaje: la "biblia de personajes" de toda la vida, llevada a una
// app de video.
//
// Para qué sirve HOY: tener en un sitio las imágenes base de cada personaje, cómo
// es, y con qué prompt salió cada imagen. Cuando haces varios capítulos, el
// problema gordo es que el personaje no se parezca a sí mismo de un capítulo a
// otro; tener el prompt guardado es lo que permite volver al mismo sitio.
//
// Para qué va a servir MAÑANA: si se conecta una IA de imágenes, esto es
// exactamente lo que hay que mandarle para pedir "este personaje, pero haciendo
// X". Por eso se guardan también modelo, semilla y ajustes: solo con el texto
// del prompt no se repite una imagen, hacen falta los tres.

export type CharImage = {
  id: string;       // el archivo vive en el navegador (IndexedDB), como todo lo pesado
  name: string;
  // Cada imagen puede tener su propio prompt: no todas salen del mismo.
  prompt?: string;
  seed?: string;
  note?: string;
};

export type CharacterData = {
  description: string;  // cómo es: edad, ropa, rasgos, manías
  prompt: string;       // el prompt base del personaje
  negative: string;     // lo que NO se quiere (los generadores lo piden aparte)
  model: string;        // qué IA y qué versión: sin esto el prompt no se repite
  seed: string;
  params: string;       // pasos, cfg, tamaño… en texto libre, cada IA usa lo suyo
  notes: string;
  images: CharImage[];
};

export type Character = {
  id: string;
  name: string;
  // De qué serie es. Sin serie (null) para los sueltos y para los de antes.
  seriesId?: string | null;
  data: CharacterData;
  updatedAt: string;
};

export function emptyCharacterData(): CharacterData {
  return { description: "", prompt: "", negative: "", model: "", seed: "", params: "", notes: "", images: [] };
}

// Se acepta cualquier cosa que venga de la base y se deja en su sitio, que los
// datos viejos no revienten la pantalla.
export function normalizeCharacterData(raw: any): CharacterData {
  const d = raw && typeof raw === "object" ? raw : {};
  const texto = (v: any) => (typeof v === "string" ? v : "");
  const images: CharImage[] = Array.isArray(d.images)
    ? d.images
        .filter((i: any) => i && typeof i.id === "string")
        .map((i: any) => ({
          id: i.id,
          name: texto(i.name) || "imagen",
          prompt: texto(i.prompt) || undefined,
          seed: texto(i.seed) || undefined,
          note: texto(i.note) || undefined,
        }))
    : [];
  return {
    description: texto(d.description),
    prompt: texto(d.prompt),
    negative: texto(d.negative),
    model: texto(d.model),
    seed: texto(d.seed),
    params: texto(d.params),
    notes: texto(d.notes),
    images,
  };
}
