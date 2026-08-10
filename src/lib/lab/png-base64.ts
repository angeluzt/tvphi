/**
 * Convierte un PNG en base64 a Blob sin usar `fetch("data:…")`.
 * Con hojas grandes ese fetch suele tirar "Failed to fetch" aunque la API
 * haya respondido 200 — y se pierde el trabajo (o el money) de la generación.
 */
export function pngBase64ABlob(b64: string): Blob {
  const limpio = b64.replace(/^data:image\/png;base64,/i, "").replace(/\s+/g, "");
  const bin = atob(limpio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Object URL a partir del base64 (revocar cuando ya no haga falta). */
export function pngBase64AObjectUrl(b64: string): string {
  return URL.createObjectURL(pngBase64ABlob(b64));
}

/**
 * El Blob de una imagen, venga como venga su URL.
 *
 * POR QUÉ EXISTE. `fetch(url).then(r => r.blob())` es lo natural y funciona
 * con `blob:` y con `http:`… pero con un `data:` grande Chromium tira
 * `TypeError: Failed to fetch` — sin llegar a hacer ninguna petición, así que
 * en las herramientas de red no se ve nada y parece un problema de servidor.
 *
 * Y los fotogramas recortados SON data: URL (`canvas.toDataURL`), así que
 * cualquier sitio que los pase por fetch falla siempre, no de vez en cuando.
 * Aquí se mira el esquema y se evita el fetch cuando no hace falta.
 */
export async function blobDeUrlDeImagen(url: string): Promise<Blob> {
  if (url.startsWith("data:")) return pngBase64ABlob(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo leer la imagen (${r.status}).`);
  return r.blob();
}
