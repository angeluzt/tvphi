// Biblioteca de música de la app.
//
// Las pistas viven en public/musica y se referencian con "lib:<id>". Eso las
// distingue de las que sube el usuario, que viven en el navegador (IndexedDB):
// una pista de biblioteca NUNCA falta al abrir un proyecto en otro equipo,
// porque viaja dentro de la aplicación.
//
// AVISO HONESTO sobre las descripciones: están escritas a partir del TÍTULO de
// cada pieza, no de haberla escuchado. Sirven para que la IA elija con criterio
// y para buscar, pero si alguna no encaja con lo que suena, corrígela aquí —
// este archivo es la única fuente de verdad.
//
// La columna "bucle" sí está medida: dice si la pista acaba en silencio (enlaza
// sola) o acaba sonando (al repetirse se oye el corte). Medido decodificando
// los últimos 50 ms de cada archivo.

export type Ambiente =
  | "cotidiano" | "intriga" | "tension" | "oscuro" | "emotivo"
  | "epico" | "fantasia" | "ciencia-ficcion" | "naturaleza";

export const AMBIENTE_LABEL: Record<Ambiente, string> = {
  cotidiano: "Cotidiano",
  intriga: "Intriga e investigación",
  tension: "Tensión",
  oscuro: "Oscuro y siniestro",
  emotivo: "Emotivo",
  epico: "Épico",
  fantasia: "Fantasía",
  "ciencia-ficcion": "Ciencia ficción",
  naturaleza: "Naturaleza y viaje",
};

export interface Pista {
  id: string;          // nombre del archivo sin extensión
  titulo: string;
  segundos: number;
  ambiente: Ambiente;
  /** Para qué sirve, en una línea. Deducido del título; corregible. */
  cuando: string;
  /** "limpio": acaba en silencio y repite sin ruido. "corta": se oye el salto. */
  bucle: "limpio" | "corta";
}

