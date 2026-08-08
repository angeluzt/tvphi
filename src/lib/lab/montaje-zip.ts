// Empaquetar / desempaquetar el trabajo del laboratorio.
//
// HAY DOS ZIP Y SE CONFUNDEN, así que conviene saber cuál es cuál:
//
//   zipDeCapas (exportar.ts) → el MAPA: guías de colores planos. Sirve para
//     dárselo a una IA de fuera, no para volver a abrir tu trabajo.
//   este ....................→ el PROYECTO: las imágenes ya generadas, su
//     profundidad, el mapa que las originó y la animación de cámara.
//
// El segundo es el que devuelve las cosas donde estaban. Antes solo llevaba las
// imágenes, así que al reimportar se recuperaba el montaje pero se perdían el
// mapa y la cola: había que rehacerlos a mano. Ahora van dentro (versión 2), y
// los ZIP viejos se siguen leyendo.

import { zip, bajar } from "@/lib/lab/exportar";
import { leerZip } from "@/lib/story/zip";

export type CapaMontajeMeta = {
  nombre: string;
  depth: number;
  escala: number;
  opacidad: number;
  archivo: string;
  via?: "transparente" | "croma" | "opaca";
  vacio?: number;
  /** Movimiento propio de la capa, si lo tiene. */
  mov?: unknown;
  /**
   * Si la capa es un sprite de la biblioteca: cómo leer su PNG.
   *
   * El archivo que se guarda es la TIRA entera —los N fotogramas en fila—, así
   * que sin esto el ZIP contendría una imagen larguísima con doce pájaros y al
   * reimportarla se pintaría tal cual. Es lo que dice dónde cortar.
   */
  spr?: unknown;
};

export type MontajePack = {
  /** 1 = solo imágenes. 2 = además el mapa y la animación. */
  version: 1 | 2;
  width: number;
  height: number;
  capas: CapaMontajeMeta[];
  /** El mapa de formas que originó estas capas. */
  escena?: unknown;
  /** La cola de cámara, tal cual la entiende el motor. */
  cola?: unknown[];
  /** Efectos del motor colgados de la escena. */
  efectos?: unknown[];
};

function limpio(s: string) {
  return s.replace(/[^\w\-. ]+/g, "").trim().slice(0, 40) || "capa";
}

function pngDeImg(img: HTMLImageElement): Promise<Uint8Array<ArrayBuffer>> {
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise((res, rej) => {
    cv.toBlob(async (b) => {
      if (!b) return rej(new Error("no se pudo leer la capa"));
      res(new Uint8Array(await b.arrayBuffer()));
    }, "image/png");
  });
}

/** Baja un ZIP con cada PNG + montaje.json. */
export async function bajarMontajeZip(opts: {
  width: number;
  height: number;
  /** El mapa, la cámara y los efectos. Opcionales: sin ellos sale un ZIP v1. */
  escena?: unknown;
  cola?: unknown[];
  efectos?: unknown[];
  capas: {
    nombre: string;
    depth: number;
    escala: number;
    opacidad: number;
    via?: CapaMontajeMeta["via"];
    vacio?: number;
    mov?: unknown;
    spr?: unknown;
    img: HTMLImageElement;
  }[];
}) {
  const metas: CapaMontajeMeta[] = [];
  const archivos: { nombre: string; datos: Uint8Array<ArrayBuffer> }[] = [];

  for (let i = 0; i < opts.capas.length; i++) {
    const c = opts.capas[i];
    const archivo = `${String(i + 1).padStart(2, "0")}-${limpio(c.nombre)}.png`;
    archivos.push({ nombre: archivo, datos: await pngDeImg(c.img) });
    metas.push({
      nombre: c.nombre,
      depth: c.depth,
      escala: c.escala,
      opacidad: c.opacidad,
      archivo,
      via: c.via,
      vacio: c.vacio,
      mov: c.mov,
      spr: c.spr,
    });
  }

  const llevaExtras = !!opts.escena || !!opts.cola?.length || !!opts.efectos?.length;
  const pack: MontajePack = {
    version: llevaExtras ? 2 : 1,
    width: opts.width,
    height: opts.height,
    capas: metas,
    ...(opts.escena ? { escena: opts.escena } : {}),
    ...(opts.cola?.length ? { cola: opts.cola } : {}),
    ...(opts.efectos?.length ? { efectos: opts.efectos } : {}),
  };
  archivos.push({
    nombre: "montaje.json",
    datos: new TextEncoder().encode(JSON.stringify(pack, null, 2)),
  });
  archivos.push({
    nombre: "leeme.txt",
    datos: new TextEncoder().encode(
      "Proyecto del laboratorio de TVPHI.\n\n"
      + "Lleva dentro TODO lo necesario para volver a donde lo dejaste:\n"
      + "  · las imágenes de cada capa, con su profundidad\n"
      + "  · el mapa de formas que las originó\n"
      + "  · la animación de cámara\n\n"
      + "Para recuperarlo: laboratorio → Montaje y paralaje → «Importar todo».\n"
      + "La primera imagen es el fondo; el resto deberían ser PNG con transparencia.\n",
    ),
  });

  bajar(zip(archivos), `laboratorio-${Date.now()}.zip`);
}

