export const TAMANO_ATLAS_SPRITE = 2048;
export const BORDE_ATLAS_SPRITE = 2;
export interface MarcoAtlasSprite { atlasId: string; x: number; y: number; ancho: number; alto: number; }
export interface CursorAtlasSprite { ancho: number; alto: number; cursorX: number; cursorY: number; altoFila: number; }

export function reservarMarcoAtlas(e: CursorAtlasSprite, ancho: number, alto: number, borde = 2) {
  const w = Math.max(1, Math.round(ancho)), h = Math.max(1, Math.round(alto)), m = Math.max(0, Math.round(borde));
  if (w + m * 2 > e.ancho || h + m * 2 > e.alto) return null;
  let x = Math.max(m, e.cursorX), y = Math.max(m, e.cursorY), altoFila = Math.max(0, e.altoFila);
  if (x + w + m > e.ancho) { x = m; y += altoFila; altoFila = 0; }
  if (y + h + m > e.alto) return null;
  return { x, y, siguiente: { ...e, cursorX: x + w + m, cursorY: y, altoFila: Math.max(altoFila, h + m) } };
}

export function normalizarMarcosAtlas(v: unknown, n: number, ancho: number, alto: number): MarcoAtlasSprite[] | null {
  if (!Array.isArray(v) || v.length !== n) return null;
  const out: MarcoAtlasSprite[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") return null;
    const m = x as Record<string, unknown>;
    const px = Number(m.x), py = Number(m.y), w = Number(m.ancho), h = Number(m.alto);
    if (typeof m.atlasId !== "string" || !m.atlasId || ![px, py, w, h].every(Number.isInteger)
      || px < 0 || py < 0 || w !== ancho || h !== alto) return null;
    out.push({ atlasId: m.atlasId, x: px, y: py, ancho: w, alto: h });
  }
  return out;
}
