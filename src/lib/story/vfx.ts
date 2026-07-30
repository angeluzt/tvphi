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
const MAX_PASOS = 900; // tope de puesta al día (15 s) para que un salto no cuelgue

export type VfxKind =
  | "explosion" | "chispas" | "destello" | "shockwave" | "aura"
  | "fuego" | "lluvia" | "nieve" | "niebla" | "ceniza" | "hojas"
  | "rayo" | "portal" | "glitch" | "speedlines" | "luz" | "baliza"
  | "neon" | "navidad" | "magiccircle" | "escarcha" | "polvo";

// Cómo se coloca el efecto sobre la imagen:
//   · "punto": un sitio (una explosión, una hoguera)
//   · "linea": de un punto a otro (un rayo, un tubo de neón, una guirnalda)
//   · "franja": una banda por la que entra (lluvia, nieve…); de serie, todo el ancho
export type VfxShape = "punto" | "linea" | "franja";

export interface VfxParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface VfxSpec {
  id: VfxKind;
  label: string;
  shape: VfxShape;
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

export const VFX: VfxSpec[] = [
  { id: "explosion", label: "Explosión", shape: "punto", color: "#ff8a3d", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD] },
  { id: "chispas", label: "Chispas", shape: "punto", color: "#ffd23f", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, P("gravity", "Peso")] },
  { id: "destello", label: "Destello", shape: "punto", color: "#8fd3ff", continuo: false,
    params: [INTENSIDAD, TAMANO, P("duration", "Cuánto aguanta")] },
  { id: "shockwave", label: "Onda de choque", shape: "punto", color: "#ffffff", continuo: false,
    params: [TAMANO, VELOCIDAD, P("thickness", "Grosor")] },
  { id: "escarcha", label: "Escarcha / hielo", shape: "punto", color: "#bff2ff", continuo: false,
    params: [INTENSIDAD, TAMANO, VELOCIDAD] },
  { id: "speedlines", label: "Líneas de velocidad", shape: "punto", color: "#ffffff", continuo: false,
    params: [INTENSIDAD, P("thickness", "Grosor"), P("length", "Largo")] },
  { id: "glitch", label: "Glitch digital", shape: "punto", color: null, continuo: false,
    params: [INTENSIDAD, TAMANO, P("duration", "Cuánto aguanta")] },
  { id: "magiccircle", label: "Círculo mágico", shape: "punto", color: "#b98bff", continuo: false,
    params: [TAMANO, VELOCIDAD, P("duration", "Cuánto aguanta")] },

  { id: "fuego", label: "Fuego", shape: "linea", color: "#ff8a3d", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD] },
  { id: "aura", label: "Aura de energía", shape: "punto", color: "#7effc2", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, P("turb", "Revuelo")] },
  { id: "portal", label: "Portal", shape: "punto", color: "#7ee8ff", continuo: true,
    params: [TAMANO, VELOCIDAD, INTENSIDAD, P("dir", "Hacia dentro (0) / fuera (1)", 0, 1, 1)] },
  { id: "luz", label: "Luz (esfera)", shape: "punto", color: "#a0c8ff", continuo: true,
    params: [INTENSIDAD, TAMANO, P("blink", "Parpadeo")] },
  { id: "baliza", label: "Baliza (policía / ambulancia)", shape: "punto", color: null, continuo: true,
    params: [TAMANO, P("blink", "Parpadeo"), INTENSIDAD, P("preset", "Policía (0) / ambulancia (1)", 0, 1, 1)] },
  { id: "neon", label: "Neón", shape: "linea", color: "#ff2fd6", continuo: true,
    params: [P("thickness", "Grosor"), INTENSIDAD, P("blink", "Parpadeo")] },
  { id: "navidad", label: "Luces navideñas", shape: "linea", color: null, continuo: true,
    params: [TAMANO, P("spacing", "Separación"), P("blink", "Parpadeo")] },
  { id: "rayo", label: "Rayo", shape: "linea", color: null, continuo: true,
    params: [P("thickness", "Grosor"), P("branch", "Ramas"), P("flicker", "Parpadeo"),
             P("stormrate", "Cada cuánto cae", 0.05, 3, 0.05)] },

  { id: "lluvia", label: "Lluvia", shape: "franja", color: "#8fc4ff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO] },
  { id: "nieve", label: "Nieve", shape: "franja", color: "#ffffff", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO] },
  { id: "ceniza", label: "Ceniza", shape: "franja", color: "#caa27a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD] },
  { id: "hojas", label: "Hojas / pétalos", shape: "franja", color: "#8a6a3a", continuo: true,
    params: [INTENSIDAD, TAMANO, VELOCIDAD, VIENTO] },
  { id: "polvo", label: "Polvo mágico / luciérnagas", shape: "franja", color: "#ffe28a", continuo: true,
    params: [INTENSIDAD, TAMANO, P("blink", "Parpadeo"), VELOCIDAD] },
  { id: "niebla", label: "Niebla", shape: "franja", color: "#cfd6e6", continuo: true,
    params: [P("density", "Densidad"), VELOCIDAD, TAMANO] },
];

