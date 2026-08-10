// Mapa semántico de una escena, por capas.
//
// LA IDEA. Pedirle a una IA "un bosque con un portal" da una imagen plana, y
// además distinta cada vez: no se puede mover la cámara por dentro ni poner un
// efecto justo en el arco, porque no se sabe dónde quedó el arco. Aquí la
// escena se describe ANTES, como formas de colores planos con etiquetas —esto
// es cielo, esto una columna, aquí va el personaje, aquí no pintes nada porque
// va un efecto animado—. Cada capa se exporta como PNG y se le pide a la IA que
// la dibuje respetando esa geometría.
//
// Lo que se gana: la posición de cada cosa se sabe de antemano, y las capas
// llegan separadas y con fondo transparente, así que se pueden mover a
// distintas velocidades. Eso es el paralaje.
//
// LAS COORDENADAS VAN DE 0 A 1, siempre, sobre el ancho y el alto de la escena.
// Así el mismo mapa sirve para 1920×1080 y para vertical sin tocar un número.

import { normalizarMov, type MovCapa } from "./movimiento-capa";
import { superficiesDeEscena } from "./navegacion-escena";

export type Semantico =
  | "sky" | "terrain" | "wall" | "floor" | "door" | "window" | "column" | "arch"
  | "stairs" | "vegetation" | "water" | "subject" | "prop" | "light_anchor"
  | "vfx_zone" | "negative_space";

export const SEMANTICO_LABEL: Record<Semantico, string> = {
  sky: "Cielo",
  terrain: "Terreno",
  wall: "Muro",
  floor: "Suelo",
  door: "Puerta",
  window: "Ventana",
  column: "Columna",
  arch: "Arco",
  stairs: "Escalera",
  vegetation: "Vegetación",
  water: "Agua",
  subject: "Personaje",
  prop: "Objeto",
  light_anchor: "Foco de luz",
  vfx_zone: "Zona de efecto",
  negative_space: "Vacío",
};

// Qué significa cada color para quien lea el PNG. No es decoración: es el
// diccionario que se le pasa a la IA junto con la imagen.
export const PALETA: Record<Semantico, string> = {
  sky: "#2563EB",
  terrain: "#92400E",
  wall: "#64748B",
  floor: "#A16207",
  door: "#F59E0B",
  window: "#22D3EE",
  column: "#8B5CF6",
  arch: "#A78BFA",
  stairs: "#F97316",
  vegetation: "#22C55E",
  water: "#0EA5E9",
  subject: "#EC4899",
  prop: "#FACC15",
  light_anchor: "#FFF200",
  vfx_zone: "#FF1744",
  negative_space: "#111827",
};

// ── Las formas ──────────────────────────────────────────────────────────────
//
// Las ocho primeras venían del prototipo. Las demás se añadieron porque con
// solo rectángulos y polígonos, describir una fachada con seis ventanas o una
// hilera de árboles era escribir veinte objetos a mano, y la IA acababa
// recibiendo un mapa lleno de ruido en vez de una intención clara.

export type Forma =
  | "rect" | "roundedRect" | "circle" | "ellipse" | "polygon" | "line"
  | "arch" | "stairs"
  // añadidas:
  | "triangle"      // ladera, tejado, punta
  | "star"          // brillo, estrella, foco puntual
  | "path"          // silueta a mano con curvas: montaña, río, nube irregular
  | "door"          // hueco con marco, con o sin arco arriba
  | "window"        // hueco con marco y cruceta
  | "tree"          // tronco + copa, en un solo objeto
  | "cloud"         // masa blanda de varios bultos
  | "wedge"         // rampa o cuña: una ladera con un lado recto
  | "repeat";       // repite otra forma N veces a lo largo de una línea

