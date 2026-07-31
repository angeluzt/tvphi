// Motor de efectos (partículas) para "Historias narradas".
//
// Portado del motor suelto que se probaba en un HTML aparte. Tres diferencias
// que importan:
//
//   · Se dibuja sobre el MISMO lienzo que graba el exportador, así que sale por
//     el códec de video a resolución completa. Se han quitado los apaños que
//     tenía para sobrevivir al GIF (256 colores y transparencia de 1 bit), que
//     era lo que ensuciaba los brillos.
//   · La física va a pasos fijos de 1/60 s, no a lo que dé el navegador: la
//     previsualización y el archivo exportado enseñan lo mismo aunque el equipo
//     vaya justo.
//   · El azar sale de una semilla por capa, no de Math.random. Así una toma se
//     ve igual cada vez que se reproduce, se exporta o se busca con la barra —
//     y se puede comprobar en una prueba.
//
// La escena se pide siempre por tiempo absoluto de la toma (`seek`), nunca
// "avanza un frame": el reproductor salta y retrocede, y el motor tiene que
// saber rehacer el estado desde el principio.

const PASO = 1 / 60; // segundos por paso de simulación
const ALTO_BASE = 480; // el motor se ajustó a esta altura; todo se escala desde aquí
// Al empezar una toma, los efectos continuos (lluvia, niebla, polvo…) tardarían
// un rato en llenar el cuadro: al cambiar de escena se vería la lluvia
// "apareciendo", que es el brinco que se nota. Se simulan estos pasos por
// adelantado para que arranquen ya establecidos. Segundo y medio basta para que
// una gota cruce la pantalla entera.
const PRECALENTADO = 90;
const APAGADO = 8; // fotogramas que tarda en apagarse una partícula al pasar su tope
const MAX_PASOS = 900; // tope de puesta al día (15 s) para que un salto no cuelgue

export type VfxKind =
  | "explosion" | "chispas" | "destello" | "shockwave" | "aura"
  | "fuego" | "lluvia" | "nieve" | "niebla" | "ceniza" | "hojas"
  | "rayo" | "portal" | "glitch" | "speedlines" | "luz" | "baliza"
  | "neon" | "navidad" | "magiccircle" | "escarcha" | "polvo"
  | "humo" | "burbujas" | "confeti" | "estrellas"
  | "lampara" | "haces" | "fugaces" | "salpicadura" | "electricidad" | "corazones";

// Cómo se coloca el efecto sobre la imagen. Un mismo efecto admite varias
// formas, y casi siempre VARIOS sitios a la vez: la gracia es tocar tres ramas
// de un árbol y que ardan las tres, o picar dos puntos y que caigan dos chorros.
//   · "arriba": una franja a lo ancho por arriba (lluvia cayendo del cielo)
//   · "punto":  un sitio suelto (una hoguera, un chorro, una explosión)
//   · "linea":  de un punto a otro (una rama, un tubo de neón, un rayo)
//   · "libre":  un trazo a mano alzada, que por dentro son muchas líneas
export type VfxShape = "arriba" | "punto" | "linea" | "libre";

export const SHAPE_LABEL: Record<VfxShape, string> = {
  arriba: "Desde arriba",
  punto: "Puntos sueltos",
  linea: "Líneas",
  libre: "A mano alzada",
};

export interface VfxParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export type VfxGroup = "golpes" | "fuego" | "clima" | "ambiente" | "luces";
export const GROUP_LABEL: Record<VfxGroup, string> = {
  golpes: "Golpes e impactos",
  fuego: "Fuego y energía",
  clima: "Clima",
  ambiente: "Ambiente",
  luces: "Luces y neón",
};

export interface VfxSpec {
  id: VfxKind;
  label: string;
  group: VfxGroup;
  shapes: VfxShape[]; // la primera es la de serie
  color: string | null; // color por defecto, o null si el efecto no lo usa
  params: VfxParam[];
  // Los que no paran de emitir mientras dure su rato. Los demás son un golpe.
  continuo: boolean;
}

const P = (key: string, label: string, min = 0.2, max = 3, step = 0.05): VfxParam =>
  ({ key, label, min, max, step });
const INTENSIDAD = P("intensity", "Cantidad");
const TAMANO = P("size", "Tamaño");
const VELOCIDAD = P("speed", "Velocidad");
const VIENTO = P("wind", "Viento", -3, 3, 0.1);
// Los golpes (explosión, onda, líneas…) son de un disparo. Con estos dos se
// vuelven repetibles: cada cuánto vuelven a saltar y cuánto se separan del
// sitio marcado, para que no caigan siempre en el mismo pixel.
const REPETIR = P("every", "Cada cuántos segundos se repite (0 = una sola vez)", 0, 8, 0.1);
const REPARTO = P("spread", "Se reparte alrededor del sitio", 0, 1, 0.02);
// Cuánto aguantan las partículas antes de esfumarse, medido DESDE EL SITIO por
// el que salen, no como una altura fija del cuadro. En 0 no se esfuman y viajan
// hasta salirse; en 1 llegan justo al borde; en 0.4, se apagan al recorrer el
// 40 % de lo que hay del sitio al borde. Así vale igual para un chorro que cae
// desde arriba, uno que sale por la mitad, o humo que sube: siempre se cuenta
// desde donde nace.
// Hacia dónde van. Negativo sube, positivo cae. Cada efecto arranca con lo
// suyo (las burbujas suben, la lluvia cae) pero se puede dar la vuelta: hay
// quien quiere corazones lloviendo y quien los quiere subiendo.
const SENTIDO = P("sentido", "Sube (−1) / cae (+1)", -1, 1, 0.05);
const LIMITE = P("limit", "Se esfuman tras recorrer (0 = hasta salir del cuadro)", 0, 1, 0.01);

