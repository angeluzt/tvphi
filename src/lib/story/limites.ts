/** Tope de capítulos guardados por cuenta (manual + IA). */
export const MAX_PROYECTOS_POR_USUARIO = 80;
/** Tope de fichas de personaje. */
export const MAX_PERSONAJES_POR_USUARIO = 120;
/** JSON del capítulo: ~2.5 MB serializado (imágenes van en IndexedDB, no aquí). */
export const MAX_BYTES_JSON_CAPITULO = 2_500_000;
/** JSON de ficha de personaje. */
export const MAX_BYTES_JSON_PERSONAJE = 400_000;
/** Cabecera Content-Length máxima en APIs de historia (JSON). */
export const MAX_BYTES_BODY_STORY = 3_000_000;

export function bytesJson(valor: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(valor), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function cuerpoDemasiadoGrande(req: Request, max = MAX_BYTES_BODY_STORY): string | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > max) return `La petición pesa demasiado (máx. ${Math.floor(max / 1024)} KB).`;
  return null;
}
