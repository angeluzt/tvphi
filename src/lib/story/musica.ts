// Biblioteca de música de la app.
//
// Las pistas viven en public/musica y se referencian con "lib:<id>". Eso las
// distingue de las que sube el usuario, que viven en el navegador (IndexedDB):
// una pista de biblioteca NUNCA falta al abrir un proyecto en otro equipo,
// porque viaja dentro de la aplicación.
//
// De dónde sale cada dato, para que se sepa de cuál fiarse:
//
//   "cuando"  → del documento con el que se encargaron las 50 piezas (el «uso
//               ideal» de cada una). Es la intención con la que se generó, no
//               una suposición. Las cinco pistas sueltas que no salen en ese
//               documento van marcadas abajo y esas sí están descritas por el
//               título.
//   "final"   → MEDIDO. Se decodifica cada archivo y se compara el nivel de los
//               últimos 150 ms con el del cuerpo de la pista. Es lo único que
//               dice si sirve para cerrar una escena o para repetirse, y no
//               siempre coincide con lo que pedía el encargo: de 26 pistas
//               pensadas para repetirse, 11 acabaron bajando a silencio.
//
// Si alguna descripción no encaja con lo que suena, corrígela aquí: este
// archivo es la única fuente de verdad.

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
  /** Para qué sirve, en una línea. */
  cuando: string;
  /**
   * Cómo acaba de verdad. Decide para qué sirve:
   *  "fade"   baja hasta silencio → cierra una escena; en bucle deja un hueco.
   *  "enlaza" acaba sonando al mismo nivel → se repite sin hueco.
   *  "media"  baja pero no llega a silencio → ni cierra ni enlaza del todo.
   */
  final: "fade" | "enlaza" | "media";
}

