// Empaquetar / desempaquetar el montaje del compositor (capas + JSON).
//
// El ZIP del mapa (zipDeCapas) lleva guías de color. Este lleva las imágenes
// YA generadas o subidas, con su profundidad, para poder guardar una prueba y
// volver a abrirla sin regenerar.

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
};

export type MontajePack = {
  version: 1;
  width: number;
  height: number;
  capas: CapaMontajeMeta[];
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
  capas: {
    nombre: string;
    depth: number;
    escala: number;
    opacidad: number;
    via?: CapaMontajeMeta["via"];
    vacio?: number;
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
    });
  }

  const pack: MontajePack = {
    version: 1,
    width: opts.width,
    height: opts.height,
    capas: metas,
  };
  archivos.push({
    nombre: "montaje.json",
    datos: new TextEncoder().encode(JSON.stringify(pack, null, 2)),
  });
  archivos.push({
    nombre: "leeme.txt",
    datos: new TextEncoder().encode(
      "Montaje de capas con paralaje (laboratorio TVPHI).\n"
      + "Importa este ZIP en la pestaña Compositor → Importar ZIP.\n"
      + "La primera imagen es el fondo; el resto deberían ser PNG con transparencia.\n",
    ),
  });

  bajar(zip(archivos), `montaje-capas-${Date.now()}.zip`);
}

export type CapaImportada = {
  nombre: string;
  depth: number;
  escala: number;
  opacidad: number;
  via?: CapaMontajeMeta["via"];
  vacio?: number;
  url: string;
};

/** Lee un ZIP de montaje y devuelve URLs blob + meta. */
export async function leerMontajeZip(file: Blob): Promise<{
  width: number;
  height: number;
  capas: CapaImportada[];
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
        url,
      });
    }
    return {
      width: pack.width || 1920,
      height: pack.height || 1080,
      capas,
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