export const vfxSpec = (k: VfxKind) => VFX.find((v) => v.id === k) ?? VFX[0];

export function vfxDefaults(k: VfxKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of vfxSpec(k).params) {
    // Los interruptores (0/1) empiezan apagados; el resto, a la mitad natural.
    out[p.key] = p.step === 1 ? p.min : (p.key === "wind" ? 0 : 1);
  }
  if (k === "rayo") out.stormrate = 0.5;
  if (k === "neon") out.blink = 0.5;
  if (k === "hojas") out.wind = 0.5;
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
  type: "glow" | "spark" | "rain" | "leaf" | "smoke" | "portal";
  blend: string;
  trail?: { x: number; y: number }[];
  sway?: number; swayPhase?: number; rot?: number; rotSpeed?: number;
  cx?: number; cy?: number; angle?: number; radius?: number;
  angularSpeed?: number; radialSpeed?: number;
}
interface Flash { x: number; y: number; r: number; maxR: number; alpha: number; hue: number }
interface Seg { x1: number; y1: number; x2: number; y2: number }
interface Bolt { trunk: Seg[]; branches: Seg[][]; life: number; maxLife: number; thickness: number }
interface Shock { x: number; y: number; r: number; maxR: number; alpha: number; thickness: number; hue: number; speed: number }
interface SpeedBurst { x: number; y: number; lines: { angle: number; len: number }[]; life: number; maxLife: number; thickness: number; hue: number }
interface Glitch { x: number; y: number; w: number; h: number; life: number; maxLife: number; density: number }
interface Circle { x: number; y: number; life: number; maxLife: number; angle: number; rotSpeed: number; size: number; color: Hsl }
interface Fog { id: string; x: number; y: number; phase: number; par: Record<string, number>; color: Hsl }
interface Neon { id: string; mode: "point" | "line"; x: number; y: number; x2: number; y2: number; thickness: number; color: Hsl; dim: boolean; dimTimer: number; flickerRate: number }
interface Bulb { t: number; colorIdx: number; phase: number }
interface Xmas { id: string; x: number; y: number; x2: number; y2: number; bulbs: Bulb[]; size: number; blink: number }
interface Beacon { id: string; x: number; y: number; colors: Hsl[]; pattern: "rotate" | "strobe"; phase: number; par: Record<string, number> }
interface Orb { id: string; x: number; y: number; phase: number; color: Hsl; par: Record<string, number> }
interface Portal { id: string; x: number; y: number; phase: number; color: Hsl; par: Record<string, number> }
interface Aura { id: string; x: number; y: number; color: Hsl; par: Record<string, number> }
interface Fire { id: string; x: number; y: number; x2: number; y2: number; color: Hsl; par: Record<string, number> }
interface Ambient { id: string; kind: VfxKind; x: number; y: number; x2: number; y2: number; color: Hsl; par: Record<string, number> }
interface Storm { id: string; x: number; y: number; x2: number; y2: number; par: Record<string, number>; t: number }

