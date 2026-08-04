// Biblioteca de música de la app.
//
// Las pistas viven en assets/musica —FUERA de public/— y se sirven por
// /api/story/audio, que exige sesión. Se referencian con "lib:<id>", lo que las
// distingue de las que sube el usuario, que viven en el navegador (IndexedDB):
// una pista de biblioteca NUNCA falta al abrir un proyecto en otro equipo,
// porque viaja dentro de la aplicación.
//
// Están fuera de public a propósito. Con 80 nombres predecibles y URLs
// públicas, la app parecía un repositorio de samples descargables, y la
// licencia del audio permite usarlo dentro de un proyecto, no repartirlo.
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
export const urlPista = (id: string) => `/api/story/audio/musica/${idPista(id)}`;
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
// Sonidos
// ---------------------------------------------------------------------------
// No son música, y hay dos clases que no se usan igual:
//
//   GOLPE  (1-6 s) empieza fuerte y acaba en silencio. Va en un instante
//          concreto de la toma: la explosión, el portazo, el rugido.
//   BUCLE  (20-30 s) nivel constante, sin principio ni final. Se pone en bucle
//          debajo de una escena entera: la lluvia, la taberna, el latido.
//
// Los bucles se pidieron con la bandera «loop» de la API que los generó, que
// garantiza el enlace en vez de confiarlo al texto del prompt. Se comprobó
// decodificándolos: 12 de los 15 empiezan y acaban al mismo nivel y sin cola
// muda. Los tres que no van marcados abajo.
//
// Casi la mitad tiene un efecto visual que le corresponde —el trueno con el
// rayo, el hielo con la escarcha—, y eso es lo que permite que la IA sonorice
// lo que dibuja en vez de dejarlo mudo.
//
// Las duraciones están MEDIDAS decodificando cada archivo, no copiadas de lo
// que se pidió.

// Familias, para que el desplegable siga siendo manejable cuando haya sesenta.
export type FamiliaSonido =
  | "impactos" | "clima" | "magia" | "criaturas" | "objetos" | "ambiente" | "tension";

export const FAMILIA_LABEL: Record<FamiliaSonido, string> = {
  impactos: "Golpes e impactos",
  clima: "Clima y naturaleza",
  magia: "Magia y energía",
  criaturas: "Criaturas y animales",
  objetos: "Objetos, puertas y pasos",
  ambiente: "Ambientes de lugar",
  tension: "Tensión y transiciones",
};

export interface Sonido {
  id: string;
  titulo: string;
  /** Medido decodificando el archivo. */
  segundos: number;
  familia: FamiliaSonido;
  /** true = ambiente que se repite bajo la escena; false = golpe puntual. */
  bucle: boolean;
  cuando: string;
  /** Efecto visual con el que pega, si hay uno. */
  conEfecto?: string;
  /** Defecto medido que conviene saber antes de usarlo. */
  pega?: string;
}