export const PISTAS: Pista[] = [
  // ── cotidiano ──────────────────────────────────────────────────────────
  { id: "city-caf-afternoon", titulo: "City Café Afternoon", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Una tarde cualquiera en la ciudad, una conversación tranquila en un café.", bucle: "limpio" },
  { id: "morning-in-the-village", titulo: "Morning in the Village", segundos: 30.5, ambiente: "cotidiano",
    cuando: "Amanecer en un pueblo, empezar el día, calma antes de que pase algo.", bucle: "limpio" },
  { id: "at-the-family-table", titulo: "At the Family Table", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Una comida en familia, un hogar, cercanía.", bucle: "limpio" },
  { id: "room-for-thought", titulo: "Room for Thought", segundos: 28.6, ambiente: "cotidiano",
    cuando: "Alguien piensa a solas, un momento de pausa antes de decidir.", bucle: "limpio" },

  // ── intriga e investigación ────────────────────────────────────────────
  { id: "the-detectives-thread", titulo: "The Detective's Thread", segundos: 29.9, ambiente: "intriga",
    cuando: "Seguir una pista, atar cabos, repasar pruebas. Muy de detective.", bucle: "limpio" },
  { id: "pacing-the-parlor", titulo: "Pacing the Parlor", segundos: 30.1, ambiente: "intriga",
    cuando: "Dar vueltas esperando, inquietud contenida, alguien que no se está quieto.", bucle: "limpio" },
  { id: "what-was-found", titulo: "What Was Found", segundos: 27.9, ambiente: "intriga",
    cuando: "El hallazgo: aparece algo que cambia lo que se creía.", bucle: "limpio" },
  { id: "the-house-remembers", titulo: "The House Remembers", segundos: 30.8, ambiente: "intriga",
    cuando: "Un sitio con pasado, una casa que guarda algo, memoria del lugar.", bucle: "limpio" },

  // ── tensión ────────────────────────────────────────────────────────────
  { id: "did-i-interrupt", titulo: "Did I Interrupt", segundos: 28.9, ambiente: "tension",
    cuando: "Alguien llega cuando no debía. Tensión social, incomodidad.", bucle: "limpio" },
  { id: "footsteps-behind-the-door", titulo: "Footsteps Behind the Door", segundos: 30.8, ambiente: "tension",
    cuando: "Hay alguien al otro lado. Amenaza que todavía no se ve.", bucle: "corta" },
  { id: "the-corridor-is-closing", titulo: "The Corridor Is Closing", segundos: 30.8, ambiente: "tension",
    cuando: "Se acaba el tiempo, la salida se cierra. Urgencia.", bucle: "corta" },
  { id: "one-train-too-late", titulo: "One Train Too Late", segundos: 30.7, ambiente: "tension",
    cuando: "Llegar tarde, perder la ocasión por poco.", bucle: "limpio" },

  // ── oscuro y siniestro ─────────────────────────────────────────────────
  { id: "knowledge-that-should-stay-buried", titulo: "Knowledge That Should Stay Buried", segundos: 30.8,
    ambiente: "oscuro", cuando: "Un secreto que era mejor no desenterrar. Amenaza antigua.", bucle: "limpio" },
  { id: "the-smile-that-is-wrong", titulo: "The Smile That Is Wrong", segundos: 30.8, ambiente: "oscuro",
    cuando: "Algo que parece normal y no lo es. Inquietud que no se sabe explicar.", bucle: "corta" },
  { id: "something-in-the-woods", titulo: "Something in the Woods", segundos: 30.8, ambiente: "oscuro",
    cuando: "Hay algo ahí fuera. Bosque de noche, acecho.", bucle: "limpio" },
  { id: "ritual-below", titulo: "Ritual Below", segundos: 30.8, ambiente: "oscuro",
    cuando: "Un rito en un sótano, una cripta, algo que se invoca.", bucle: "corta" },
  { id: "forest-of-old-shadows", titulo: "Forest of Old Shadows", segundos: 30.8, ambiente: "oscuro",
    cuando: "Bosque antiguo y hostil, sombras que llevan ahí demasiado tiempo.", bucle: "corta" },

  // ── emotivo ────────────────────────────────────────────────────────────
  { id: "the-empty-chair", titulo: "The Empty Chair", segundos: 26.3, ambiente: "emotivo",
    cuando: "Una ausencia, un duelo, alguien que ya no está.", bucle: "limpio" },
  { id: "the-first-honest-look", titulo: "The First Honest Look", segundos: 29.1, ambiente: "emotivo",
    cuando: "El momento en que dos personas se dicen la verdad.", bucle: "limpio" },
  { id: "the-choice-to-return", titulo: "The Choice to Return", segundos: 29.2, ambiente: "emotivo",
    cuando: "Decidir volver, dar marcha atrás por voluntad propia.", bucle: "limpio" },
  { id: "a-light-returns", titulo: "A Light Returns", segundos: 30.8, ambiente: "emotivo",
    cuando: "Vuelve la esperanza tras lo peor. Final que se abre.", bucle: "limpio" },
  { id: "after-the-last-blow", titulo: "After the Last Blow", segundos: 30.8, ambiente: "emotivo",
    cuando: "Lo que queda cuando la pelea acaba. Calma agotada.", bucle: "corta" },

  // ── épico ──────────────────────────────────────────────────────────────
  { id: "above-every-mountain", titulo: "Above Every Mountain", segundos: 30.8, ambiente: "epico",
    cuando: "Una cima, un logro, una vista que sobrecoge.", bucle: "corta" },
  { id: "across-the-burning-sands", titulo: "Across the Burning Sands", segundos: 30.8, ambiente: "epico",
    cuando: "Travesía dura por el desierto, avanzar contra el mundo.", bucle: "corta" },
  { id: "sails-beyond-the-horizon", titulo: "Sails Beyond the Horizon", segundos: 30.8, ambiente: "epico",
    cuando: "Zarpar, partir hacia lo desconocido. Aventura que empieza.", bucle: "corta" },

  // ── fantasía ───────────────────────────────────────────────────────────
  { id: "the-door-of-runes", titulo: "The Door of Runes", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un umbral mágico, un portal, magia antigua que se abre.", bucle: "corta" },
  { id: "temple-of-still-water", titulo: "Temple of Still Water", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un lugar sagrado y quieto. Contemplación, calma con peso.", bucle: "limpio" },
  { id: "ruins-beneath-the-sea", titulo: "Ruins Beneath the Sea", segundos: 30.8, ambiente: "fantasia",
    cuando: "Ruinas sumergidas, un mundo perdido bajo el agua.", bucle: "corta" },

  // ── ciencia ficción ────────────────────────────────────────────────────
  { id: "the-machine-becomes-aware", titulo: "The Machine Becomes Aware", segundos: 30.8,
    ambiente: "ciencia-ficcion", cuando: "Una máquina despierta. Asombro frío, algo que no debería pensar.", bucle: "limpio" },
  { id: "hull-breach", titulo: "Hull Breach", segundos: 30.8, ambiente: "ciencia-ficcion",
    cuando: "Emergencia a bordo, la nave se rompe. Acción y alarma.", bucle: "corta" },
  { id: "engines-on-the-edge", titulo: "Engines on the Edge", segundos: 30.8, ambiente: "ciencia-ficcion",
    cuando: "Motores al límite, huida o persecución.", bucle: "corta" },

  // ── naturaleza y viaje ─────────────────────────────────────────────────
  { id: "emerald-canopy", titulo: "Emerald Canopy", segundos: 30.6, ambiente: "naturaleza",
    cuando: "Selva, bosque frondoso, naturaleza viva y luminosa.", bucle: "limpio" },

  // ── añadidas después ───────────────────────────────────────────────────
  { id: "a-la-torre", titulo: "La torre", segundos: 29.6, ambiente: "fantasia",
    cuando: "Una torre, un lugar alto y solitario. Misterio con peso.", bucle: "limpio" },
  { id: "b-el-duelo", titulo: "El duelo", segundos: 30.8, ambiente: "epico",
    cuando: "Un enfrentamiento cara a cara. Tensión antes del golpe.", bucle: "corta" },
  { id: "acero-y-valor", titulo: "Acero y valor", segundos: 30.8, ambiente: "epico",
    cuando: "Combate, coraje, avanzar espada en mano.", bucle: "corta" },
  { id: "the-heros-first-step", titulo: "The Hero's First Step", segundos: 30.8, ambiente: "epico",
    cuando: "El primer paso del viaje. Cuando alguien decide ir.", bucle: "limpio" },
  { id: "road-beyond-the-hills", titulo: "Road Beyond the Hills", segundos: 30.8, ambiente: "naturaleza",
    cuando: "Camino largo, cruzar colinas, viaje que no acaba hoy.", bucle: "corta" },
  { id: "the-ancient-map", titulo: "The Ancient Map", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un mapa viejo, una ruta olvidada, planear la expedición.", bucle: "corta" },
  { id: "the-hidden-treasure", titulo: "The Hidden Treasure", segundos: 30.8, ambiente: "fantasia",
    cuando: "El hallazgo del tesoro. Asombro y recompensa.", bucle: "corta" },
  { id: "lanterns-at-the-tavern", titulo: "Lanterns at the Tavern", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Una taberna de noche, gente, jarras, descanso del camino.", bucle: "corta" },
  { id: "kingdom-above-the-clouds", titulo: "Kingdom Above the Clouds", segundos: 30.8, ambiente: "epico",
    cuando: "Un reino imposible, una vista que quita el aliento.", bucle: "corta" },
];

// Prefijo que distingue una pista de la biblioteca de un archivo del usuario.
export const PREFIJO = "lib:";
export const esDeBiblioteca = (id: string) => id.startsWith(PREFIJO);
export const idPista = (id: string) => id.slice(PREFIJO.length);
export const refPista = (p: Pista) => `${PREFIJO}${p.id}`;
export const urlPista = (id: string) => `/musica/${idPista(id)}.mp3`;
export const buscarPista = (ref: string) => PISTAS.find((p) => p.id === idPista(ref)) ?? null;

// Agrupadas por ambiente, para enseñarlas ordenadas.
export function porAmbiente(): { ambiente: Ambiente; label: string; pistas: Pista[] }[] {
  const orden: Ambiente[] = [
    "cotidiano", "intriga", "tension", "oscuro", "emotivo",
    "epico", "fantasia", "ciencia-ficcion", "naturaleza",
  ];
  return orden
    .map((a) => ({ ambiente: a, label: AMBIENTE_LABEL[a], pistas: PISTAS.filter((p) => p.ambiente === a) }))
    .filter((g) => g.pistas.length > 0);
}

// Lo que se le manda a la IA: compacto, una línea por pista.
export function catalogoMusicaIA() {
  return PISTAS.map((p) => `${refPista(p)} · ${AMBIENTE_LABEL[p.ambiente]} · ${p.cuando}`);
}


// ---------------------------------------------------------------------------
// Sonidos puntuales
// ---------------------------------------------------------------------------
// No son música: duran 2-5 s, empiezan fuerte y se apagan. Van dentro de una
// TOMA, no de fondo, y lo que los hace útiles es que casi todos tienen un
// efecto visual que les corresponde: el trueno con el rayo, el hielo con la
// escarcha. Por eso cada uno dice a qué efecto acompaña — así la IA puede
// ponerle sonido a lo que dibuja en vez de dejarlo mudo.

export interface Sonido {
  id: string;
  titulo: string;
  segundos: number;
  cuando: string;
  /** Efecto visual con el que pega, si hay uno. */
  conEfecto?: string;
}

export const SONIDOS: Sonido[] = [
  { id: "close-thunder", titulo: "Trueno cerca", segundos: 3,
    cuando: "Un trueno que revienta encima. Va con el fogonazo.", conEfecto: "rayo" },
  { id: "dark-portal-opening", titulo: "Portal que se abre", segundos: 5,
    cuando: "Algo se abre y suena hondo. Al aparecer el portal.", conEfecto: "portal" },
  { id: "arcane-magic-explosion", titulo: "Explosión arcana", segundos: 2,
    cuando: "Un hechizo que estalla.", conEfecto: "magiccircle" },
  { id: "ice-rapidly-freezing", titulo: "Hielo formándose", segundos: 3,
    cuando: "Algo se congela de golpe, cristales creciendo.", conEfecto: "escarcha" },
  { id: "massive-stone-creature", titulo: "Criatura de piedra", segundos: 3,
    cuando: "Algo enorme de roca que se mueve o despierta.", conEfecto: "shockwave" },
];

export const PREFIJO_SON = "son:";
export const esDeBibliotecaSonido = (id: string) => id.startsWith(PREFIJO_SON);
export const refSonido = (s: Sonido) => `${PREFIJO_SON}${s.id}`;
export const urlSonido = (id: string) => `/sonidos/${id.slice(PREFIJO_SON.length)}.mp3`;
export const buscarSonido = (ref: string) =>
  SONIDOS.find((s) => s.id === ref.slice(PREFIJO_SON.length)) ?? null;

export function catalogoSonidosIA() {
  return SONIDOS.map((s) =>
    `${refSonido(s)} · ${s.segundos}s · ${s.cuando}${s.conEfecto ? ` (efecto: ${s.conEfecto})` : ""}`);
}
