// Sacar las capas del mapa y el texto que hay que darle a la IA.

import type { Escena, Semantico } from "./escena";
import { PALETA, SEMANTICO_LABEL, nombreArchivo } from "./escena";
import { dibujarEscena } from "./dibujar";

/** Un PNG de la escena, o solo de algunas capas, al tamaño real. */
export function lienzoDeCapas(
  esc: Escena,
  capas: string[] | null,
  transparente: boolean,
  etiquetas: boolean,
  fondoMapa?: string,
) {
  const cv = document.createElement("canvas");
  cv.width = esc.scene.width;
  cv.height = esc.scene.height;
  dibujarEscena(cv, esc, { capas: capas ?? undefined, transparente, etiquetas, fondoMapa });
  return cv;
}

export const aBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("no se pudo generar el PNG"))), "image/png"));

// ── ZIP sin comprimir ───────────────────────────────────────────────────────
// Un PNG ya viene comprimido: volver a comprimirlo no ahorra nada y obligaría a
// meter una librería. Así el ZIP se escribe con veinte líneas y sin dependencias.

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
const crc32 = (u: Uint8Array) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u.length; i++) c = TABLA[(c ^ u[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

export function zip(archivos: { nombre: string; datos: Uint8Array<ArrayBuffer> }[]) {
  // El tipo lleva el ArrayBuffer dentro: sin acotarlo, TypeScript ve la
  // posibilidad de un SharedArrayBuffer y no deja meterlos en un Blob.
  const partes: Uint8Array<ArrayBuffer>[] = [], dir: Uint8Array<ArrayBuffer>[] = [];
  const enc = new TextEncoder();
  let off = 0;
  for (const { nombre, datos } of archivos) {
    const nm = enc.encode(nombre), c = crc32(datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true); loc.setUint16(12, 0x21, true);
    loc.setUint32(14, c, true);
    loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
    loc.setUint16(26, nm.length, true);
    partes.push(new Uint8Array(loc.buffer), nm, datos);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true); cen.setUint16(14, 0x21, true);
    cen.setUint32(16, c, true);
    cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nm.length, true);
    cen.setUint32(42, off, true);
    dir.push(new Uint8Array(cen.buffer), nm);
    off += 30 + nm.length + datos.length;
  }
  const tam = dir.reduce((a, d) => a + d.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
  return new Blob([...partes, ...dir, new Uint8Array(fin.buffer)], { type: "application/zip" });
}

export function bajar(blob: Blob, nombre: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export async function zipDeCapas(esc: Escena, ids: string[], etiquetas: boolean) {
  const archivos: { nombre: string; datos: Uint8Array<ArrayBuffer> }[] = [];
  for (const id of ids) {
    const capa = esc.layers.find((c) => c.id === id);
    if (!capa) continue;
    const b = await aBlob(lienzoDeCapas(esc, [id], true, etiquetas));
    archivos.push({
      nombre: `${nombreArchivo(esc.scene.id)}--${nombreArchivo(capa.name || capa.id)}.png`,
      datos: new Uint8Array(await b.arrayBuffer()),
    });
  }
  archivos.push({
    nombre: "instrucciones.txt",
    datos: new TextEncoder().encode(promptIa(esc, ids)),
  });
  archivos.push({
    nombre: "escena.json",
    datos: new TextEncoder().encode(JSON.stringify(
      { ...esc, layers: esc.layers.filter((c) => ids.includes(c.id)) }, null, 2)),
  });
  return zip(archivos);
}

// ── El texto para la IA ─────────────────────────────────────────────────────
//
// Va en inglés a propósito: los modelos de imagen entienden bastante mejor las
// instrucciones de composición en inglés, y aquí lo que se juega es justo eso.

export function promptIa(esc: Escena, ids?: string[]) {
  const capas = esc.layers.filter((c) => !ids || ids.includes(c.id));
  const usados = new Set<Semantico>();
  for (const c of capas) for (const o of c.objects) usados.add(o.semantic);

  const paleta = [...usados]
    .map((s) => `- ${(esc.palette?.[s] ?? PALETA[s])} = ${s} (${SEMANTICO_LABEL[s]})`)
    .join("\n");

  const lista = capas.map((c, i) =>
    `${i + 1}. ${c.id} — depth ${c.depth}${c.blur ? `, suggested blur ${Math.round(c.blur * 100)}%` : ""}\n`
    + `   Draw: ${c.ai?.prompt || "the marked content, following the guide shapes."}\n`
    + `   Do NOT draw: ${c.ai?.exclude || "guide colors, labels, text, borders"}`,
  ).join("\n");

  return [
    "The attached PNGs are SEMANTIC LAYOUT MAPS, not finished artwork.",
    "The flat colors and the written labels are instructions telling you WHAT goes WHERE.",
    "Never reproduce them: replace each marked area with the real thing it stands for.",
    "",
    "Color key:",
    paleta,
    "",
    "Layers to generate:",
    lista,
    "",
    "Hard rules:",
    `- Output size: exactly ${esc.scene.width}x${esc.scene.height} px, one image per layer.`,
    "- Keep every shape at the exact position, size and proportion of the map. The layers are stacked afterwards and must line up pixel for pixel.",
    "- Transparent background on every layer EXCEPT the farthest one, which is opaque and fills the frame.",
    "- Do not add text, watermarks, borders, frames or UI of any kind.",
    "- vfx_zone areas must be left EMPTY: fire, portals and glows are animated later on top. Paint only what is behind them.",
    "- light_anchor means the physical lamp, torch or opening. The light itself is added later.",
    "- subject areas reserve the pose and scale of a character. Leave them clear unless that layer explicitly asks for the character.",
    "- Nothing may cross into a layer that is not its own: a foreground rock belongs to the foreground layer only.",
    "",
    `Scene: ${esc.scene.description || esc.scene.title}`,
    `Visual style: ${esc.scene.style || "consistent across all layers"}`,
  ].join("\n");
}