export const PISTAS: Pista[] = [
  // ── cotidiano ──────────────────────────────────────────────────────────
  { id: "city-caf-afternoon", titulo: "City Café Afternoon", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Cafetería, charla cotidiana, romance casual.", final: "fade" },
  { id: "morning-in-the-village", titulo: "Morning in the Village", segundos: 30.5, ambiente: "cotidiano",
    cuando: "Pueblo de mañana, mercado, vida cotidiana.", final: "fade" },
  { id: "at-the-family-table", titulo: "At the Family Table", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Una comida en familia, un hogar, cercanía.", final: "fade" },
  { id: "room-for-thought", titulo: "Room for Thought", segundos: 28.6, ambiente: "cotidiano",
    cuando: "Alguien piensa a solas, un momento de pausa antes de decidir.", final: "fade" },

  // ── intriga e investigación ────────────────────────────────────────────
  { id: "the-detectives-thread", titulo: "The Detective's Thread", segundos: 29.9, ambiente: "intriga",
    cuando: "Seguir una pista, atar cabos, repasar pruebas. Muy de detective.", final: "fade" },
  { id: "pacing-the-parlor", titulo: "Pacing the Parlor", segundos: 30.1, ambiente: "intriga",
    cuando: "Dar vueltas esperando, inquietud contenida, alguien que no se está quieto.", final: "fade" },
  { id: "what-was-found", titulo: "What Was Found", segundos: 27.9, ambiente: "intriga",
    cuando: "Revelación trágica: lo que aparece duele. Descubrimiento perturbador.", final: "fade" },
  { id: "the-house-remembers", titulo: "The House Remembers", segundos: 30.8, ambiente: "intriga",
    cuando: "Casa embrujada, habitaciones abandonadas, un sitio que guarda algo.", final: "fade" },

  // ── tensión ────────────────────────────────────────────────────────────
  { id: "did-i-interrupt", titulo: "Did I Interrupt", segundos: 28.9, ambiente: "tension",
    cuando: "Alguien llega cuando no debía. Tensión social, incomodidad.", final: "fade" },
  { id: "footsteps-behind-the-door", titulo: "Footsteps Behind the Door", segundos: 30.8, ambiente: "tension",
    cuando: "Hay alguien al otro lado. Amenaza que todavía no se ve.", final: "media" },
  { id: "the-corridor-is-closing", titulo: "The Corridor Is Closing", segundos: 30.8, ambiente: "tension",
    cuando: "Se acaba el tiempo, la salida se cierra. Urgencia.", final: "enlaza" },

  // ── oscuro y siniestro ─────────────────────────────────────────────────
  { id: "knowledge-that-should-stay-buried", titulo: "Knowledge That Should Stay Buried", segundos: 30.8,
    ambiente: "oscuro", cuando: "Un secreto que era mejor no desenterrar. Amenaza antigua.", final: "fade" },
  { id: "the-smile-that-is-wrong", titulo: "The Smile That Is Wrong", segundos: 30.8, ambiente: "oscuro",
    cuando: "Algo que parece normal y no lo es. Inquietud que no se sabe explicar.", final: "enlaza" },
  { id: "something-in-the-woods", titulo: "Something in the Woods", segundos: 30.8, ambiente: "oscuro",
    cuando: "Hay algo ahí fuera. Bosque de noche, acecho.", final: "fade" },
  { id: "ritual-below", titulo: "Ritual Below", segundos: 30.8, ambiente: "oscuro",
    cuando: "Un rito en un sótano, una cripta, algo que se invoca.", final: "enlaza" },
  { id: "forest-of-old-shadows", titulo: "Forest of Old Shadows", segundos: 30.8, ambiente: "oscuro",
    cuando: "Bosque antiguo y hostil, sombras que llevan ahí demasiado tiempo.", final: "enlaza" },

  // ── emotivo ────────────────────────────────────────────────────────────
  { id: "one-train-too-late", titulo: "One Train Too Late", segundos: 30.7, ambiente: "emotivo",
    cuando: "Despedida agridulce, una separación. Afecto y resignación a la vez.", final: "fade" },
  { id: "the-empty-chair", titulo: "The Empty Chair", segundos: 26.3, ambiente: "emotivo",
    cuando: "Una ausencia, un duelo, alguien que ya no está.", final: "fade" },
  { id: "the-first-honest-look", titulo: "The First Honest Look", segundos: 29.1, ambiente: "emotivo",
    cuando: "Primer encuentro romántico, el momento en que dos personas conectan.", final: "fade" },
  { id: "the-choice-to-return", titulo: "The Choice to Return", segundos: 29.2, ambiente: "emotivo",
    cuando: "Redención: una decisión moral que cambia al personaje.", final: "fade" },
  { id: "a-light-returns", titulo: "A Light Returns", segundos: 30.8, ambiente: "emotivo",
    cuando: "Vuelve la esperanza tras lo peor. Final que se abre.", final: "fade" },
  { id: "after-the-last-blow", titulo: "After the Last Blow", segundos: 30.8, ambiente: "emotivo",
    cuando: "Lo que queda cuando la pelea acaba. Calma agotada.", final: "media" },

  // ── épico ──────────────────────────────────────────────────────────────
  { id: "above-every-mountain", titulo: "Above Every Mountain", segundos: 30.8, ambiente: "epico",
    cuando: "Una cima, un logro, una vista que sobrecoge.", final: "media" },
  { id: "across-the-burning-sands", titulo: "Across the Burning Sands", segundos: 30.8, ambiente: "epico",
    cuando: "Travesía dura por el desierto, avanzar contra el mundo.", final: "enlaza" },
  { id: "sails-beyond-the-horizon", titulo: "Sails Beyond the Horizon", segundos: 30.8, ambiente: "epico",
    cuando: "Viaje en barco, mar abierto, piratas sin llegar al combate.", final: "enlaza" },

  // ── fantasía ───────────────────────────────────────────────────────────
  { id: "the-door-of-runes", titulo: "The Door of Runes", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un umbral mágico, un portal, magia antigua que se abre.", final: "media" },
  { id: "temple-of-still-water", titulo: "Temple of Still Water", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un lugar sagrado y quieto. Contemplación, calma con peso.", final: "fade" },
  { id: "ruins-beneath-the-sea", titulo: "Ruins Beneath the Sea", segundos: 30.8, ambiente: "fantasia",
    cuando: "Ruinas sumergidas, un mundo perdido bajo el agua.", final: "enlaza" },

  // ── ciencia ficción ────────────────────────────────────────────────────
  { id: "the-machine-becomes-aware", titulo: "The Machine Becomes Aware", segundos: 30.8,
    ambiente: "ciencia-ficcion", cuando: "Una máquina despierta. Asombro frío, algo que no debería pensar.", final: "fade" },
  { id: "hull-breach", titulo: "Hull Breach", segundos: 30.8, ambiente: "ciencia-ficcion",
    cuando: "Emergencia a bordo, la nave se rompe. Acción y alarma.", final: "enlaza" },
  { id: "engines-on-the-edge", titulo: "Engines on the Edge", segundos: 30.8, ambiente: "ciencia-ficcion",
    cuando: "Motores al límite, huida o persecución.", final: "enlaza" },

  // ── naturaleza y viaje ─────────────────────────────────────────────────
  { id: "emerald-canopy", titulo: "Emerald Canopy", segundos: 30.6, ambiente: "naturaleza",
    cuando: "Selva, bosque frondoso, naturaleza viva y luminosa.", final: "fade" },

  // ── añadidas después ───────────────────────────────────────────────────
  // Estas tres, más «pacing-the-parlor» y «did-i-interrupt» de arriba, son las
  // cinco que NO salen en el documento de las 50: no hay «uso ideal» de
  // referencia, así que su descripción viene del título.
  { id: "a-la-torre", titulo: "La torre", segundos: 29.6, ambiente: "fantasia",
    cuando: "Una torre, un lugar alto y solitario. Misterio con peso.", final: "fade" },
  { id: "b-el-duelo", titulo: "El duelo", segundos: 30.8, ambiente: "epico",
    cuando: "Un enfrentamiento cara a cara. Tensión antes del golpe.", final: "media" },
  { id: "acero-y-valor", titulo: "Acero y valor", segundos: 30.8, ambiente: "epico",
    cuando: "Combate, coraje, avanzar espada en mano.", final: "enlaza" },
  { id: "the-heros-first-step", titulo: "The Hero's First Step", segundos: 30.8, ambiente: "epico",
    cuando: "El primer paso del viaje. Cuando alguien decide ir.", final: "fade" },
  { id: "road-beyond-the-hills", titulo: "Road Beyond the Hills", segundos: 30.8, ambiente: "naturaleza",
    cuando: "Camino largo, cruzar colinas, viaje que no acaba hoy.", final: "enlaza" },
  { id: "the-ancient-map", titulo: "The Ancient Map", segundos: 30.8, ambiente: "fantasia",
    cuando: "Un mapa viejo, una ruta olvidada, planear la expedición.", final: "enlaza" },
  { id: "the-hidden-treasure", titulo: "The Hidden Treasure", segundos: 30.8, ambiente: "fantasia",
    cuando: "El hallazgo del tesoro. Asombro y recompensa.", final: "media" },
  { id: "lanterns-at-the-tavern", titulo: "Lanterns at the Tavern", segundos: 30.8, ambiente: "cotidiano",
    cuando: "Una taberna de noche, gente, jarras, descanso del camino.", final: "enlaza" },
  { id: "kingdom-above-the-clouds", titulo: "Kingdom Above the Clouds", segundos: 30.8, ambiente: "epico",
    cuando: "Vuelo, ciudad flotante, un paisaje grandioso visto desde arriba.", final: "enlaza" },
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

// Lo que se le manda a la IA: compacto, una línea por pista. Va el final
// porque decide dónde ponerla: una que baja a silencio cierra el capítulo,
// una que enlaza aguanta un capítulo largo en bucle.
const FINAL_IA: Record<Pista["final"], string> = {
  fade: "acaba en silencio (para cerrar)",
  enlaza: "enlaza en bucle",
  media: "acaba a medias",
};
export function catalogoMusicaIA() {
  return PISTAS.map((p) =>
    `${refPista(p)} · ${AMBIENTE_LABEL[p.ambiente]} · ${p.cuando} · ${FINAL_IA[p.final]}`);
}


// ---------------------------------------------------------------------------
// Sonidos puntuales
// ---------------------------------------------------------------------------
// No son música: duran 2-5 s, empiezan fuerte y se apagan. Van dentro de una
// TOMA, no de fondo, y lo que los hace útiles es que casi todos tienen un
// efecto visual que les corresponde: el trueno con el rayo, el hielo con la
// escarcha. Por eso cada uno dice a qué efecto acompaña — así la IA puede
// ponerle sonido a lo que dibuja en vez de dejarlo mudo.

// Familias, para que el desplegable siga siendo manejable cuando haya sesenta.
export type FamiliaSonido = "clima" | "magia" | "criaturas" | "impactos" | "objetos" | "ambiente";

export const FAMILIA_LABEL: Record<FamiliaSonido, string> = {
  clima: "Clima y naturaleza",
  magia: "Magia y portales",
  criaturas: "Criaturas",
  impactos: "Golpes y explosiones",
  objetos: "Objetos y puertas",
  ambiente: "Ambiente",
};

export interface Sonido {
  id: string;
  titulo: string;
  segundos: number;
  familia: FamiliaSonido;
  cuando: string;
  /** Efecto visual con el que pega, si hay uno. */
  conEfecto?: string;
}

export const SONIDOS: Sonido[] = [
  { id: "close-thunder", titulo: "Trueno cerca", segundos: 3, familia: "clima",
    cuando: "Un trueno que revienta encima. Va con el fogonazo.", conEfecto: "rayo" },
  { id: "ice-rapidly-freezing", titulo: "Hielo formándose", segundos: 3, familia: "clima",
    cuando: "Algo se congela de golpe, cristales creciendo.", conEfecto: "escarcha" },
  { id: "dark-portal-opening", titulo: "Portal que se abre", segundos: 5, familia: "magia",
    cuando: "Algo se abre y suena hondo. Al aparecer el portal.", conEfecto: "portal" },
  { id: "arcane-magic-explosion", titulo: "Explosión arcana", segundos: 2, familia: "magia",
    cuando: "Un hechizo que estalla.", conEfecto: "magiccircle" },
  { id: "massive-stone-creature", titulo: "Criatura de piedra", segundos: 3, familia: "criaturas",
    cuando: "Algo enorme de roca que se mueve o despierta.", conEfecto: "shockwave" },
];

// Agrupados por familia, en el orden de FAMILIA_LABEL y sin las vacías.
export function porFamilia(): { familia: FamiliaSonido; label: string; sonidos: Sonido[] }[] {
  return (Object.keys(FAMILIA_LABEL) as FamiliaSonido[])
    .map((f) => ({ familia: f, label: FAMILIA_LABEL[f], sonidos: SONIDOS.filter((s) => s.familia === f) }))
    .filter((g) => g.sonidos.length > 0);
}

export const PREFIJO_SON = "son:";
export const esDeBibliotecaSonido = (id: string) => id.startsWith(PREFIJO_SON);
export const refSonido = (s: Sonido) => `${PREFIJO_SON}${s.id}`;
export const urlSonido = (id: string) => `/sonidos/${id.slice(PREFIJO_SON.length)}.mp3`;
export const buscarSonido = (ref: string) =>
  SONIDOS.find((s) => s.id === ref.slice(PREFIJO_SON.length)) ?? null;

export function catalogoSonidosIA() {
  return SONIDOS.map((s) =>
    `${refSonido(s)} · ${FAMILIA_LABEL[s.familia]} · ${s.segundos}s · ${s.cuando}` +
    `${s.conEfecto ? ` (efecto: ${s.conEfecto})` : ""}`);
}