export interface Objeto {
  id: string;
  shape: Forma;
  semantic: Semantico;
  label?: string;
  /** Color propio, si el de la paleta no vale. Normalmente NO se pone. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rotation?: number;   // grados, alrededor del centro de la forma

  // rect · roundedRect · arch · stairs · door · window · tree · cloud · wedge
  x?: number; y?: number; w?: number; h?: number;
  radius?: number;     // roundedRect
  thickness?: number;  // arch, marcos
  steps?: number;      // stairs
  // circle
  cx?: number; cy?: number; r?: number;
  // ellipse
  rx?: number; ry?: number;
  // polygon · path
  points?: [number, number][];
  /** path: true = se cierra y se rellena; false = queda como trazo. */
  closed?: boolean;
  /** path: 0 = esquinas rectas (igual que polygon), 1 = todo curvas. */
  smooth?: number;
  // line
  x1?: number; y1?: number; x2?: number; y2?: number;
  width?: number;
  // star
  puntas?: number;
  /** star: cuánto se hunden los valles respecto a las puntas (0..1). */
  hueco?: number;
  // door · window
  /** door: remate de arriba. */
  arco?: boolean;
  /** window: cuántas hojas a lo ancho y a lo alto. */
  columnas?: number; filas?: number;
  // tree
  /** tree: proporción del alto que ocupa el tronco. */
  tronco?: number;
  // repeat
  /** repeat: la forma que se repite, sin posición: la pone el repetidor. */
  item?: Omit<Objeto, "id">;
  veces?: number;
}

export interface Capa {
  id: string;
  name: string;
  /** 0 = infinito (no se mueve), 1 = pegado a la cámara (se mueve entero). */
  depth: number;
  visible?: boolean;
  /**
   * Capa de RESERVA: dice dónde irá el personaje y dónde los efectos, pero no
   * se dibuja. Mandarla al modelo de imagen es pagar por un PNG vacío.
   */
  guia?: boolean;
  /** Desenfoque sugerido a la IA para esta capa, de 0 a 1. */
  blur?: number;
  /**
   * Movimiento PROPIO de la capa, además del de la cámara. Es lo que hace que
   * un pájaro cruce el cuadro o que una barca flote, en vez de tener una
   * escena con profundidad pero completamente quieta.
   */
  mov?: MovCapa;
  ai?: { prompt?: string; exclude?: string };
  objects: Objeto[];
}

export type TipoSuperficie = "suelo" | "escalera" | "agua" | "aire" | "libre";

/** Línea semántica por la que un actor puede desplazarse sin caminar en el aire. */
export interface SuperficieNavegable {
  id: string;
  tipo: TipoSuperficie;
  /** Polilínea de izquierda a derecha en coordenadas 0..1 del lienzo. */
  puntos: [number, number][];
  acciones?: ("caminar" | "correr" | "volar" | "flotar" | "nadar" | "caer" | "otro")[];
  depth?: number;
  /** Última capa situada detrás del actor que usa esta superficie. */
  despuesDe?: string;
}

export interface Escena {
  $schema?: string;
  scene: {
    id: string;
    title: string;
    width: number;
    height: number;
    mapBackground?: string;
    description?: string;
    style?: string;
  };
  palette?: Partial<Record<Semantico, string>>;
  layers: Capa[];
  /** Geometría transitable para colocar y mover sprites con lógica espacial. */
  navegacion?: { superficies: SuperficieNavegable[] };
}

export const ESQUEMA = "tvphi.semantic-scene-map/v2";

/** Semánticos que solo reservan sitio: ninguno de ellos se dibuja. */
const SOLO_RESERVA = new Set<Semantico>(["subject", "vfx_zone", "negative_space"]);

/**
 * ¿Es una capa de guía, de las que NO hay que mandar a dibujar?
 *
 * Importa porque cuesta dinero: cada capa que se manda es una imagen que se
 * paga, y una guía devuelve un PNG vacío. Pasó de verdad —«03 Reservas de
 * animación», con su «Draw nothing on this transparent guide layer»— y se pagó.
 *
 * Se mira por tres sitios y basta con uno, porque el modelo pone la marca
 * cuando le apetece: la marca «guia», lo que dice su prompt, y que todo lo que
 * lleva sea reserva.
 */