export type CapaImportada = {
  nombre: string;
  depth: number;
  escala: number;
  opacidad: number;
  via?: CapaMontajeMeta["via"];
  vacio?: number;
  mov?: unknown;
  spr?: unknown;
  url: string;
};

/** Lee un ZIP de montaje y devuelve URLs blob + meta. */
export async function leerMontajeZip(file: Blob): Promise<{
  width: number;
  height: number;
  capas: CapaImportada[];
  /** Solo en los ZIP v2. En los viejos vienen vacíos, y no pasa nada. */
  escena?: unknown;
  cola?: unknown[];
  efectos?: unknown[];
}> {
  const entradas = await leerZip(file);
  if (!entradas.length) throw new Error("Ese ZIP está vacío o no se puede leer.");

  const metaEnt = entradas.find((e) => /(^|\/)montaje\.json$/i.test(e.nombre));
  let pack: MontajePack | null = null;
  if (metaEnt) {
    try {
      pack = JSON.parse(new TextDecoder().decode(metaEnt.datos)) as MontajePack;
    } catch {
      throw new Error("montaje.json no es válido.");
    }
  }

  const pngs = new Map(
    entradas
      .filter((e) => /\.png$/i.test(e.nombre))
      .map((e) => [e.nombre.replace(/^.*\//, ""), e]),
  );

  if (pack?.capas?.length) {
    const capas: CapaImportada[] = [];
    for (const m of pack.capas) {
      const key = m.archivo.replace(/^.*\//, "");
      const ent = pngs.get(key) ?? [...pngs.values()].find((e) => e.nombre.endsWith(key));
      if (!ent) throw new Error(`Falta la imagen «${m.archivo}» en el ZIP.`);
      const url = URL.createObjectURL(new Blob([ent.datos.slice()], { type: "image/png" }));
      capas.push({
        nombre: m.nombre,
        depth: m.depth,
        escala: m.escala ?? 1,
        opacidad: m.opacidad ?? 1,
        via: m.via,
        vacio: m.vacio,
        mov: m.mov,
        spr: m.spr,
        url,
      });
    }
    return {
      width: pack.width || 1920,
      height: pack.height || 1080,
      capas,
      escena: pack.escena,
      cola: Array.isArray(pack.cola) ? pack.cola : undefined,
      efectos: Array.isArray(pack.efectos) ? pack.efectos : undefined,
    };
  }

  // Sin JSON: todas las PNG por nombre.
  const orden = [...pngs.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!orden.length) throw new Error("No hay PNG en el ZIP.");
  const capas: CapaImportada[] = orden.map((e, i) => ({
    nombre: e.nombre.replace(/\.png$/i, "").replace(/^\d+-/, ""),
    depth: orden.length === 1 ? 0 : (i / (orden.length - 1)) ** 1.4,
    escala: 1 + (orden.length === 1 ? 0 : (i / (orden.length - 1)) ** 1.4) * 0.12,
    opacidad: 1,
    url: URL.createObjectURL(new Blob([e.datos.slice()], { type: "image/png" })),
  }));
  return { width: 1920, height: 1080, capas };
}