// Lo que el motor necesita saber de una capa. El modelo guarda algo más
// (cuándo se ve), pero aquí solo llega lo que se dibuja.
export interface VfxInput {
  id: string;
  kind: VfxKind;
  x: number; y: number; x2: number; y2: number; // 0..1 sobre el lienzo
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
  private portals: Portal[] = [];
  private auras: Aura[] = [];
  private fires: Fire[] = [];
  private ambients: Ambient[] = [];
  private storms: Storm[] = [];

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
    this.storms = []; this.vivos.clear();
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
    for (let i = hechos; i < objetivo; i++) {
      this.montar(capas, i * PASO);
      this.emitir();
      this.fisica();
    }
    this.t = objetivo * PASO;
  }

  // Da de alta y de baja las capas según su rato dentro de la toma.
  private montar(capas: VfxInput[], t: number) {
    for (const c of capas) {
      const dentro = t >= c.start && t < c.end;
      const yaEsta = this.vivos.has(c.id);
      if (dentro && !yaEsta) { this.vivos.add(c.id); this.alta(c); }
      else if (!dentro && yaEsta) { this.vivos.delete(c.id); this.baja(c); }
    }
  }

  private px(c: VfxInput) {
    return {
      x: c.x * this.w, y: c.y * this.h,
      x2: c.x2 * this.w, y2: c.y2 * this.h,
    };
  }

  private alta(c: VfxInput) {
    const { x, y, x2, y2 } = this.px(c);
    const col = hexToHsl(c.colorHex || "#ffffff");
    const p = c.params;
    switch (c.kind) {
      case "explosion": return this.explosion(x, y, col, p);
      case "chispas": return this.chispas(x, y, col, p);
      case "destello": return this.destello(x, y, col, p);
      case "shockwave": return this.shockwave(x, y, col, p);
      case "escarcha": return this.escarcha(x, y, col, p);
      case "speedlines": return this.speedlines(x, y, col, p);
      case "glitch": return this.glitch(x, y, p);
      case "magiccircle": return this.circulo(x, y, col, p);
      case "fuego": this.fires.push({ id: c.id, x, y, x2, y2, color: col, par: p }); return;
      case "aura": this.auras.push({ id: c.id, x, y, color: col, par: p }); return;
      case "portal": this.portals.push({ id: c.id, x, y, phase: 0, color: col, par: p }); return;
      case "luz": this.orbs.push({ id: c.id, x, y, phase: 0, color: col, par: p }); return;
      case "baliza": {
        const b = BALIZAS[p.preset ? 1 : 0];
        this.beacons.push({ id: c.id, x, y, colors: b.colors, pattern: b.pattern, phase: 0, par: p });
        return;
      }
      case "neon": {
        const punto = Math.hypot(x2 - x, y2 - y) < 6;
        this.neons.push({
          id: c.id, mode: punto ? "point" : "line", x, y, x2, y2,
          thickness: (p.thickness ?? 1) * 3 * this.k, color: col,
          dim: false, dimTimer: 0, flickerRate: (p.blink ?? 0.5) * 0.01,
        });
        return;
      }
      case "navidad": this.xmas.push(this.guirnalda(c.id, x, y, x2, y2, p)); return;
      case "rayo": this.storms.push({ id: c.id, x, y, x2, y2, par: p, t: 1e9 }); return;
      case "niebla": this.fogs.push({ id: c.id, x, y, phase: this.rnd() * 6.28, par: p, color: col }); return;
      default:
        this.ambients.push({ id: c.id, kind: c.kind, x, y, x2, y2, color: col, par: p });
    }
  }

  // Al acabar su rato el emisor se apaga; lo que ya soltó se apaga solo, que es
  // lo que se quiere (la lluvia que ya cae termina de caer).
  private baja(c: VfxInput) {
    const sin = <T extends { id: string }>(a: T[]) => a.filter((e) => e.id !== c.id);
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
  }

  private r(a: number, b: number) { return a + this.rnd() * (b - a); }

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
        this.parts.push({
          x: ex + this.r(-4, 4) * this.k, y: ey + this.r(-2, 2) * this.k,
          vx: this.r(-0.4, 0.4) * this.k, vy: this.r(-2.6, -1.4) * (p.speed ?? 1) * this.k,
          size: this.r(2.5, 5) * (p.size ?? 1) * this.k, life: 0, maxLife: this.r(30, 55),
          hue: e.color.h + this.r(-12, 12), sat: 95, light: this.r(55, 70),
          gravity: -0.02 * this.k, drag: 0.985, type: "glow", blend: "lighter",
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
        this.parts.push({
          x: ex + this.r(-4, 4) * this.k, y: ey + this.r(-2, 2) * this.k,
          vx: this.r(cfg.vxMin, cfg.vxMax) * (p.speed ?? 1) * this.k + viento,
          vy: this.r(cfg.vyMin, cfg.vyMax) * (p.speed ?? 1) * this.k,
          size: this.r(cfg.sizeMin, cfg.sizeMax) * (p.size ?? 1) * this.k,
          rot: cfg.rotate ? this.r(0, Math.PI * 2) : 0,
          rotSpeed: cfg.rotate ? this.r(-0.05, 0.05) : 0,
          sway: cfg.sway ? this.r(0.3, 1.1) : 0,
          swayPhase: this.r(0, Math.PI * 2),
          life: 0, maxLife: cfg.maxLife,
          hue: e.color.h + this.r(-8, 8), sat: e.color.s, light: e.color.l,
          gravity: cfg.gravity * this.k, drag: cfg.drag,
          type: cfg.renderType, blend: cfg.blend,
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

    for (const s of this.storms) {
      s.t += PASO;
      const cada = 1 / Math.max(0.05, s.par.stormrate ?? 0.5);
      if (s.t > cada) {
        s.t = 0;
        // La línea marca de dónde a dónde cae; se le mete algo de azar para
        // que no salgan dos rayos calcados.
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
        else this.dibGlow(ctx, p);
      }
      for (const f of this.flashes) this.dibFlash(ctx, f);
    } finally {
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private dibGlow(ctx: CanvasRenderingContext2D, p: Part) {
    const a = Math.max(0, 1 - p.life / p.maxLife);
    ctx.globalCompositeOperation = p.blend as GlobalCompositeOperation;
    const outer = p.size * 3.2;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(outer, 0.1));
    g.addColorStop(0, `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`);
    g.addColorStop(1, `hsla(${p.hue},${p.sat}%,${p.light}%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(outer, 0.1), 0, Math.PI * 2); ctx.fill();
    if (p.sat > 0) {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${Math.min(p.light + 22, 96)}%,${a})`;
      ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }
  private dibSpark(ctx: CanvasRenderingContext2D, p: Part) {
    const a = Math.max(0, 1 - p.life / p.maxLife);
    ctx.globalCompositeOperation = p.blend as GlobalCompositeOperation;
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.lineWidth = p.size; ctx.lineCap = "round";
    ctx.beginPath();
    const t = p.trail ?? [];
    if (t.length) { ctx.moveTo(t[0].x, t[0].y); for (const q of t) ctx.lineTo(q.x, q.y); }
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  private dibRain(ctx: CanvasRenderingContext2D, p: Part) {
    const a = Math.max(0, 0.55 * (1 - p.life / 220));
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.lineWidth = p.size; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(p.x - p.vx * 2, p.y - p.vy * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  private dibLeaf(ctx: CanvasRenderingContext2D, p: Part) {
    const a = Math.max(0, 1 - p.life / p.maxLife);
    ctx.globalCompositeOperation = "source-over";
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot ?? 0);
    ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
    ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
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
    for (const b of this.bolts) max = Math.max(max, this.alfaBolt(b.life, b.maxLife));
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
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 3; i++) {
      const off = f.phase + i * 2.1;
      const x = ((f.x + Math.sin(off) * 60 * this.k + off * 10 * (p.speed ?? 1) * this.k) % (this.w + 300 * this.k)) - 150 * this.k;
      const y = f.y + Math.cos(off * 0.7) * 20 * this.k;
      const r = Math.max(90 * (p.size ?? 1) * this.k, 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${base.h},${base.s}%,${base.l}%,${0.18 * (p.density ?? 1)})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
