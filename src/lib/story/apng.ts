// Armar un APNG a partir de PNG ya hechos.
//
// El navegador sabe escribir un PNG de un fotograma, no encadenarlos. Un APNG
// es un PNG normal con capítulos: IHDR del primero, acTL con el recuento, y
// por cada cuadro un fcTL con su duración más los datos (IDAT el primero,
// fdAT los demás). Se arma a mano, igual que mesa-de-luz.html.
//
// El motor de historias NO usa este archivo para pintar: el lienzo elige el
// fotograma por id. Esto sirve para exportar / previsualizar el loop como
// una sola imagen animada.

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo: string, datos: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + datos.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, datos.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tipo.charCodeAt(i);
  out.set(datos, 8);
  dv.setUint32(8 + datos.length, crc32(out.subarray(4, 8 + datos.length)));
  return out;
}

export interface PngTroceado {
  ihdr: Uint8Array;
  idat: Uint8Array;
  ancho: number;
  alto: number;
}

export function leerPng(buf: ArrayBuffer | Uint8Array): PngTroceado {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 24 || u8[0] !== 0x89 || u8[1] !== 0x50) {
    throw new Error("Eso no es un PNG.");
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 8;
  let ihdr: Uint8Array | null = null;
  const idats: Uint8Array[] = [];
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p);
    const tipo = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    const datos = u8.subarray(p + 8, p + 8 + len);
    if (tipo === "IHDR") ihdr = datos.slice();
    else if (tipo === "IDAT") idats.push(datos.slice());
    else if (tipo === "IEND") break;
    p += 12 + len;
  }
  if (!ihdr || !idats.length) throw new Error("PNG incompleto: falta IHDR o IDAT.");
  const total = idats.reduce((s, d) => s + d.length, 0);
  const idat = new Uint8Array(total);
  let o = 0;
  for (const d of idats) { idat.set(d, o); o += d.length; }
  const v = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  return { ihdr, idat, ancho: v.getUint32(0), alto: v.getUint32(4) };
}

export function armarApng(
  fotogramas: PngTroceado[],
  fps: number,
  bucle = true,
): Uint8Array {
  if (fotogramas.length < 2) throw new Error("Hacen falta al menos dos fotogramas.");
  const { ancho, alto, ihdr } = fotogramas[0];
  for (const f of fotogramas) {
    if (f.ancho !== ancho || f.alto !== alto) {
      throw new Error("Todos los fotogramas tienen que medir lo mismo.");
    }
  }
  const trozos: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  trozos.push(trozo("IHDR", ihdr));
  const actl = new Uint8Array(8);
  const dvA = new DataView(actl.buffer);
  dvA.setUint32(0, fotogramas.length);
  dvA.setUint32(4, bucle ? 0 : 1);
  trozos.push(trozo("acTL", actl));

  const ms = Math.max(1, Math.round(1000 / Math.max(1, Math.min(30, fps))));
  let seq = 0;
  fotogramas.forEach((f, i) => {
    const fctl = new Uint8Array(26);
    const dv = new DataView(fctl.buffer);
    dv.setUint32(0, seq++);
    dv.setUint32(4, ancho);
    dv.setUint32(8, alto);
    dv.setUint16(20, ms);
    dv.setUint16(22, 1000);
    fctl[24] = 0;
    fctl[25] = 0;
    trozos.push(trozo("fcTL", fctl));
    if (i === 0) trozos.push(trozo("IDAT", f.idat));
    else {
      const fdat = new Uint8Array(4 + f.idat.length);
      new DataView(fdat.buffer).setUint32(0, seq++);
      fdat.set(f.idat, 4);
      trozos.push(trozo("fdAT", fdat));
    }
  });
  trozos.push(trozo("IEND", new Uint8Array(0)));

  const total = trozos.reduce((s, t) => s + t.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const t of trozos) { out.set(t, o); o += t.length; }
  return out;
}
