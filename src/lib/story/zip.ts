// Un ZIP con el capítulo entero: el montaje y TODOS sus archivos.
//
// Hasta ahora se podía exportar el JSON, pero no las imágenes ni los audios: al
// abrirlo en otro sitio había que reponerlos a mano uno a uno (en las pruebas,
// dieciséis clics). Aquí van dentro, con el identificador en el nombre, así que
// al importar se colocan solos.
//
// Se guarda SIN comprimir (método "store"). No es pereza: los PNG y los MP3 ya
// vienen comprimidos, así que volver a comprimirlos no ahorra casi nada y sí
// cuesta tiempo y memoria. Con eso el ZIP se escribe sin librerías.

const tabla = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(datos: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = tabla[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip { nombre: string; datos: Uint8Array }

export function crearZip(entradas: EntradaZip[]): Blob {
  const cod = new TextEncoder();
  const trozos: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const e of entradas) {
    const nombre = cod.encode(e.nombre);
    const suma = crc32(e.datos);
    const n = e.datos.length;

    // Cabecera local
    const cab = new Uint8Array(30 + nombre.length);
    const v = new DataView(cab.buffer);
    v.setUint32(0, 0x04034b50, true);   // firma
    v.setUint16(4, 20, true);           // versión necesaria
    v.setUint16(6, 0x0800, true);       // nombres en UTF-8
    v.setUint16(8, 0, true);            // sin comprimir
    v.setUint32(14, suma, true);
    v.setUint32(18, n, true);
    v.setUint32(22, n, true);
    v.setUint16(26, nombre.length, true);
    cab.set(nombre, 30);
    trozos.push(cab, e.datos);

    // Entrada del índice
    const ind = new Uint8Array(46 + nombre.length);
    const w = new DataView(ind.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint32(16, suma, true);
    w.setUint32(20, n, true);
    w.setUint32(24, n, true);
    w.setUint16(28, nombre.length, true);
    w.setUint32(42, desplazamiento, true);
    ind.set(nombre, 46);
    central.push(ind);

    desplazamiento += cab.length + n;
  }

  const tamIndice = central.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, entradas.length, true);
  f.setUint16(10, entradas.length, true);
  f.setUint32(12, tamIndice, true);
  f.setUint32(16, desplazamiento, true);

  // Se pasan como ArrayBuffer: TypeScript no admite un Uint8Array cuyo búfer
  // podría ser compartido, y aquí nunca lo es.
  const partes = [...trozos, ...central, fin].map(
    (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer,
  );
  return new Blob(partes, { type: "application/zip" });
}

// Lee un ZIP de los que escribe la función de arriba (sin comprimir).
export async function leerZip(blob: Blob): Promise<EntradaZip[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);
  const dec = new TextDecoder();
  const fuera: EntradaZip[] = [];
  let i = 0;
  while (i + 4 <= buf.length && v.getUint32(i, true) === 0x04034b50) {
    const metodo = v.getUint16(i + 8, true);
    const tam = v.getUint32(i + 18, true);
    const largoNombre = v.getUint16(i + 26, true);
    const largoExtra = v.getUint16(i + 28, true);
    const ini = i + 30 + largoNombre + largoExtra;
    const nombre = dec.decode(buf.subarray(i + 30, i + 30 + largoNombre));
    // Solo se leen los que este mismo código escribió: sin comprimir.
    if (metodo === 0) fuera.push({ nombre, datos: buf.subarray(ini, ini + tam) });
    i = ini + tam;
  }
  return fuera;
}

// El identificador del archivo va DELANTE del nombre legible, separado por "__".
// Así al importar se sabe a qué hueco pertenece cada uno sin adivinar nada.
export function nombreArchivo(id: string, etiqueta: string, ext: string) {
  const limpio = etiqueta.replace(/[^\w\-. ]+/g, "").trim().slice(0, 60) || "archivo";
  return `archivos/${id}__${limpio}${ext}`;
}

export function idDeNombre(nombre: string): string | null {
  const base = nombre.replace(/^archivos\//, "");
  const corte = base.indexOf("__");
  return corte > 0 ? base.slice(0, corte) : null;
}