export function esGuia(c: Capa): boolean {
  if (c.guia === true) return true;
  const texto = `${c.name ?? ""} ${c.ai?.prompt ?? ""}`.toLowerCase();
  if (/draw nothing|nothing is drawn|leave .{0,24}(empty|blank)|guide layer|reserved (area|zone|layer)|placeholder layer|no dibujes nada|capa gu[ií]a|reserva/.test(texto)) return true;
  return c.objects.length > 0 && c.objects.every((o) => SOLO_RESERVA.has(o.semantic));
}

// ── Comprobación ────────────────────────────────────────────────────────────
//
// Se valida a mano y no con zod a propósito: lo que hace falta aquí no es
// rechazar el JSON, es DECIR QUÉ FALTA. Quien pega esto viene de pedírselo a
// una IA, y «layers[2].objects[0]: falta «shape»» le sirve para corregir el
// prompt; «invalid_type» no.

export function revisar(data: unknown): { escena: Escena } | { error: string } {
  const fallos: string[] = [];
  const d = data as Escena;
  if (!d || typeof d !== "object") return { error: "El JSON no es un objeto." };
  if (!d.scene || typeof d.scene !== "object") fallos.push("falta el bloque «scene»");
  else {
    if (!d.scene.id) fallos.push("scene.id está vacío");
    if (!(d.scene.width > 0) || !(d.scene.height > 0)) fallos.push("scene.width y scene.height tienen que ser números mayores que cero");
  }
  if (!Array.isArray(d.layers) || !d.layers.length) fallos.push("«layers» tiene que ser una lista con al menos una capa");
  else {
    const vistos = new Set<string>();
    d.layers.forEach((capa, i) => {
      if (!capa || typeof capa !== "object") { fallos.push(`layers[${i}] no es un objeto`); return; }
      if (!capa.id) fallos.push(`layers[${i}]: falta «id»`);
      else if (vistos.has(capa.id)) fallos.push(`hay dos capas con el id «${capa.id}»`);
      else vistos.add(capa.id);
      if (typeof capa.depth !== "number") fallos.push(`layers[${i}] («${capa.id ?? "?"}»): falta «depth», el número que decide cuánto se mueve`);
      if (!Array.isArray(capa.objects)) { fallos.push(`layers[${i}] («${capa.id ?? "?"}»): «objects» tiene que ser una lista`); return; }
      capa.objects.forEach((o, j) => {
        if (!o || typeof o !== "object") { fallos.push(`layers[${i}].objects[${j}] no es un objeto`); return; }
        if (!o.shape) fallos.push(`layers[${i}].objects[${j}]: falta «shape»`);
        if (!o.semantic) fallos.push(`layers[${i}].objects[${j}]: falta «semantic» (qué es esto: wall, floor, subject…)`);
        else if (!(o.semantic in PALETA)) fallos.push(`layers[${i}].objects[${j}]: «${o.semantic}» no es un semantic conocido`);
      });
    });
  }
  if (fallos.length) return { error: fallos.slice(0, 8).join(" · ") };
  return { escena: normalizar(d) };
}

/**
 * Semánticos que son decorado/arquitectura quieta. Tener solo estos objetos
 * implica que «mov» es casi siempre un error del modelo (islas flotando, etc.).
 */
const DECORADO_QUIETO = new Set<Semantico>([
  "sky", "terrain", "wall", "floor", "column", "arch", "stairs",
  "vegetation", "door", "window", "light_anchor",
]);

/** ¿Esta capa debería ignorar cualquier «mov» que haya inventado la IA? */
export function capaDebeQuedarQuieta(c: Pick<Capa, "objects" | "guia">, esFondo: boolean): boolean {
  if (esFondo || c.guia) return true;
  const objs = c.objects ?? [];
  if (!objs.length) return false;
  return objs.every((o) => DECORADO_QUIETO.has(o.semantic));
}

