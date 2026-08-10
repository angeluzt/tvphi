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