export const SONIDOS: Sonido[] = [
  // ── golpes e impactos ──────────────────────────────────────────────────
  { id: "big-explosion", titulo: "Explosión grande", segundos: 4, familia: "impactos", bucle: false,
    cuando: "Algo revienta: un barril, una carga, una casa. El golpe de la escena.", conEfecto: "explosion" },
  { id: "deep-shockwave", titulo: "Onda expansiva", segundos: 4, familia: "impactos", bucle: false,
    cuando: "Acompaña a un impacto para que se sienta la fuerza. Va pegado a la explosión.", conEfecto: "shockwave" },
  { id: "glass-breaking", titulo: "Cristal que se rompe", segundos: 3, familia: "impactos", bucle: false,
    cuando: "Una ventana, un espejo, un vaso. Para un susto o una entrada violenta." },
  { id: "metal-clash", titulo: "Metal contra metal", segundos: 3, familia: "impactos", bucle: false,
    cuando: "Espadas que chocan, un duelo, una herramienta contra un yunque.", conEfecto: "chispas" },
  { id: "punch-impact", titulo: "Golpe de puñetazo", segundos: 3, familia: "impactos", bucle: false,
    cuando: "Una pelea cuerpo a cuerpo, un golpe que conecta.", conEfecto: "speedlines" },
  { id: "heavy-fall", titulo: "Algo pesado que cae", segundos: 3, familia: "impactos", bucle: false,
    cuando: "Un cuerpo, un mueble, una piedra grande. Un final seco de acción." },
  { id: "fast-whoosh", titulo: "Algo pasa rápido", segundos: 2, familia: "impactos", bucle: false,
    cuando: "Un objeto que vuela junto a la cámara, un cambio brusco, un ataque veloz." },
  { id: "impact-hit", titulo: "Golpe de revelación", segundos: 6, familia: "impactos", bucle: false,
    cuando: "El momento en que se descubre algo. Va justo después del riser." },

  // ── clima y naturaleza ─────────────────────────────────────────────────
  { id: "steady-rain", titulo: "Lluvia constante", segundos: 30, familia: "clima", bucle: true,
    cuando: "Tristeza, huida, noche fría. La cama de una escena bajo la lluvia.", conEfecto: "lluvia" },
  { id: "open-wind", titulo: "Viento en campo abierto", segundos: 30, familia: "clima", bucle: true,
    cuando: "Frío, soledad, un páramo, una cima. También bajo la nieve.", conEfecto: "nieve" },
  { id: "distant-storm", titulo: "Tormenta lejana", segundos: 30, familia: "clima", bucle: true,
    cuando: "Se acerca algo malo. Truenos al fondo, sin caer todavía encima.", conEfecto: "rayo" },
  { id: "campfire", titulo: "Hoguera crepitando", segundos: 20, familia: "clima", bucle: true,
    cuando: "Una fogata, una chimenea, antorchas. Da calor a una escena.", conEfecto: "fuego" },
  { id: "ocean-waves", titulo: "Olas del mar", segundos: 30, familia: "clima", bucle: true,
    cuando: "Una playa, un acantilado, un barco. Calma o inmensidad.",
    pega: "se apaga hacia el final: al repetirse se nota el salto" },
  { id: "water-splash", titulo: "Chapoteo en agua", segundos: 2, familia: "clima", bucle: false,
    cuando: "Algo cae al agua, un pie en un charco, alguien que se sumerge.", conEfecto: "salpicadura" },

  // ── magia y energía ────────────────────────────────────────────────────
  { id: "spell-cast", titulo: "Hechizo que se lanza", segundos: 2, familia: "magia", bucle: false,
    cuando: "El instante en que alguien lanza algo. Va con el fogonazo.", conEfecto: "destello" },
  { id: "arcane-charge", titulo: "Círculo mágico cargándose", segundos: 5, familia: "magia", bucle: false,
    cuando: "El conjuro que se prepara, antes de soltarse. Debajo del personaje.", conEfecto: "magiccircle" },
  { id: "electric-arc", titulo: "Chispazo eléctrico", segundos: 2, familia: "magia", bucle: false,
    cuando: "Un cable pelado, una máquina rota, magia eléctrica.", conEfecto: "electricidad" },
  { id: "magic-sparkle", titulo: "Brillo mágico", segundos: 3, familia: "magia", bucle: false,
    cuando: "Magia delicada: hadas, polvo de estrellas, un encantamiento suave.", conEfecto: "polvo" },
  { id: "energy-aura", titulo: "Aura de poder", segundos: 20, familia: "magia", bucle: true,
    cuando: "Alguien cargando poder mientras habla. En bucle bajo la toma.", conEfecto: "aura" },

  // ── criaturas y animales ───────────────────────────────────────────────
  { id: "monster-roar", titulo: "Rugido de monstruo", segundos: 4, familia: "criaturas", bucle: false,
    cuando: "Una criatura enorme que aparece o ataca. El momento de más miedo." },
  { id: "wolf-howl", titulo: "Aullido de lobo", segundos: 4, familia: "criaturas", bucle: false,
    cuando: "Noche, bosque, amenaza que no se ve. Cambia el ánimo de golpe." },
  { id: "crow-call", titulo: "Cuervo graznando", segundos: 2, familia: "criaturas", bucle: false,
    cuando: "Mal presagio, un cementerio, un campo de batalla." },
  { id: "dog-barking", titulo: "Perro ladrando", segundos: 3, familia: "criaturas", bucle: false,
    cuando: "Una casa, un pueblo, alguien que llega. También como amenaza." },
  { id: "horse-whinny", titulo: "Caballo", segundos: 4, familia: "criaturas", bucle: false,
    cuando: "Una llegada, una huida, cualquier historia de época.",
    pega: "acaba sonando: si va seguido de otro sonido, se pisan" },
  { id: "startled-flock", titulo: "Bandada que echa a volar", segundos: 3, familia: "criaturas", bucle: false,
    cuando: "Algo asustó a los pájaros: se sabe que hay alguien antes de verlo." },

  // ── objetos, puertas y pasos ───────────────────────────────────────────
  { id: "wooden-door-opening", titulo: "Puerta de madera que se abre", segundos: 4, familia: "objetos", bucle: false,
    cuando: "Entrar en algún sitio. El chirrido hace media tensión solo." },
  { id: "door-slam", titulo: "Portazo", segundos: 2, familia: "objetos", bucle: false,
    cuando: "Alguien se va enfadado, algo se cierra de golpe, un susto." },
  { id: "key-lock", titulo: "Cerradura y llave", segundos: 3, familia: "objetos", bucle: false,
    cuando: "Encerrar o liberar a alguien, un secreto que se abre." },
  { id: "old-chest-opening", titulo: "Cofre viejo que se abre", segundos: 4, familia: "objetos", bucle: false,
    cuando: "Un tesoro, un hallazgo, algo que llevaba mucho cerrado." },
  { id: "sword-unsheath", titulo: "Espada que se desenvaina", segundos: 2, familia: "objetos", bucle: false,
    cuando: "El momento antes de una pelea. Decide el tono de la escena." },
  { id: "coins-falling", titulo: "Monedas cayendo", segundos: 3, familia: "objetos", bucle: false,
    cuando: "Un pago, un soborno, un tesoro que se derrama." },
  { id: "footsteps-wood", titulo: "Pasos sobre madera", segundos: 20, familia: "objetos", bucle: true,
    cuando: "Alguien que camina por una casa o un pasillo mientras se narra." },
  { id: "footsteps-gravel", titulo: "Pasos sobre grava", segundos: 20, familia: "objetos", bucle: true,
    cuando: "Un camino, un patio, alguien acercándose por fuera." },

  // ── ambientes de lugar ─────────────────────────────────────────────────
  { id: "tavern-crowd", titulo: "Taberna con gente", segundos: 30, familia: "ambiente", bucle: true,
    cuando: "Una posada, un bar, un sitio lleno. Descanso entre aventuras." },
  { id: "city-street", titulo: "Calle de ciudad", segundos: 20, familia: "ambiente", bucle: true,
    cuando: "Exterior urbano, moderno o de época con tráfico." },
  { id: "night-forest", titulo: "Bosque de noche", segundos: 30, familia: "ambiente", bucle: true,
    cuando: "Acecho, camino nocturno, calma antes de que pase algo." },
  { id: "cave-drips", titulo: "Cueva con goteo", segundos: 20, familia: "ambiente", bucle: true,
    cuando: "Una cueva, un sótano, unas catacumbas. Suena a estar bajo tierra." },
  { id: "distant-siren", titulo: "Sirena lejana", segundos: 20, familia: "ambiente", bucle: true,
    cuando: "Una escena de crimen, una detención, una huida.", conEfecto: "baliza" },

  // ── tensión y transiciones ─────────────────────────────────────────────
  { id: "tension-riser", titulo: "La tensión que sube", segundos: 5, familia: "tension", bucle: false,
    cuando: "Justo antes de una revelación o un corte. Lleva al espectador al filo." },
  { id: "heartbeat", titulo: "Latido de corazón", segundos: 20, familia: "tension", bucle: true,
    cuando: "Miedo, tensión contenida, alguien a punto de romperse.",
    pega: "arranca flojo: el primer latido casi no se oye" },
  { id: "wall-clock", titulo: "Reloj de pared", segundos: 20, familia: "tension", bucle: true,
    cuando: "Se acaba el tiempo, una espera larga, una habitación en silencio.",
    pega: "deja un cuarto de segundo de silencio al final del bucle" },
  { id: "digital-glitch", titulo: "Falla digital", segundos: 2, familia: "tension", bucle: false,
    cuando: "Una pantalla que falla, un recuerdo que se corrompe, algo digital roto.", conEfecto: "glitch",
    pega: "acaba sonando: si va seguido de otro sonido, se pisan" },
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
export const urlSonido = (id: string) => `/api/story/audio/sonidos/${id.slice(PREFIJO_SON.length)}`;
export const buscarSonido = (ref: string) =>
  SONIDOS.find((s) => s.id === ref.slice(PREFIJO_SON.length)) ?? null;

export function catalogoSonidosIA() {
  return SONIDOS.map((s) =>
    `${refSonido(s)} · ${FAMILIA_LABEL[s.familia]} · ${s.segundos}s · ` +
    `${s.bucle ? "BUCLE (ambiente de escena, loop:true)" : "golpe (loop:false)"} · ${s.cuando}` +
    `${s.conEfecto ? ` (efecto: ${s.conEfecto})` : ""}`);
}