/** Rellena lo que se puede dar por hecho, para que dibujar no tenga que dudar. */
export function normalizar(d: Escena): Escena {
  // Fondo = primera capa no-guía en el orden de llegada (de atrás a delante).
  let vistaFondo = false;
  const capas = d.layers
    .map((c) => {
      const esFondo = !vistaFondo && !esGuia({ ...c, objects: c.objects ?? [], guia: c.guia });
      if (esFondo) vistaFondo = true;
      const base = {
        ...c,
        visible: c.visible !== false,
        objects: c.objects ?? [],
      };
      const guia = esGuia(base);
      let mov = normalizarMov((c as any).mov);
      if (mov && capaDebeQuedarQuieta({ ...base, guia }, esFondo)) mov = undefined;
      return { ...base, guia, mov };
    });
  const porId = new Map(capas.map((c) => [c.id, c]));
  // Una capa ligada físicamente a otra hereda su profundidad. Esta igualdad es
  // la que evita que tren y vía se separen cuando cambia el zoom/paralaje.
  const enlazadas = capas
    .map((c) => {
      const ref = c.mov?.referenciaCapaId ? porId.get(c.mov.referenciaCapaId) : undefined;
      return ref && ref.id !== c.id ? { ...c, depth: ref.depth } : c;
    })
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

  const base: Escena = {
    $schema: d.$schema ?? ESQUEMA,
    scene: {
      mapBackground: "#101522",
      description: "",
      style: "",
      ...d.scene,
    },
    palette: { ...PALETA, ...(d.palette ?? {}) },
    // Se conserva temporalmente para que superficiesDeEscena valide sus
    // coordenadas. El resultado validado reemplaza este bloque más abajo.
    ...(d.navegacion ? { navegacion: d.navegacion } : {}),
    // De atrás hacia delante: el orden de pintado es el de profundidad, y
    // depender de que quien escribe el JSON los ponga en orden es pedir un
    // fallo que además es invisible.
    layers: enlazadas,
  };
  const superficies = superficiesDeEscena(base);
  return superficies.length
    ? { ...base, navegacion: { superficies } }
    : base;
}

/**
 * Pegas que no son errores de JSON pero estropean el resultado.
 *
 * La que más duele: una forma que cubre el cuadro entero en una capa que no es
 * la del fondo. El JSON es válido, el mapa se ve bien… y el PNG de esa capa
 * sale sin un solo píxel transparente, así que al apilarla tapa todo lo de
 * detrás y el paralaje deja de verse. Se descubre tarde y cuesta entenderlo.
 */
export function pegas(esc: Escena): string[] {
  const out: string[] = [];
  const ids = new Set(esc.layers.map((c) => c.id));
  esc.layers.forEach((capa, i) => {
    if (capa.mov?.referenciaCapaId && !ids.has(capa.mov.referenciaCapaId)) {
      out.push(`«${capa.name}» se apoya en «${capa.mov.referenciaCapaId}», pero esa capa no existe.`);
    }
    if (i === 0) return; // la del fondo SÍ debe cubrirlo todo
    const tapa = capa.objects.find((o) =>
      (o.shape === "rect" || o.shape === "roundedRect")
      && (o.w ?? 0) >= 0.95 && (o.h ?? 0) >= 0.95
      && (o.opacity ?? 1) > 0.02);
    if (tapa) {
      out.push(`«${capa.name}» tiene una forma que cubre el cuadro entero (${tapa.id}). `
        + "Esa capa saldrá sin transparencia y tapará las de detrás: lo que ocupa todo se cuenta en el prompt de la capa, no con una forma.");
    }
    if (!capa.objects.length) out.push(`«${capa.name}» no tiene ninguna forma.`);
  });
  const repetidaSinRelacion = esc.layers.some((a, i) => esc.layers.slice(i + 1).some((b) =>
    a.depth === b.depth
    && a.mov?.referenciaCapaId !== b.id
    && b.mov?.referenciaCapaId !== a.id));
  if (repetidaSinRelacion) {
    out.push("Hay capas con la misma profundidad: se moverán igual y no se notará el paralaje entre ellas.");
  }
  return out;
}

export const nombreArchivo = (s: string) =>
  (s || "escena").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "escena";
