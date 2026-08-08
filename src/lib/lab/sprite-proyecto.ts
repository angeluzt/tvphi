import { normalizarCeldasSprite, type CeldaSprite } from "./sprites";

// El ZIP de un sprite es un PROYECTO, no una carpeta con N PNG repetidos.
// Lleva dos imágenes: la hoja original que pagó la llamada y la tira final que
// reproduce TVPhi. El JSON une ambas y conserva dónde se leyó cada celda.

export const ARCHIVO_HOJA_SPRITE = "hoja-original.png";
export const ARCHIVO_TIRA_SPRITE = "sprite.png";
export const ARCHIVO_META_SPRITE = "sprite.json";

export interface ProyectoSpriteV2 {
  version: 2;
  tipo: "tvphi.sprite-project";
  nombre: string;
  que: string;
  fps: number;
  forma: "tira" | "columna";
  croma: string;
  hoja: {
    archivo: string;
    ancho: number;
    alto: number;
  };
  tira: {
    archivo: string;
    fotogramas: number;
    anchoFotograma: number;
    altoFotograma: number;
  };
  celdas: CeldaSprite[];
}

const entero = (v: unknown, min: number, max: number, nombre: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`sprite.json no tiene ${nombre} válido.`);
  return Math.max(min, Math.min(max, Math.round(n)));
};

const texto = (v: unknown, defecto: string, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : defecto;

export function crearProyectoSprite(opts: {
  nombre: string;
  que: string;
  fps: number;
  forma: "tira" | "columna";
  croma?: string;
  anchoHoja: number;
  altoHoja: number;
  fotogramas: number;
  anchoFotograma: number;
  altoFotograma: number;
  celdas: CeldaSprite[];
}): ProyectoSpriteV2 {
  return normalizarProyectoSprite({
    version: 2,
    tipo: "tvphi.sprite-project",
    nombre: opts.nombre,
    que: opts.que,
    fps: opts.fps,
    forma: opts.forma,
    croma: opts.croma ?? "#FF00FF",
    hoja: {
      archivo: ARCHIVO_HOJA_SPRITE,
      ancho: opts.anchoHoja,
      alto: opts.altoHoja,
    },
    tira: {
      archivo: ARCHIVO_TIRA_SPRITE,
      fotogramas: opts.fotogramas,
      anchoFotograma: opts.anchoFotograma,
      altoFotograma: opts.altoFotograma,
    },
    celdas: opts.celdas,
  });
}

/** Valida y acota un manifiesto importado antes de usar sus coordenadas. */
export function normalizarProyectoSprite(v: unknown): ProyectoSpriteV2 {
  if (!v || typeof v !== "object") throw new Error("sprite.json no es válido.");
  const p = v as any;
  if (p.version !== 2 || p.tipo !== "tvphi.sprite-project") {
    throw new Error("Ese ZIP no es un proyecto de sprite TVPhi versión 2.");
  }
  const anchoHoja = entero(p.hoja?.ancho, 1, 8192, "ancho de hoja");
  const altoHoja = entero(p.hoja?.alto, 1, 8192, "alto de hoja");
  if (!Array.isArray(p.celdas) || !p.celdas.length) {
    throw new Error("sprite.json no contiene las celdas de la hoja.");
  }
  const celdas = normalizarCeldasSprite(p.celdas, anchoHoja, altoHoja);
  const fotogramas = entero(p.tira?.fotogramas, 1, 24, "número de fotogramas");
  if (fotogramas > celdas.length) {
    throw new Error("La tira declara más fotogramas que celdas en la hoja.");
  }
  const croma = /^#[0-9a-f]{6}$/i.test(String(p.croma ?? ""))
    ? String(p.croma).toUpperCase()
    : "#FF00FF";

  return {
    version: 2,
    tipo: "tvphi.sprite-project",
    nombre: texto(p.nombre, "sprite", 60),
    que: texto(p.que, "sprite", 400),
    fps: entero(p.fps, 1, 60, "fps"),
    forma: p.forma === "columna" ? "columna" : "tira",
    croma,
    hoja: {
      archivo: texto(p.hoja?.archivo, ARCHIVO_HOJA_SPRITE, 120),
      ancho: anchoHoja,
      alto: altoHoja,
    },
    tira: {
      archivo: texto(p.tira?.archivo, ARCHIVO_TIRA_SPRITE, 120),
      fotogramas,
      anchoFotograma: entero(p.tira?.anchoFotograma, 1, 4096, "ancho de fotograma"),
      altoFotograma: entero(p.tira?.altoFotograma, 1, 4096, "alto de fotograma"),
    },
    celdas,
  };
}

/** Los cuatro archivos del ZIP. Nunca crea un PNG por fotograma. */
export function archivosProyectoSprite(
  proyecto: ProyectoSpriteV2,
  hoja: Uint8Array<ArrayBuffer>,
  tira: Uint8Array<ArrayBuffer>,
) {
  return [{
    nombre: ARCHIVO_HOJA_SPRITE,
    datos: hoja,
  }, {
    nombre: ARCHIVO_TIRA_SPRITE,
    datos: tira,
  }, {
    nombre: ARCHIVO_META_SPRITE,
    datos: new TextEncoder().encode(JSON.stringify(proyecto, null, 2)),
  }, {
    nombre: "leeme.txt",
    datos: new TextEncoder().encode(
      `Proyecto de sprite «${proyecto.nombre}» (${proyecto.tira.fotogramas} fotogramas, ${proyecto.fps}/s).\n\n`
      + `${ARCHIVO_HOJA_SPRITE}: la hoja de trabajo completa previa al corte, con sus correcciones.\n`
      + `${ARCHIVO_TIRA_SPRITE}: el resultado final exacto que reproduce TVPhi.\n`
      + `${ARCHIVO_META_SPRITE}: posición x/y/ancho/alto de cada celda y metadatos.\n\n`
      + "Para seguir editándolo: Laboratorio → Sprites → Importar proyecto ZIP.\n",
    ),
  }];
}