export const VFX: VfxSpec[] = [
  { id: "explosion", label: "Explosión", group: "golpes", shapes: ["punto"], color: "#ff8a3d", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, REPETIR, REPARTO] },
  { id: "chispas", label: "Chispas", group: "golpes", shapes: ["punto"], color: "#ffd23f", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, P("gravity", "Peso"), REPETIR, REPARTO] },
  { id: "destello", label: "Destello", group: "golpes", shapes: ["punto"], color: "#8fd3ff", continuo: false,
    params: [INTENSIDAD, TAMANO, P("duration", "Cuánto aguanta"), REPETIR, REPARTO] },
  { id: "shockwave", label: "Onda de choque", group: "golpes", shapes: ["punto"], color: "#ffffff", continuo: false,
    params: [TAMANO, VELOCIDAD, P("thickness", "Grosor"), REPETIR, REPARTO] },
  { id: "escarcha", label: "Escarcha / hielo", group: "golpes", shapes: ["punto"], color: "#bff2ff", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, REPETIR, REPARTO] },
  { id: "speedlines", label: "Líneas de velocidad", group: "golpes", shapes: ["punto"], color: "#ffffff", continuo: false,
    params: [INTENSIDAD, P("thickness", "Grosor"), P("length", "Largo"), REPETIR, REPARTO] },
  { id: "glitch", label: "Glitch digital", group: "golpes", shapes: ["punto"], color: null, continuo: false,
    params: [INTENSIDAD, TAMANO, P("duration", "Cuánto aguanta"), REPETIR, REPARTO] },
  { id: "magiccircle", label: "Círculo mágico", group: "fuego", shapes: ["punto"], color: "#b98bff", continuo: false,
    params: [TAMANO, VELOCIDAD, P("duration", "Cuánto aguanta"), REPETIR, REPARTO] },

  { id: "fuego", label: "Fuego", group: "fuego", shapes: ["punto", "linea", "libre"], color: "#ff8a3d", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, LIMITE] },
  { id: "aura", label: "Aura de energía", group: "fuego", shapes: ["punto"], color: "#7effc2", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, P("turb", "Revuelo"), LIMITE] },
  { id: "portal", label: "Portal", group: "fuego", shapes: ["punto"], color: "#7ee8ff", continuo: true,
    params: [TAMANO, VELOCIDAD, INTENSIDAD, P("dir", "Hacia dentro (0) / fuera (1)", 0, 1, 1)] },
  { id: "luz", label: "Luz (esfera)", group: "luces", shapes: ["punto"], color: "#a0c8ff", continuo: true,
    params: [INTENSIDAD, TAMANO, P("blink", "Parpadeo")] },
  { id: "baliza", label: "Baliza (policía / ambulancia)", group: "luces", shapes: ["punto"], color: null, continuo: true,
    params: [TAMANO, P("blink", "Parpadeo"), INTENSIDAD, P("preset", "Policía (0) / ambulancia (1)", 0, 1, 1)] },
  { id: "neon", label: "Neón", group: "luces", shapes: ["linea", "libre", "punto"], color: "#ff2fd6", continuo: true,
    params: [P("thickness", "Grosor"), INTENSIDAD, P("blink", "Parpadeo")] },
  { id: "navidad", label: "Luces navideñas", group: "luces", shapes: ["linea", "libre"], color: null, continuo: true,
    params: [TAMANO, P("spacing", "Separación"), P("blink", "Parpadeo")] },
  { id: "rayo", label: "Rayo", group: "clima", shapes: ["arriba", "linea", "punto"], color: null, continuo: true,
    params: [P("thickness", "Grosor"), P("branch", "Ramas"), P("flicker", "Parpadeo"),
             P("stormrate", "Cada cuánto cae", 0.05, 3, 0.05),
             P("flash", "Fogonazo en toda la pantalla", 0, 1, 1)] },

  { id: "lluvia", label: "Lluvia", group: "clima", shapes: ["arriba", "punto", "linea", "libre"], color: "#8fc4ff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO, LIMITE] },
  { id: "nieve", label: "Nieve", group: "clima", shapes: ["arriba", "punto", "linea", "libre"], color: "#ffffff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO, LIMITE, SENTIDO] },
  { id: "ceniza", label: "Ceniza", group: "ambiente", shapes: ["arriba", "punto", "linea", "libre"], color: "#caa27a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, LIMITE, SENTIDO] },
  { id: "hojas", label: "Hojas / pétalos", group: "ambiente", shapes: ["arriba", "punto", "linea", "libre"], color: "#8a6a3a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO, LIMITE, SENTIDO] },
  { id: "polvo", label: "Polvo mágico / luciérnagas", group: "ambiente", shapes: ["arriba", "punto", "linea", "libre"], color: "#ffe28a", continuo: true,
    params: [INTENSIDAD, TAMANO, P("blink", "Parpadeo"), VELOCIDAD, LIMITE, SENTIDO] },
  { id: "niebla", label: "Niebla", group: "clima", shapes: ["punto", "linea", "arriba", "libre"], color: "#cfd6e6", continuo: true,
    params: [P("density", "Densidad"), VELOCIDAD, TAMANO] },

  // Añadidos aprovechando lo que el motor ya sabe hacer.
  { id: "humo", label: "Humo", group: "fuego", shapes: ["punto", "linea", "libre"], color: "#8a8a8a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, LIMITE] },
  { id: "burbujas", label: "Burbujas", group: "ambiente", shapes: ["punto", "linea", "libre", "arriba"], color: "#bfe8ff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, LIMITE, SENTIDO] },
  { id: "confeti", label: "Confeti", group: "ambiente", shapes: ["arriba", "punto", "linea", "libre"], color: "#ff5fa2", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO, LIMITE, SENTIDO] },
  { id: "estrellas", label: "Estrellas / brillos", group: "luces", shapes: ["arriba", "punto", "linea", "libre"], color: "#fff3b0", continuo: true,
    params: [INTENSIDAD, TAMANO, P("blink", "Parpadeo"), SENTIDO] },

  // Luz sin partículas: solo el resplandor. Es lo que hace falta para una
  // farola, una ventana encendida o un cartel: una mancha de luz tenue que
  // late, no un chorro de puntitos.
  { id: "lampara", label: "Luz suave (lámpara)", group: "luces", shapes: ["punto", "linea", "libre"], color: "#ffd9a0", continuo: true,
    params: [TAMANO, P("ancho", "Alargada (óvalo)", 0.2, 4, 0.05),
             P("intensity", "Tenuidad", 0.05, 1.5, 0.05),
             P("blink", "Velocidad del parpadeo", 0, 3, 0.05),
             P("nervio", "Parpadeo nervioso (0 = latido suave)", 0, 1, 1)] },
  { id: "haces", label: "Rayos de luz (haces)", group: "luces", shapes: ["punto"], color: "#ffe9b8", continuo: true,
    params: [P("rayos", "Cuántos rayos", 1, 12, 1), P("length", "Largo"),
             P("intensity", "Tenuidad", 0.05, 1.2, 0.05), P("speed", "Velocidad del giro", 0, 3, 0.05)] },
  { id: "electricidad", label: "Chispazos eléctricos", group: "luces", shapes: ["punto", "linea"], color: null, continuo: true,
    params: [TAMANO, P("branch", "Ramas"), P("stormrate", "Cada cuánto salta", 0.2, 8, 0.1),
             P("flash", "Fogonazo en toda la pantalla", 0, 1, 1)] },

  { id: "fugaces", label: "Estrellas fugaces", group: "clima", shapes: ["arriba", "punto", "linea"], color: "#dbe9ff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, P("angulo", "Inclinación", -1, 1, 0.05), LIMITE] },
  { id: "corazones", label: "Corazones", group: "ambiente", shapes: ["punto", "linea", "libre", "arriba"], color: "#ff5f8a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO, LIMITE, SENTIDO] },
  { id: "salpicadura", label: "Salpicadura de agua", group: "golpes", shapes: ["punto", "linea"], color: "#bfe4ff", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, REPETIR, REPARTO] },
];

export const vfxSpec = (k: VfxKind) => VFX.find((v) => v.id === k) ?? VFX[0];

export function vfxDefaults(k: VfxKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of vfxSpec(k).params) {
    // Los interruptores (0/1) empiezan apagados; el resto, a la mitad natural.
    // Los interruptores (0/1) empiezan apagados; "cada cuánto", "reparto" y
    // "viento" empiezan en cero (un golpe suelto, centrado y sin viento); el
    // resto, a la mitad natural.
    const enCero = p.key === "wind" || p.key === "every" || p.key === "spread";
    out[p.key] = p.step === 1 ? p.min : (enCero ? 0 : 1);
  }
  if (k === "rayo") { out.stormrate = 0.5; out.flash = 1; } // el fogonazo viene puesto
  if (k === "neon") out.blink = 0.5;
  if (k === "hojas") out.wind = 0.5;
  // El sentido de serie es el natural de cada efecto: lo que flota, flota.
  const SUBEN = ["polvo", "burbujas", "corazones", "ceniza", "estrellas"];
  if ("sentido" in out) out.sentido = SUBEN.includes(k) ? -1 : 1;
  return out;
}

// ---------------------------------------------------------------------------
// Azar con semilla: la misma toma se ve igual siempre
// ---------------------------------------------------------------------------
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function semilla(txt: string) {
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Hsl { h: number; s: number; l: number }
function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : (l > 0.5 ? d / (2 - max - min) : d / (max + min));
  if (d !== 0) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
interface Part {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; maxLife: number;
  hue: number; sat: number; light: number;
  gravity: number; drag: number;
  type: "glow" | "spark" | "rain" | "leaf" | "smoke" | "portal" | "heart" | "bubble";
  blend: string;
  trail?: { x: number; y: number }[];
  sway?: number; swayPhase?: number; rot?: number; rotSpeed?: number;
  cx?: number; cy?: number; angle?: number; radius?: number;
  angularSpeed?: number; radialSpeed?: number;
  // De dónde salió y cuánto puede recorrer antes de esfumarse (px), más el
  // contador de apagado una vez pasado ese recorrido.
  ox?: number; oy?: number; recorrido?: number; apagando?: number;
}
interface Flash { x: number; y: number; r: number; maxR: number; alpha: number; hue: number }
interface Seg { x1: number; y1: number; x2: number; y2: number }
interface Bolt { trunk: Seg[]; branches: Seg[][]; life: number; maxLife: number; thickness: number; flash: boolean }
interface Shock { x: number; y: number; r: number; maxR: number; alpha: number; thickness: number; hue: number; speed: number }
interface SpeedBurst { x: number; y: number; lines: { angle: number; len: number }[]; life: number; maxLife: number; thickness: number; hue: number }
interface Glitch { x: number; y: number; w: number; h: number; life: number; maxLife: number; density: number }
interface Circle { x: number; y: number; life: number; maxLife: number; angle: number; rotSpeed: number; size: number; color: Hsl }
interface Fog { id: string; x: number; y: number; x2: number; y2: number; phase: number; par: Record<string, number>; color: Hsl }
interface Neon { id: string; mode: "point" | "line"; x: number; y: number; x2: number; y2: number; thickness: number; color: Hsl; dim: boolean; dimTimer: number; flickerRate: number }
interface Bulb { t: number; colorIdx: number; phase: number }
interface Xmas { id: string; x: number; y: number; x2: number; y2: number; bulbs: Bulb[]; size: number; blink: number }
interface Beacon { id: string; x: number; y: number; colors: Hsl[]; pattern: "rotate" | "strobe"; phase: number; par: Record<string, number> }
interface Lamp { id: string; x: number; y: number; x2: number; y2: number; phase: number; color: Hsl; par: Record<string, number>; nivel: number }
interface Haz { id: string; x: number; y: number; phase: number; color: Hsl; par: Record<string, number> }
interface Chispazo { id: string; x: number; y: number; x2: number; y2: number; par: Record<string, number>; t: number; cada: number }
interface Orb { id: string; x: number; y: number; phase: number; color: Hsl; par: Record<string, number> }
interface Portal { id: string; x: number; y: number; phase: number; color: Hsl; par: Record<string, number> }
interface Aura { id: string; x: number; y: number; color: Hsl; par: Record<string, number> }
interface Fire { id: string; x: number; y: number; x2: number; y2: number; color: Hsl; par: Record<string, number>; humo: boolean }
interface Ambient { id: string; kind: VfxKind; x: number; y: number; x2: number; y2: number; color: Hsl; par: Record<string, number> }
// Un golpe que vuelve a saltar cada cierto rato.
interface BurstEm {
  id: string; kind: VfxKind; x: number; y: number;
  color: Hsl; par: Record<string, number>; t: number; cada: number;
}
interface Storm { id: string; x: number; y: number; x2: number; y2: number; par: Record<string, number>; t: number; cada: number; arriba: boolean }

// Lo que el motor necesita saber de una capa. El modelo guarda algo más
// (cuándo se ve), pero aquí solo llega lo que se dibuja.
export interface VfxNodeIn { x: number; y: number; x2: number; y2: number } // 0..1
export interface VfxInput {
  id: string;
  kind: VfxKind;
  shape: VfxShape;
  // Todos los sitios donde actúa: tres puntos de fuego son tres nodos. Un punto
  // suelto es un nodo con inicio y fin en el mismo sitio.
  nodes: VfxNodeIn[];
  colorHex: string;
  params: Record<string, number>;
  start: number; // segundos dentro de la toma
  end: number;
}

const AMBIENT_CONFIG: Record<string, {
  sizeMin: number; sizeMax: number; vxMin: number; vxMax: number; vyMin: number; vyMax: number;
  gravity: number; drag: number; maxLife: number; renderType: Part["type"]; blend: string;
  sway: boolean; rotate: boolean;
}> = {
  lluvia: { sizeMin: 0.8, sizeMax: 1.6, vxMin: -0.3, vxMax: 0.3, vyMin: 6, vyMax: 10, gravity: 0.08, drag: 0.999, maxLife: 220, renderType: "rain", blend: "source-over", sway: false, rotate: false },
  nieve: { sizeMin: 1.5, sizeMax: 3.5, vxMin: -0.2, vxMax: 0.2, vyMin: 0.6, vyMax: 1.6, gravity: 0.002, drag: 0.999, maxLife: 400, renderType: "glow", blend: "source-over", sway: true, rotate: false },
  ceniza: { sizeMin: 1.5, sizeMax: 3, vxMin: -0.3, vxMax: 0.3, vyMin: -0.6, vyMax: 0.3, gravity: -0.001, drag: 0.995, maxLife: 260, renderType: "glow", blend: "lighter", sway: true, rotate: false },
  hojas: { sizeMin: 3, sizeMax: 6, vxMin: -0.3, vxMax: 0.3, vyMin: 1, vyMax: 2, gravity: 0.01, drag: 0.997, maxLife: 300, renderType: "leaf", blend: "source-over", sway: true, rotate: true },
  polvo: { sizeMin: 1, sizeMax: 2.2, vxMin: -0.2, vxMax: 0.2, vyMin: -0.5, vyMax: -0.1, gravity: 0, drag: 0.99, maxLife: 180, renderType: "glow", blend: "lighter", sway: true, rotate: false },
  // Suben despacio y se van; el vaivén las hace parecer agua.
  burbujas: { sizeMin: 3, sizeMax: 8, vxMin: -0.15, vxMax: 0.15, vyMin: -1.6, vyMax: -0.6, gravity: -0.004, drag: 0.995, maxLife: 240, renderType: "bubble", blend: "source-over", sway: true, rotate: false },
  // Papelitos: caen dando vueltas, como las hojas pero más vivos.
  confeti: { sizeMin: 2, sizeMax: 4.5, vxMin: -0.6, vxMax: 0.6, vyMin: 1.2, vyMax: 2.6, gravity: 0.012, drag: 0.996, maxLife: 300, renderType: "leaf", blend: "source-over", sway: true, rotate: true },
  // Cruzan el cuadro de largo y dejan estela.
  fugaces: { sizeMin: 1.2, sizeMax: 2.6, vxMin: 3, vxMax: 6, vyMin: 2.5, vyMax: 5, gravity: 0, drag: 1, maxLife: 90, renderType: "spark", blend: "lighter", sway: false, rotate: false },
  // Suben flotando y se balancean.
  corazones: { sizeMin: 6, sizeMax: 13, vxMin: -0.25, vxMax: 0.25, vyMin: -1.5, vyMax: -0.6, gravity: -0.003, drag: 0.995, maxLife: 260, renderType: "heart", blend: "source-over", sway: true, rotate: false },
  // Casi quietas: solo están y brillan.
  estrellas: { sizeMin: 0.8, sizeMax: 2, vxMin: -0.06, vxMax: 0.06, vyMin: -0.06, vyMax: 0.06, gravity: 0, drag: 0.99, maxLife: 200, renderType: "glow", blend: "lighter", sway: false, rotate: false },
};
const XMAS: Hsl[] = [
  { h: 0, s: 80, l: 55 }, { h: 140, s: 70, l: 45 }, { h: 45, s: 90, l: 60 },
  { h: 215, s: 80, l: 55 }, { h: 0, s: 0, l: 95 },
];
const BALIZAS: { colors: Hsl[]; pattern: "rotate" | "strobe" }[] = [
  { colors: [{ h: 0, s: 85, l: 55 }, { h: 215, s: 90, l: 55 }], pattern: "rotate" },
  { colors: [{ h: 0, s: 85, l: 55 }, { h: 0, s: 0, l: 95 }], pattern: "strobe" },
];

export class VfxScene {
  private w = 1280;
  private h = 720;
  private k = 1.5; // escala respecto a la altura para la que se ajustó el motor

  private parts: Part[] = [];
  private flashes: Flash[] = [];
  private bolts: Bolt[] = [];
  private shocks: Shock[] = [];
  private speeds: SpeedBurst[] = [];
  private glitches: Glitch[] = [];
  private circles: Circle[] = [];
  private fogs: Fog[] = [];
  private neons: Neon[] = [];
  private xmas: Xmas[] = [];
  private beacons: Beacon[] = [];
  private orbs: Orb[] = [];
  private lamps: Lamp[] = [];
  private haces: Haz[] = [];
  private chispazos: Chispazo[] = [];
  private portals: Portal[] = [];
  private auras: Aura[] = [];
  private fires: Fire[] = [];
  private ambients: Ambient[] = [];
  private storms: Storm[] = [];
  private bursts: BurstEm[] = [];

  // Sprites de resplandor ya dibujados. Crear un degradado radial por partícula
  // era, de largo, lo más caro del repintado: con mil partículas son mil
  // degradados en cada fotograma. Dibujados una vez y reutilizados, queda en un
  // drawImage por partícula.
  private sprites = new Map<string, HTMLCanvasElement>();

  private rnd: () => number = Math.random;
  private clave = "";
  private t = 0;
  private vivos = new Set<string>(); // capas cuyo golpe ya se disparó

  setSize(w: number, h: number) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h; this.k = h / ALTO_BASE;
    this.limpiar();
  }

  private limpiar() {
    this.parts = []; this.flashes = []; this.bolts = []; this.shocks = [];
    this.speeds = []; this.glitches = []; this.circles = []; this.fogs = [];
    this.neons = []; this.xmas = []; this.beacons = []; this.orbs = [];
    this.portals = []; this.auras = []; this.fires = []; this.ambients = [];
    this.lamps = []; this.haces = []; this.chispazos = [];
    this.storms = []; this.bursts = []; this.vivos.clear();
    this.t = 0;
  }

  hayAlgo() {
    return this.parts.length > 0 || this.flashes.length > 0 || this.bolts.length > 0 ||
      this.shocks.length > 0 || this.speeds.length > 0 || this.glitches.length > 0 ||
      this.circles.length > 0 || this.fogs.length > 0 || this.neons.length > 0 ||
      this.xmas.length > 0 || this.beacons.length > 0 || this.orbs.length > 0 ||
      this.portals.length > 0;
  }

  // Deja la simulación en el segundo `t` de esa toma. Si el reproductor ha
  // saltado hacia atrás (o a otra toma) se rehace desde cero; si ha saltado
  // muy hacia delante se simulan solo los últimos segundos, que es lo que se
  // nota, en vez de colgar el navegador poniéndose al día.
  seek(clave: string, capas: VfxInput[], t: number) {
    if (clave !== this.clave || t < this.t - PASO / 2) {
      this.clave = clave;
      this.limpiar();
      this.rnd = mulberry32(semilla(clave));
    }
    // El número de pasos hasta el segundo `t` tiene que salir SOLO de `t`, no
    // de cada cuánto pregunte el reproductor. Por eso el reloj de la simulación
    // avanza en múltiplos exactos del paso y el resto se queda para la próxima:
    // si se guardara `t` a secas, el sobrante se perdería y dos reproducciones
    // del mismo trozo acabarían con distinto número de pasos —y por tanto con
    // distintas partículas—, que es justo lo que había que evitar.
    let objetivo = Math.floor(t / PASO + 1e-9);
    let hechos = Math.round(this.t / PASO);
    if (objetivo - hechos > MAX_PASOS) {
      // Salto grande: se rehace y se simulan solo los últimos MAX_PASOS. Aquí
      // se acepta perder la igualdad exacta: es un salto con la barra, no una
      // reproducción seguida (que es la que acaba en el archivo exportado).
      this.limpiar();
      this.rnd = mulberry32(semilla(clave));
      hechos = objetivo - MAX_PASOS;
      this.t = hechos * PASO;
    }
    if (objetivo <= hechos) return;
    // Escena recién montada: se le da un empujón para que lo continuo ya esté
    // en marcha en el primer fotograma.
    if (hechos === 0) this.precalentar(capas);
    for (let i = hechos; i < objetivo; i++) {
      this.montar(capas, i * PASO);
      this.recolocar(capas);
      this.emitir();
      this.fisica();
    }
    this.t = objetivo * PASO;
  }

  // Da de alta y de baja las capas según su rato dentro de la toma.
  // Arranca los efectos continuos "ya rodados": se simulan unos cuantos pasos
  // antes del segundo cero para que la lluvia esté cayendo y la niebla puesta
  // desde el primer fotograma, en vez de irse llenando a la vista.
  //
  // Solo lo continuo: un golpe (una explosión) tiene que saltar cuando le toca,
  // no antes, así que se queda fuera.
  private precalentar(capas: VfxInput[]) {
    const continuos = capas.filter((c) => vfxSpec(c.kind).continuo);
    if (!continuos.length) return;
    for (let i = 0; i < PRECALENTADO; i++) {
      this.montar(continuos, 0);
      this.recolocar(continuos);
      this.emitir();
      this.fisica();
    }
  }

  // Pone al día los emisores vivos: su sitio y sus ajustes.
  //
  // El sitio, porque una capa que sigue a la toma se mueve con la cámara y la
  // hoguera tiene que quedarse donde está en la imagen, no en el cuadro.
  //
  // Los ajustes, porque tocar una barra NO puede rehacer la simulación: se
  // cambian sobre la marcha en los emisores que ya están, y lo siguiente que
  // emitan sale con el valor nuevo. Lo ya soltado no se toca — el humo que
  // subió, subió.
  private recolocar(capas: VfxInput[]) {
    for (const c of capas) {
      const col = hexToHsl(c.colorHex || "#ffffff");
      c.nodes.forEach((n, i) => {
        const clave = `${c.id}#${i}`;
        const x = n.x * this.w, y = n.y * this.h;
        const x2 = n.x2 * this.w, y2 = n.y2 * this.h;
        for (const e of this.fires) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.ambients) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.auras) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.orbs) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.portals) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.beacons) if (e.id === clave) e.par = c.params;
        for (const e of this.fogs) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.storms) if (e.id === clave) e.par = c.params;
        for (const e of this.lamps) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.haces) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.chispazos) if (e.id === clave) e.par = c.params;
        for (const e of this.bursts) if (e.id === clave) { e.par = c.params; e.color = col; }
        for (const e of this.neons) if (e.id === clave) { e.color = col; e.thickness = (c.params.thickness ?? 1) * 3 * this.k; }
        for (const e of this.bursts) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.lamps) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.haces) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.chispazos) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.fires) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.ambients) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.auras) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.orbs) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.portals) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.beacons) if (e.id === clave) { e.x = x; e.y = y; }
        for (const e of this.fogs) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.storms) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.neons) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
        for (const e of this.xmas) if (e.id === clave) { e.x = x; e.y = y; e.x2 = x2; e.y2 = y2; }
      });
    }
  }

  private montar(capas: VfxInput[], t: number) {
    for (const c of capas) {
      const dentro = t >= c.start && t < c.end;
      // Cada sitio va por su cuenta: así se pueden tener tres hogueras de un
      // mismo efecto, y quitar una sin tocar las otras.
      c.nodes.forEach((n, i) => {
        const clave = `${c.id}#${i}`;
        const yaEsta = this.vivos.has(clave);
        if (dentro && !yaEsta) { this.vivos.add(clave); this.alta(c, n, clave); }
        else if (!dentro && yaEsta) { this.vivos.delete(clave); this.baja(clave); }
      });
    }
  }

  private alta(c: VfxInput, n: VfxNodeIn, clave: string) {
    const x = n.x * this.w, y = n.y * this.h;
    const x2 = n.x2 * this.w, y2 = n.y2 * this.h;
    const col = hexToHsl(c.colorHex || "#ffffff");
    const p = c.params;
    switch (c.kind) {
      case "explosion": case "chispas": case "destello": case "shockwave":
      case "escarcha": case "speedlines": case "glitch": case "magiccircle": {
        const cada = Math.max(0, p.every ?? 0);
        if (cada <= 0) {
          // De una sola vez: salta justo al empezar su rato, que es lo
          // predecible cuando se pone una explosión a un segundo concreto.
          this.golpe(c.kind, x, y, col, p);
          return;
        }
        // Repitiendo, cada uno entra con su propio desfase dentro del primer
        // intervalo: si no, tres explosiones puestas a la vez saltarían todas
        // en el mismo fotograma.
        this.bursts.push({ id: clave, kind: c.kind, x, y, color: col, par: p, t: this.r(0, cada), cada });
        return;
      }
      case "fuego": this.fires.push({ id: clave, x, y, x2, y2, color: col, par: p, humo: false }); return;
      case "humo": this.fires.push({ id: clave, x, y, x2, y2, color: col, par: p, humo: true }); return;
      case "aura": this.auras.push({ id: clave, x, y, color: col, par: p }); return;
      case "portal": this.portals.push({ id: clave, x, y, phase: 0, color: col, par: p }); return;
      case "luz": this.orbs.push({ id: clave, x, y, phase: 0, color: col, par: p }); return;
      case "baliza": {
        const b = BALIZAS[p.preset ? 1 : 0];
        this.beacons.push({ id: clave, x, y, colors: b.colors, pattern: b.pattern, phase: 0, par: p });
        return;
      }
      case "neon": {
        const punto = Math.hypot(x2 - x, y2 - y) < 6;
        this.neons.push({
          id: clave, mode: punto ? "point" : "line", x, y, x2, y2,
          thickness: (p.thickness ?? 1) * 3 * this.k, color: col,
          dim: false, dimTimer: 0, flickerRate: (p.blink ?? 0.5) * 0.01,
        });
        return;
      }
      case "navidad": this.xmas.push(this.guirnalda(clave, x, y, x2, y2, p)); return;
      case "lampara":
        this.lamps.push({ id: clave, x, y, x2, y2, phase: this.r(0, Math.PI * 2), color: col, par: p, nivel: 1 });
        return;
      case "haces":
        this.haces.push({ id: clave, x, y, phase: this.r(0, Math.PI * 2), color: col, par: p });
        return;
      case "electricidad": {
        const cada = 1 / Math.max(0.2, p.stormrate ?? 2);
        this.chispazos.push({ id: clave, x, y, x2, y2, par: p, t: this.r(0, cada), cada });
        return;
      }
      case "salpicadura": {
        // Es un golpe, como la explosión, pero de gotas.
        const cada = Math.max(0, p.every ?? 0);
        if (cada <= 0) { this.salpicar(x, y, col, p); return; }
        this.bursts.push({ id: clave, kind: c.kind, x, y, color: col, par: p, t: this.r(0, cada), cada });
        return;
      }
      case "rayo": {
        // Cada rayo arranca con su propio desfase y su propio ritmo: si no,
        // varios rayos puestos a la vez caen todos en el mismo fotograma y
        // canta muchísimo.
        const cada = 1 / Math.max(0.05, p.stormrate ?? 0.5);
        this.storms.push({
          id: clave, x, y, x2, y2, par: p,
          t: this.r(0, cada), cada, arriba: c.shape === "arriba",
        });
        return;
      }
      case "niebla": this.fogs.push({ id: clave, x, y, x2, y2, phase: this.rnd() * 6.28, par: p, color: col }); return;
      default:
        this.ambients.push({ id: clave, kind: c.kind, x, y, x2, y2, color: col, par: p });
    }
  }

  // Al acabar su rato el emisor se apaga; lo que ya soltó se apaga solo, que es
  // lo que se quiere (la lluvia que ya cae termina de caer).
  private baja(clave: string) {
    const sin = <T extends { id: string }>(a: T[]) => a.filter((e) => e.id !== clave);
    this.fires = sin(this.fires);
    this.auras = sin(this.auras);
    this.portals = sin(this.portals);
    this.orbs = sin(this.orbs);
    this.beacons = sin(this.beacons);
    this.neons = sin(this.neons);
    this.xmas = sin(this.xmas);
    this.storms = sin(this.storms);
    this.fogs = sin(this.fogs);
    this.ambients = sin(this.ambients);
    this.bursts = sin(this.bursts);
    this.lamps = sin(this.lamps);
    this.haces = sin(this.haces);
    this.chispazos = sin(this.chispazos);
  }

  private r(a: number, b: number) { return a + this.rnd() * (b - a); }

  // Cuánto puede recorrer una partícula que sale de (x, y) yendo hacia arriba o
  // hacia abajo. La referencia es lo que hay de ahí al borde por el que se
  // marcha: así "0.5" siempre quiere decir "la mitad del camino", salga el
  // chorro de donde salga.
  private corteDe(p: Record<string, number>, x: number, y: number, vy: number) {
    const l = p.limit ?? 0;
    if (!(l > 0)) return {};
    const hasta = vy >= 0 ? Math.max(1, this.h - y) : Math.max(1, y);
    return { ox: x, oy: y, recorrido: l * hasta };
  }

  // ---------------- golpes ----------------
  private explosion(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(90 * (p.intensity ?? 1));
    for (let i = 0; i < n; i++) {
      const ang = this.r(0, Math.PI * 2);
      const v = this.r(1.5, 8) * (p.speed ?? 1) * this.k;
      this.parts.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        size: this.r(1.8, 4.2) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(35, 65),
        hue: base.h + this.r(-18, 18), sat: 85, light: this.r(45, 68),
        gravity: 0.11 * this.k, drag: 0.985, type: "glow", blend: "lighter",
      });
    }
    this.flashes.push({ x, y, r: 6 * this.k, maxR: 70 * (p.size ?? 1) * this.k, alpha: 1, hue: base.h });
  }
  private chispas(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(70 * (p.intensity ?? 1));
    for (let i = 0; i < n; i++) {
      const ang = this.r(0, Math.PI * 2);
      const v = this.r(3, 11) * (p.speed ?? 1) * this.k;
      this.parts.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - this.k,
        size: this.r(1, 2.2) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(14, 32),
        hue: base.h + this.r(-10, 25), sat: 90, light: this.r(60, 85),
        gravity: 0.32 * (p.gravity ?? 1) * this.k, drag: 0.99, type: "spark", trail: [], blend: "lighter",
      });
    }
    this.flashes.push({ x, y, r: 3 * this.k, maxR: 26 * this.k, alpha: 0.8, hue: base.h + 20 });
  }
  private destello(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(55 * (p.intensity ?? 1));
    for (let i = 0; i < n; i++) {
      const ang = this.r(0, Math.PI * 2);
      const v = this.r(0.3, 1.6) * this.k;
      this.parts.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        size: this.r(1.6, 3.4) * (p.size ?? 1) * this.k, life: 0,
        maxLife: this.r(55, 100) * (p.duration ?? 1),
        hue: base.h + this.r(-14, 14), sat: 70, light: this.r(60, 85),
        gravity: -0.012 * this.k, drag: 0.996, type: "glow", blend: "lighter",
      });
    }
    this.flashes.push({ x, y, r: 8 * this.k, maxR: 100 * (p.size ?? 1) * this.k, alpha: 1, hue: base.h });
  }
  private shockwave(x: number, y: number, base: Hsl, p: Record<string, number>) {
    this.shocks.push({
      x, y, r: 6 * this.k, maxR: 130 * (p.size ?? 1) * this.k, alpha: 1,
      thickness: 2.5 * (p.thickness ?? 1) * this.k, hue: base.h, speed: p.speed ?? 1,
    });
  }
  private escarcha(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(50 * (p.intensity ?? 1));
    for (let i = 0; i < n; i++) {
      const ang = this.r(0, Math.PI * 2);
      const v = this.r(1.5, 6) * (p.speed ?? 1) * this.k;
      this.parts.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 0.5 * this.k,
        size: this.r(0.9, 2) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(30, 60),
        hue: base.h + this.r(-8, 8), sat: 60, light: this.r(75, 92),
        gravity: 0.06 * this.k, drag: 0.99, type: "spark", trail: [], blend: "lighter",
      });
    }
  }
  private speedlines(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(22 * (p.intensity ?? 1));
    const lines = [];
    for (let i = 0; i < n; i++) lines.push({ angle: this.r(0, Math.PI * 2), len: this.r(80, 220) * (p.length ?? 1) * this.k });
    this.speeds.push({ x, y, lines, life: 0, maxLife: 14, thickness: 2 * (p.thickness ?? 1) * this.k, hue: base.h });
  }
  private glitch(x: number, y: number, p: Record<string, number>) {
    this.glitches.push({
      x, y, w: 280 * (p.size ?? 1) * this.k, h: 130 * (p.size ?? 1) * this.k,
      life: 0, maxLife: Math.round(14 * (p.duration ?? 1)), density: p.intensity ?? 1,
    });
  }
  private circulo(x: number, y: number, col: Hsl, p: Record<string, number>) {
    this.circles.push({
      x, y, life: 0, maxLife: Math.round(70 * (p.duration ?? 1)), angle: 0,
      rotSpeed: 0.02 * (p.speed ?? 1), size: 60 * (p.size ?? 1) * this.k, color: col,
    });
  }
  private guirnalda(id: string, x: number, y: number, x2: number, y2: number, p: Record<string, number>): Xmas {
    const dist = Math.hypot(x2 - x, y2 - y);
    const spacing = (22 * this.k) / (p.spacing ?? 1);
    const n = Math.max(2, Math.round(dist / spacing));
    const bulbs: Bulb[] = [];
    for (let i = 0; i <= n; i++) bulbs.push({ t: i / n, colorIdx: Math.floor(this.r(0, 5)), phase: this.r(0, Math.PI * 2) });
    return { id, x, y, x2, y2, bulbs, size: (p.size ?? 1) * this.k, blink: p.blink ?? 1 };
  }

  // Lanza un golpe del tipo que sea, repartido alrededor del sitio si se ha
  // pedido: sin esto una explosión que se repite cae siempre en el mismo pixel.
  private golpe(kind: VfxKind, x: number, y: number, col: Hsl, p: Record<string, number>) {
    const radio = Math.max(0, p.spread ?? 0) * this.h * 0.5;
    if (radio > 0) {
      const a = this.r(0, Math.PI * 2);
      // Raíz cuadrada del azar: así se reparten por todo el círculo y no se
      // amontonan en el centro.
      const d = Math.sqrt(this.rnd()) * radio;
      x += Math.cos(a) * d;
      y += Math.sin(a) * d;
    }
    switch (kind) {
      case "explosion": return this.explosion(x, y, col, p);
      case "chispas": return this.chispas(x, y, col, p);
      case "destello": return this.destello(x, y, col, p);
      case "shockwave": return this.shockwave(x, y, col, p);
      case "escarcha": return this.escarcha(x, y, col, p);
      case "speedlines": return this.speedlines(x, y, col, p);
      case "glitch": return this.glitch(x, y, p);
      case "magiccircle": return this.circulo(x, y, col, p);
      case "salpicadura": return this.salpicar(x, y, col, p);
      default: return;
    }
  }

  // Gotas que saltan hacia arriba y vuelven a caer: el remate de una cascada
  // contra la poza, o un charco cuando algo lo pisa.
  private salpicar(x: number, y: number, base: Hsl, p: Record<string, number>) {
    const n = Math.round(40 * (p.intensity ?? 1));
    for (let i = 0; i < n; i++) {
      // Reparto en abanico hacia arriba, no en círculo: el agua no sale del suelo.
      const ang = -Math.PI / 2 + this.r(-1.1, 1.1);
      const v = this.r(2, 7) * (p.speed ?? 1) * this.k;
      this.parts.push({
        x: x + this.r(-6, 6) * this.k, y,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        size: this.r(0.9, 2.2) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(25, 55),
        hue: base.h + this.r(-6, 6), sat: Math.max(20, base.s - 20), light: this.r(70, 92),
        gravity: 0.28 * this.k, drag: 0.995, type: "spark", trail: [], blend: "lighter",
      });
    }
  }

  // ---------------- rayo ----------------
  private segmentos(x1: number, y1: number, x2: number, y2: number, disp: number): Seg[] {
    const segs: Seg[] = [];
    const sub = (a: number, b: number, c: number, d: number, dp: number, depth: number) => {
      if (depth <= 0 || dp < 3) { segs.push({ x1: a, y1: b, x2: c, y2: d }); return; }
      const mx = (a + c) / 2 + this.r(-dp, dp), my = (b + d) / 2 + this.r(-dp, dp);
      sub(a, b, mx, my, dp / 1.8, depth - 1);
      sub(mx, my, c, d, dp / 1.8, depth - 1);
    };
    sub(x1, y1, x2, y2, disp, 5);
    return segs;
  }
  private rayo(x1: number, y1: number, x2: number, y2: number, p: Record<string, number>) {
    const dist = Math.max(20, Math.hypot(x2 - x1, y2 - y1));
    const disp = clamp(dist * 0.18, 10, 60 * this.k);
    const trunk = this.segmentos(x1, y1, x2, y2, disp);
    const branches: Seg[][] = [];
    const n = Math.round(this.r(1, 4) * (p.branch ?? 1));
    const ang0 = Math.atan2(y2 - y1, x2 - x1);
    for (let i = 0; i < n; i++) {
      const seg = trunk[Math.floor(this.r(0, trunk.length))];
      const a = ang0 + this.r(-0.9, 0.9);
      const len = this.r(dist * 0.12, dist * 0.3);
      branches.push(this.segmentos(seg.x2, seg.y2, seg.x2 + Math.cos(a) * len, seg.y2 + Math.sin(a) * len, disp * 0.5));
    }
    this.bolts.push({
      trunk, branches, life: 0,
      maxLife: Math.round(this.r(16, 24) / (p.flicker ?? 1)),
      thickness: (p.thickness ?? 1) * this.k,
      // El fogonazo que blanquea todo el cuadro se puede apagar: queda genial
      // en una tormenta y estorba si el rayo es un detalle de la escena.
      flash: (p.flash ?? 1) > 0.5,
    });
  }

  // ---------------- emisión continua ----------------
  private emitir() {
    for (const e of this.fires) {
      const p = e.par;
      const n = Math.max(1, Math.round(2 * (p.intensity ?? 1)));
      for (let i = 0; i < n; i++) {
        const t = this.rnd();
        const ex = e.x + (e.x2 - e.x) * t, ey = e.y + (e.y2 - e.y) * t;
        if (e.humo) {
          // Columna de humo: sube más despacio, se abre y no ilumina nada.
          this.parts.push({
            x: ex + this.r(-6, 6) * this.k, y: ey + this.r(-3, 3) * this.k,
            vx: this.r(-0.25, 0.25) * this.k, vy: this.r(-1.4, -0.6) * (p.speed ?? 1) * this.k,
            size: this.r(5, 11) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(60, 110),
            hue: e.color.h, sat: Math.min(e.color.s, 20), light: e.color.l,
            gravity: -0.005 * this.k, drag: 0.985,
            sway: this.r(0.2, 0.7), swayPhase: this.r(0, Math.PI * 2),
            type: "smoke", blend: "source-over",
            ...this.corteDe(p, ex, ey, -1),
          });
          continue;
        }
        this.parts.push({
          x: ex + this.r(-4, 4) * this.k, y: ey + this.r(-2, 2) * this.k,
          vx: this.r(-0.4, 0.4) * this.k, vy: this.r(-2.6, -1.4) * (p.speed ?? 1) * this.k,
          size: this.r(2.5, 5) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(30, 55),
          hue: e.color.h + this.r(-12, 12), sat: 95, light: this.r(55, 70),
          gravity: -0.02 * this.k, drag: 0.985, type: "glow", blend: "lighter",
          ...this.corteDe(p, ex, ey, -1),
        });
        if (this.rnd() < 0.12) {
          this.parts.push({
            x: ex + this.r(-5, 5) * this.k, y: ey + this.r(-2, 2) * this.k,
            vx: this.r(-0.12, 0.12) * this.k, vy: this.r(-1, -0.5) * (p.speed ?? 1) * this.k,
            size: this.r(3, 5) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(28, 45),
            hue: 22, sat: 12, light: this.r(34, 44),
            gravity: -0.004 * this.k, drag: 0.98, type: "smoke", blend: "source-over",
          });
        }
      }
    }

    for (const e of this.orbs) {
      e.phase += 1;
      const p = e.par;
      if (this.rnd() < 0.06 * (p.intensity ?? 1) * 3) {
        const ang = this.r(0, Math.PI * 2), v = this.r(0.4, 1.4) * this.k;
        this.parts.push({
          x: e.x, y: e.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          size: this.r(1.5, 3) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(40, 70),
          hue: e.color.h + this.r(-10, 10), sat: 60, light: this.r(70, 90),
          gravity: 0, drag: 0.99, type: "glow", blend: "lighter",
        });
      }
    }

    for (const e of this.beacons) {
      e.phase += 1;
      const p = e.par;
      if (this.rnd() < 0.12 * (p.intensity ?? 1)) {
        const c = e.pattern === "rotate"
          ? e.colors[Math.floor(e.phase * 0.05 * (p.blink ?? 1) / Math.PI) % e.colors.length]
          : e.colors[Math.floor(e.phase * (p.blink ?? 1) / 10) % e.colors.length];
        const ang = this.r(0, Math.PI * 2), v = this.r(0.3, 1) * this.k;
        this.parts.push({
          x: e.x, y: e.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          size: this.r(1.2, 2.4) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(30, 55),
          hue: c.h, sat: c.s, light: c.l, gravity: 0, drag: 0.99, type: "glow", blend: "lighter",
        });
      }
    }

    for (const e of this.ambients) {
      const p = e.par;
      const n = Math.max(1, Math.round(1.5 * (p.intensity ?? p.density ?? 1)));
      const cfg = AMBIENT_CONFIG[e.kind];
      if (!cfg) continue;
      for (let i = 0; i < n; i++) {
        const t = this.rnd();
        const ex = e.x + (e.x2 - e.x) * t, ey = e.y + (e.y2 - e.y) * t;
        const viento = (p.wind ?? 0) * this.k;
        // El confeti es de colores: cada papelito coge el suyo.
        const tono = e.kind === "confeti" ? this.r(0, 360) : e.color.h + this.r(-8, 8);
        // Las fugaces se inclinan a gusto: -1 va hacia la izquierda, 1 a la derecha.
        const inclina = e.kind === "fugaces" ? (p.angulo ?? 0) : 0;
        // El sentido manda sobre la dirección; la config solo pone el ritmo.
        const natural = cfg.vyMin + cfg.vyMax >= 0 ? 1 : -1;
        const sent = p.sentido ?? natural;
        const vy = Math.abs(this.r(cfg.vyMin, cfg.vyMax)) * sent * (p.speed ?? 1) * this.k;
        // Lo que apenas se mueve en vertical no llega a bajar del borde: si en
        // toda su vida no puede cruzar ni medio cuadro, se reparte por el alto.
        // Así "desde arriba" quiere decir que llena la escena, no que se queda
        // en una tira pegada al canto.
        const alcance = Math.abs(vy) * cfg.maxLife;
        const bandaArriba = e.y <= 0 && e.y2 <= 0;
        const ey2 = (bandaArriba && alcance < this.h * 0.6) ? this.rnd() * this.h : ey;
        this.parts.push({
          x: ex + this.r(-4, 4) * this.k, y: ey2 + this.r(-2, 2) * this.k,
          vx: (this.r(cfg.vxMin, cfg.vxMax) * (inclina || 1)) * (p.speed ?? 1) * this.k + viento,
          vy,
          size: this.r(cfg.sizeMin, cfg.sizeMax) * (p.size ?? 1) * this.k,
          rot: cfg.rotate ? this.r(0, Math.PI * 2) : 0,
          rotSpeed: cfg.rotate ? this.r(-0.05, 0.05) : 0,
          sway: cfg.sway ? this.r(0.3, 1.1) : 0,
          swayPhase: this.r(0, Math.PI * 2),
          life: 0, maxLife: cfg.maxLife,
          hue: tono, sat: e.kind === "confeti" ? 85 : e.color.s,
          // Las estrellas nacen con brillo distinto cada una: así titilan en
          // vez de encenderse todas igual.
          light: e.kind === "estrellas" ? this.r(55, 95) : e.color.l,
          // La gravedad tira en el mismo sentido en que va: si se le da la
          // vuelta a un efecto, no puede seguir frenando hacia el otro lado.
          gravity: Math.abs(cfg.gravity) * sent * this.k, drag: cfg.drag,
          type: cfg.renderType, blend: cfg.blend,
          trail: cfg.renderType === "spark" ? [] : undefined,
          ...this.corteDe(p, ex, ey2, sent),
        });
      }
    }

    for (const e of this.auras) {
      const p = e.par;
      const n = Math.max(1, Math.round(1.5 * (p.intensity ?? 1)));
      for (let i = 0; i < n; i++) {
        this.parts.push({
          x: e.x + this.r(-6, 6) * this.k, y: e.y + this.r(-4, 4) * this.k,
          vx: this.r(-0.6, 0.6) * (p.turb ?? 1) * this.k,
          vy: this.r(-2.2, -1) * (p.speed ?? 1) * this.k,
          size: this.r(2, 4.5) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(35, 60),
          hue: e.color.h + this.r(-15, 15), sat: 80, light: this.r(55, 75),
          gravity: -0.01 * this.k, drag: 0.98, type: "glow", blend: "lighter",
          ...this.corteDe(p, e.x, e.y, -1),
        });
      }
    }

    for (const e of this.portals) {
      const p = e.par;
      e.phase += 0.06 * (p.speed ?? 1);
      const n = Math.max(1, Math.round(2 * (p.intensity ?? 1)));
      const haciaFuera = !!p.dir;
      for (let i = 0; i < n; i++) {
        const startR = haciaFuera ? 6 * this.k : 70 * (p.size ?? 1) * this.k;
        const radial = (haciaFuera ? this.r(0.6, 1.4) : -this.r(0.6, 1.4)) * this.k;
        this.parts.push({
          type: "portal", cx: e.x, cy: e.y, angle: this.r(0, Math.PI * 2), radius: startR,
          angularSpeed: this.r(0.03, 0.07) * (this.rnd() < 0.5 ? 1 : -1), radialSpeed: radial,
          x: e.x, y: e.y, vx: 0, vy: 0, size: this.r(1.4, 2.6) * (p.size ?? 1) * this.k,
          life: 0, maxLife: this.r(40, 70),
          hue: e.color.h + this.r(-10, 10), sat: 75, light: 80,
          gravity: 0, drag: 1, blend: "lighter",
        });
      }
    }

    for (const n of this.neons) {
      if (n.dim) { n.dimTimer++; if (n.dimTimer > this.r(2, 6)) { n.dim = false; n.dimTimer = 0; } }
      else if (this.rnd() < n.flickerRate) { n.dim = true; n.dimTimer = 0; }
    }
    for (const s of this.xmas) for (const b of s.bulbs) b.phase += s.blink * 0.06;
    for (const f of this.fogs) f.phase += 0.01 * (f.par.speed ?? 1);

    for (const e of this.lamps) {
      const p = e.par;
      e.phase += 0.06 * (p.blink ?? 0);
      // Dos maneras de latir: un vaivén suave (una farola respirando) o un
      // parpadeo nervioso de fluorescente estropeado.
      if ((p.nervio ?? 0) > 0.5 && (p.blink ?? 0) > 0) {
        if (this.rnd() < 0.06 * (p.blink ?? 1)) e.nivel = this.r(0.15, 1);
        else e.nivel += (1 - e.nivel) * 0.15;
      } else {
        e.nivel = (p.blink ?? 0) > 0 ? 0.72 + 0.28 * Math.sin(e.phase) : 1;
      }
    }
    for (const e of this.haces) e.phase += 0.01 * (e.par.speed ?? 1);
    for (const e of this.chispazos) {
      e.t += PASO;
      if (e.t < e.cada) continue;
      e.cada = (1 / Math.max(0.2, e.par.stormrate ?? 2)) * this.r(0.5, 1.5);
      e.t = 0;
      // Chispazo corto y desordenado alrededor del sitio: no es un rayo de
      // tormenta, es un cable pelado.
      const largo = 40 * (e.par.size ?? 1) * this.k;
      const a = this.r(0, Math.PI * 2);
      // Un punto cualquiera del tramo: con una línea, los chispazos recorren el
      // cable entero en vez de amontonarse en la punta.
      const q = this.rnd();
      const bx = e.x + (e.x2 - e.x) * q, by = e.y + (e.y2 - e.y) * q;
      const ox = bx + this.r(-largo, largo) * 0.3;
      const oy = by + this.r(-largo, largo) * 0.3;
      this.rayo(ox, oy, ox + Math.cos(a) * largo, oy + Math.sin(a) * largo,
        { thickness: 0.5 * (e.par.size ?? 1), branch: e.par.branch ?? 1, flicker: 2, flash: e.par.flash ?? 0 });
    }

    for (const b of this.bursts) {
      b.t += PASO;
      if (b.t < b.cada) continue;
      // El siguiente no cae al mismo ritmo exacto: ±40 %, para que dos
      // explosiones repitiéndose no se acompasen nunca.
      const base = Math.max(0.05, b.par.every ?? 1);
      b.cada = base * this.r(0.6, 1.4);
      b.t = 0;
      this.golpe(b.kind, b.x, b.y, b.color, b.par);
    }

    for (const s of this.storms) {
      s.t += PASO;
      if (s.t < s.cada) continue;
      // El siguiente no cae justo al mismo ritmo: se reparte ±40 % para que dos
      // tormentas no se acompasen nunca.
      const base = 1 / Math.max(0.05, s.par.stormrate ?? 0.5);
      s.cada = base * this.r(0.6, 1.4);
      s.t = 0;
      if (s.arriba) {
        // Tormenta de verdad: cae del cielo, por donde le da la gana, hasta un
        // punto cualquiera de la parte de abajo.
        const ox = this.r(0.05, 0.95) * this.w;
        const tx = clamp(ox + this.r(-120, 120) * this.k, 10, this.w - 10);
        this.rayo(ox, -10 * this.k, tx, this.r(0.35, 0.95) * this.h, s.par);
      } else {
        // La línea marca de dónde a dónde; se le mete algo de azar para que no
        // salgan dos rayos calcados.
        const ox = s.x + this.r(-30, 30) * this.k;
        const tx = s.x2 + this.r(-40, 40) * this.k;
        this.rayo(ox, s.y, tx, s.y2, s.par);
      }
    }
  }

  // ---------------- física ----------------
  private fisica() {
    const W = this.w, H = this.h;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life++;
      if (p.type === "portal") {
        p.angle! += p.angularSpeed!;
        p.radius! += p.radialSpeed!;
        p.x = p.cx! + Math.cos(p.angle!) * p.radius!;
        p.y = p.cy! + Math.sin(p.angle!) * p.radius! * 0.6;
        if (p.radius! < 2 || p.life >= p.maxLife) this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.gravity;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      if (p.sway) { p.swayPhase! += 0.06; p.x += Math.sin(p.swayPhase!) * p.sway * 0.5 * this.k; }
      if (p.rotSpeed) p.rot! += p.rotSpeed;
      const m = 40 * this.k;
      if (p.type === "rain" && p.y > H + 10 * this.k) { this.parts.splice(i, 1); continue; }
      if (p.type !== "rain" && (p.y > H + m || p.y < -m || p.x < -m || p.x > W + m)) { this.parts.splice(i, 1); continue; }
      if (p.type === "spark") { p.trail!.push({ x: p.x, y: p.y }); if (p.trail!.length > 5) p.trail!.shift(); }
      // Tope: pasado su recorrido se apaga en APAGADO fotogramas. Se cuenta
      // aparte y no tocando la edad, porque cada tipo de partícula vive lo suyo
      // (la lluvia, 220 fotogramas) y envejecerla deprisa la hacía llegar media
      // pantalla más allá del tope.
      if (p.recorrido !== undefined && Math.hypot(p.x - p.ox!, p.y - p.oy!) > p.recorrido) {
        p.apagando = (p.apagando ?? 0) + 1;
        if (p.apagando > APAGADO) { this.parts.splice(i, 1); continue; }
      }
      if (p.life >= p.maxLife) this.parts.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.r += (f.maxR - f.r) * 0.16; f.alpha *= 0.87;
      if (f.alpha < 0.02) this.flashes.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life++;
      if (this.bolts[i].life >= this.bolts[i].maxLife) this.bolts.splice(i, 1);
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.r += (s.maxR - s.r) * 0.14 * s.speed; s.alpha *= 0.9;
      if (s.alpha < 0.02) this.shocks.splice(i, 1);
    }
    for (let i = this.speeds.length - 1; i >= 0; i--) {
      this.speeds[i].life++;
      if (this.speeds[i].life >= this.speeds[i].maxLife) this.speeds.splice(i, 1);
    }
    for (let i = this.glitches.length - 1; i >= 0; i--) {
      this.glitches[i].life++;
      if (this.glitches[i].life >= this.glitches[i].maxLife) this.glitches.splice(i, 1);
    }
    for (let i = this.circles.length - 1; i >= 0; i--) {
      const m = this.circles[i];
      m.life++; m.angle += m.rotSpeed;
      if (m.life >= m.maxLife) this.circles.splice(i, 1);
    }
  }

  // ---------------- dibujo ----------------
  // Se deja el lienzo como estaba: la historia se sigue dibujando encima y
  // debajo, y un 'lighter' colado estropearía la imagen entera.
  draw(ctx: CanvasRenderingContext2D, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    try {
      for (const e of this.haces) this.dibHaces(ctx, e);
      for (const e of this.lamps) this.dibLampara(ctx, e);
      for (const f of this.fogs) this.dibFog(ctx, f);
      for (const b of this.bolts) this.dibBolt(ctx, b);
      this.dibCielo(ctx);
      for (const m of this.circles) this.dibCirculo(ctx, m);
      for (const e of this.orbs) {
        const p = e.par;
        this.esfera(ctx, e.x, e.y, e.color,
          (26 + 8 * Math.sin(e.phase * 0.05 * (p.blink ?? 1))) * (p.size ?? 1) * this.k, 0.85);
      }
      for (const e of this.beacons) this.dibBaliza(ctx, e);
      for (const e of this.portals) {
        const p = e.par;
        this.esfera(ctx, e.x, e.y, e.color, (40 + 10 * Math.sin(e.phase)) * (p.size ?? 1) * this.k,
          0.25 * (p.intensity ?? 1));
      }
      for (const n of this.neons) this.dibNeon(ctx, n);
      for (const s of this.xmas) this.dibXmas(ctx, s);
      for (const s of this.shocks) this.dibShock(ctx, s);
      for (const b of this.speeds) this.dibSpeed(ctx, b);
      for (const g of this.glitches) this.dibGlitch(ctx, g);
      for (const p of this.parts) if (p.type === "smoke") this.dibGlow(ctx, p);
      for (const p of this.parts) {
        if (p.type === "smoke") continue;
        if (p.type === "spark") this.dibSpark(ctx, p);
        else if (p.type === "rain") this.dibRain(ctx, p);
        else if (p.type === "leaf") this.dibLeaf(ctx, p);
        else if (p.type === "heart") this.dibCorazon(ctx, p);
        else if (p.type === "bubble") this.dibBurbuja(ctx, p);
        else this.dibGlow(ctx, p);
      }
      for (const f of this.flashes) this.dibFlash(ctx, f);
    } finally {
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // Transparencia final: la de su edad, atenuada si ya pasó su tope.
  private alfa(p: Part, base: number) {
    return p.apagando ? base * Math.max(0, 1 - p.apagando / APAGADO) : base;
  }

  // Resplandor de un color, dibujado a tamaño fijo para poder estirarlo luego.
  // El color se redondea para que dos partículas casi iguales compartan sprite:
  // el ojo no lo nota y la caché pasa de miles de entradas a unas pocas.
  private sprite(hue: number, sat: number, light: number, conNucleo: boolean) {
    const h = Math.round(hue / 8) * 8, sa = Math.round(sat / 10) * 10, l = Math.round(light / 5) * 5;
    const clave = `${h},${sa},${l},${conNucleo ? 1 : 0}`;
    const ya = this.sprites.get(clave);
    if (ya) return ya;
    const S = 64, R = S / 2;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, `hsla(${h},${sa}%,${l}%,1)`);
    g.addColorStop(1, `hsla(${h},${sa}%,${l}%,0)`);
    x.fillStyle = g;
    x.beginPath(); x.arc(R, R, R, 0, Math.PI * 2); x.fill();
    if (conNucleo) {
      // El punto brillante del centro, en la misma proporción que tenía antes
      // (0.55 de radio frente a 3.2 del resplandor).
      x.fillStyle = `hsla(${h},${sa}%,${Math.min(l + 22, 96)}%,1)`;
      x.beginPath(); x.arc(R, R, R * (0.55 / 3.2), 0, Math.PI * 2); x.fill();
    }
    if (this.sprites.size > 400) this.sprites.clear();
    this.sprites.set(clave, c);
    return c;
  }

  private dibGlow(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 1 - p.life / p.maxLife));
    if (a <= 0.004) return;
    ctx.globalCompositeOperation = p.blend as GlobalCompositeOperation;
    const r = Math.max(p.size * 3.2, 0.1);
    const sp = this.sprite(p.hue, p.sat, p.light, p.sat > 0);
    const antes = ctx.globalAlpha;
    ctx.globalAlpha = antes * a;
    ctx.drawImage(sp, p.x - r, p.y - r, r * 2, r * 2);
    ctx.globalAlpha = antes;
  }
  private dibSpark(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 1 - p.life / p.maxLife));
    ctx.globalCompositeOperation = p.blend as GlobalCompositeOperation;
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.lineWidth = p.size; ctx.lineCap = "round";
    ctx.beginPath();
    const t = p.trail ?? [];
    if (t.length) { ctx.moveTo(t[0].x, t[0].y); for (const q of t) ctx.lineTo(q.x, q.y); }
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  private dibRain(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 0.55 * (1 - p.life / p.maxLife)));
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.lineWidth = p.size; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  private dibLeaf(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 1 - p.life / p.maxLife));
    ctx.globalCompositeOperation = "source-over";
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot ?? 0);
    ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Luz sin partículas. Se dibuja como un degradado redondo estirado a lo
  // ancho si se pide óvalo, y a lo largo de la línea si se trazó una (una
  // ventana alargada, un cartel).
  private dibLampara(ctx: CanvasRenderingContext2D, e: Lamp) {
    const p = e.par;
    const c = e.color;
    // Un charco de luz de verdad: con 30 la farola quedaba en un puntito.
    const r = Math.max(70 * (p.size ?? 1) * this.k, 2);
    const ancho = p.ancho ?? 1;
    const a = Math.max(0, Math.min(1, (p.intensity ?? 0.6))) * e.nivel;
    if (a <= 0.01) return;
    const largoLinea = Math.hypot(e.x2 - e.x, e.y2 - e.y);
    // Si es una línea, se reparten varios focos a lo largo para que la luz la
    // cubra entera en vez de quedar una bola en un extremo.
    const focos = largoLinea > r ? Math.min(12, Math.ceil(largoLinea / (r * 0.7))) : 1;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < focos; i++) {
      const t = focos === 1 ? 0 : i / (focos - 1);
      const x = e.x + (e.x2 - e.x) * t;
      const y = e.y + (e.y2 - e.y) * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(ancho, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `hsla(${c.h},${c.s}%,${Math.min(c.l + 20, 95)}%,${a})`);
      g.addColorStop(0.45, `hsla(${c.h},${c.s}%,${c.l}%,${a * 0.45})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // Haces que salen de un punto y giran despacio: sol entrando por una ventana,
  // un foco de escenario.
  private dibHaces(ctx: CanvasRenderingContext2D, e: Haz) {
    const p = e.par;
    const n = Math.max(1, Math.round(p.rayos ?? 5));
    const largo = 260 * (p.length ?? 1) * this.k;
    const a = Math.max(0, Math.min(1, p.intensity ?? 0.4));
    for (let i = 0; i < n; i++) {
      const ang = e.phase + (i * Math.PI * 2) / n;
      this.haz(ctx, e.x, e.y, Math.cos(ang), Math.sin(ang), e.color, a * 0.5, largo);
    }
    this.esfera(ctx, e.x, e.y, e.color, 18 * this.k, a);
  }

  // Una burbuja no es una mancha de luz: es casi transparente, con el borde
  // marcado y un brillito arriba a la izquierda.
  private dibBurbuja(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 1 - p.life / p.maxLife));
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = "source-over";
    const r = Math.max(p.size, 0.5);
    // Relleno muy tenue, para que se vea lo que hay detrás.
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
    g.addColorStop(0, `hsla(${p.hue},${p.sat}%,95%,${a * 0.35})`);
    g.addColorStop(0.7, `hsla(${p.hue},${p.sat}%,${p.light}%,${a * 0.08})`);
    g.addColorStop(1, `hsla(${p.hue},${p.sat}%,${p.light}%,${a * 0.02})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    // El aro, que es lo que la hace leerse como burbuja.
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,90%,${a * 0.75})`;
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    // Brillo.
    ctx.fillStyle = `hsla(0,0%,100%,${a * 0.85})`;
    ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, Math.max(0.6, r * 0.18), 0, Math.PI * 2); ctx.fill();
  }

  private dibCorazon(ctx: CanvasRenderingContext2D, p: Part) {
    const a = this.alfa(p, Math.max(0, 1 - p.life / p.maxLife));
    ctx.globalCompositeOperation = "source-over";
    const s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.beginPath();
    // Dos lóbulos arriba y una punta abajo.
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.55, -s * 1.15, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.55, -s * 1.15, s * 1.5, -s * 0.2, 0, s * 0.9);
    ctx.closePath(); ctx.fill();
    // Un borde más claro: sobre un fondo oscuro un corazón plano se pierde.
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${Math.min(p.light + 25, 95)}%,${a * 0.8})`;
    ctx.lineWidth = Math.max(0.8, s * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  private dibFlash(ctx: CanvasRenderingContext2D, f: Flash) {
    ctx.globalCompositeOperation = "lighter";
    const r = Math.max(f.r, 1);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,255,255,${f.alpha})`);
    g.addColorStop(0.3, `hsla(${f.hue},100%,70%,${f.alpha * 0.55})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
  }
  private esfera(ctx: CanvasRenderingContext2D, x: number, y: number, c: Hsl, radio: number, alpha: number) {
    ctx.globalCompositeOperation = "lighter";
    const r = Math.max(radio, 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${c.h},${c.s}%,${c.l}%,${alpha})`);
    g.addColorStop(0.5, `hsla(${c.h},${c.s}%,${Math.max(c.l - 15, 10)}%,${alpha * 0.45})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  private haz(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, c: Hsl, alpha: number, largo: number) {
    ctx.globalCompositeOperation = "lighter";
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
    const g = ctx.createLinearGradient(0, 0, largo, 0);
    g.addColorStop(0, `hsla(${c.h},${c.s}%,${c.l}%,${alpha})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.beginPath();
    const w = 12 * this.k, w2 = 42 * this.k;
    ctx.moveTo(0, -w); ctx.lineTo(largo, -w2); ctx.lineTo(largo, w2); ctx.lineTo(0, w);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  private dibBaliza(ctx: CanvasRenderingContext2D, e: Beacon) {
    const p = e.par;
    const tam = p.size ?? 1, blink = p.blink ?? 1;
    if (e.pattern === "rotate") {
      const n = e.colors.length;
      for (let i = 0; i < n; i++) {
        const ang = e.phase * 0.05 * blink + i * (Math.PI * 2 / n);
        this.haz(ctx, e.x, e.y, Math.cos(ang), Math.sin(ang), e.colors[i], 0.4, 220 * tam * this.k);
      }
      this.esfera(ctx, e.x, e.y, { h: 0, s: 0, l: 95 }, 12 * tam * this.k, 0.9);
    } else {
      const idx = Math.floor(e.phase * blink / 10) % e.colors.length;
      const on = Math.floor(e.phase * blink / 5) % 2 === 0;
      this.esfera(ctx, e.x, e.y, e.colors[idx], (on ? 32 : 15) * tam * this.k,
        (on ? 0.9 : 0.35) * (p.intensity ?? 1));
    }
  }
  private trazo(ctx: CanvasRenderingContext2D, segs: Seg[]) {
    ctx.beginPath();
    for (const s of segs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
    ctx.stroke();
  }
  private alfaBolt(life: number, maxLife: number) {
    if (life < 2) return 1;
    if (life < 4) return 0.4;
    if (life < 6) return 0.9;
    if (life < 9) return 0.5;
    return Math.max(0, 1 - (life - 9) / (maxLife - 9)) * 0.6;
  }
  private dibBolt(ctx: CanvasRenderingContext2D, b: Bolt) {
    const a = this.alfaBolt(b.life, b.maxLife);
    if (a <= 0) return;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(170,200,255,${a * 0.5})`; ctx.lineWidth = 6 * b.thickness; this.trazo(ctx, b.trunk);
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2 * b.thickness; this.trazo(ctx, b.trunk);
    for (const br of b.branches) {
      ctx.strokeStyle = `rgba(200,220,255,${a * 0.35})`; ctx.lineWidth = 3 * b.thickness; this.trazo(ctx, br);
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`; ctx.lineWidth = 1.2 * b.thickness; this.trazo(ctx, br);
    }
  }
  private dibCielo(ctx: CanvasRenderingContext2D) {
    let max = 0;
    for (const b of this.bolts) if (b.flash) max = Math.max(max, this.alfaBolt(b.life, b.maxLife));
    if (max > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,255,255,${max * 0.12})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
  private dibShock(ctx: CanvasRenderingContext2D, s: Shock) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = s.thickness * 3; ctx.strokeStyle = `hsla(${s.hue},70%,70%,${s.alpha * 0.35})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(s.r, 0.1), 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = s.thickness; ctx.strokeStyle = `hsla(${s.hue},70%,92%,${s.alpha})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(s.r, 0.1), 0, Math.PI * 2); ctx.stroke();
  }
  private dibSpeed(ctx: CanvasRenderingContext2D, b: SpeedBurst) {
    const a = Math.max(0, 1 - b.life / b.maxLife);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `hsla(${b.hue},20%,95%,${a})`; ctx.lineWidth = b.thickness; ctx.lineCap = "round";
    for (const l of b.lines) {
      const x2 = b.x + Math.cos(l.angle) * l.len, y2 = b.y + Math.sin(l.angle) * l.len;
      const x1 = b.x + Math.cos(l.angle) * (l.len * 0.15), y1 = b.y + Math.sin(l.angle) * (l.len * 0.15);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  private dibGlitch(ctx: CanvasRenderingContext2D, g: Glitch) {
    const a = Math.max(0, 1 - g.life / g.maxLife);
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 5; i++) {
      if (this.rnd() < 0.55 * g.density) {
        const by = g.y - g.h / 2 + this.r(0, g.h), bh = this.r(2, 8) * this.k;
        const bx = g.x - g.w / 2 + this.r(-10, 10) * this.k;
        ctx.fillStyle = `hsla(${this.r(0, 360)},85%,70%,${a * 0.5})`;
        ctx.fillRect(bx, by, g.w, bh);
      }
    }
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.4})`; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x - g.w / 2, g.y + (this.rnd() - 0.5) * g.h);
    ctx.lineTo(g.x + g.w / 2, g.y + (this.rnd() - 0.5) * g.h);
    ctx.stroke();
  }
  private dibCirculo(ctx: CanvasRenderingContext2D, m: Circle) {
    const t = m.life / m.maxLife;
    const a = t < 0.15 ? t / 0.15 : (t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1);
    ctx.globalCompositeOperation = "lighter";
    ctx.save(); ctx.translate(m.x, m.y);
    for (let ring = 0; ring < 3; ring++) {
      ctx.save(); ctx.rotate(m.angle * (ring % 2 === 0 ? 1 : -1));
      ctx.beginPath(); ctx.setLineDash(ring === 1 ? [10, 6] : []);
      ctx.strokeStyle = `hsla(${m.color.h},80%,70%,${a * (0.8 - ring * 0.2)})`;
      ctx.lineWidth = 2 * this.k;
      ctx.arc(0, 0, m.size * (0.5 + ring * 0.25), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]); ctx.restore();
    this.esfera(ctx, m.x, m.y, m.color, m.size * 0.35, a * 0.5);
  }
  private dibNeon(ctx: CanvasRenderingContext2D, n: Neon) {
    const flick = n.dim ? 0.22 : 1;
    ctx.globalCompositeOperation = "lighter";
    const pasadas: [number, number][] = [[n.thickness * 6, 0.14], [n.thickness * 3, 0.32], [n.thickness, 0.95]];
    for (const [w, a] of pasadas) {
      ctx.lineWidth = w; ctx.lineCap = "round";
      ctx.strokeStyle = `hsla(${n.color.h},90%,65%,${a * flick})`;
      ctx.beginPath();
      if (n.mode === "point") { ctx.arc(n.x, n.y, w / 2, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.moveTo(n.x, n.y); ctx.lineTo(n.x2, n.y2); ctx.stroke(); }
    }
  }
  private dibXmas(ctx: CanvasRenderingContext2D, s: Xmas) {
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1 * this.k;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    for (const b of s.bulbs) {
      const x = s.x + (s.x2 - s.x) * b.t, y = s.y + (s.y2 - s.y) * b.t;
      const c = XMAS[b.colorIdx];
      const bright = 0.35 + 0.65 * Math.abs(Math.sin(b.phase));
      const r = Math.max(s.size * 3, 0.1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${c.h},${c.s}%,${c.l}%,${bright})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = `hsla(${c.h},${c.s}%,${Math.min(c.l + 20, 95)}%,${bright})`;
      ctx.arc(x, y, Math.max(s.size * 0.6, 0.1), 0, Math.PI * 2); ctx.fill();
    }
  }
  private dibFog(ctx: CanvasRenderingContext2D, f: Fog) {
    const p = f.par;
    const base = f.color;
    const r = Math.max(90 * (p.size ?? 1) * this.k, 1);
    // Las manchas se reparten A LO LARGO DEL TRAMO del efecto, no todas en su
    // punto de origen: si no, una niebla trazada de lado a lado salía como un
    // borrón en un extremo. Cuanto más largo el tramo, más manchas.
    const largo = Math.hypot(f.x2 - f.x, f.y2 - f.y);
    const n = Math.max(3, Math.min(14, Math.round(3 + largo / (r * 0.9))));
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < n; i++) {
      const off = f.phase + i * 2.1;
      const t = n === 1 ? 0.5 : i / (n - 1);
      const bx = f.x + (f.x2 - f.x) * t;
      const by = f.y + (f.y2 - f.y) * t;
      const x = bx + Math.sin(off) * 60 * this.k + Math.sin(off * 0.31) * 24 * this.k * (p.speed ?? 1);
      // La niebla tiene grosor: se sube y se baja un poco alrededor del tramo.
      let y = by + Math.cos(off * 0.7) * 20 * this.k + Math.sin(off * 1.7) * r * 0.35;
      // Un tramo puesto por encima del borde (la forma "arriba" nace en
      // y = -0.02) dejaba la niebla fuera de vista. En ese caso "desde arriba"
      // quiere decir que llena la escena, así que se reparte por todo el alto;
      // en cualquier otro sitio solo se mete dentro del cuadro.
      if (f.y <= 0 && f.y2 <= 0) y = this.h * (0.12 + 0.76 * ((i + 0.5) / n + Math.sin(off * 0.53) * 0.18) % 1);
      y = Math.max(r * 0.35, Math.min(this.h - r * 0.15, y));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${base.h},${base.s}%,${base.l}%,${0.18 * (p.density ?? 1)})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
