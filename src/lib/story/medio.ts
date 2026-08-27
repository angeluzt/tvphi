import type { MedioEscena } from "./paleta";

// Un loop de fotogramas: la foto viva (APNG de mesa de luz) o una lámina
// 2.5D que se anima. Se guardan los ids del almacén, no el PNG: el motor
// elige el cuadro según el tiempo de la toma.

export interface LoopImagen {
  /** Ids en IndexedDB, en el orden de reproducción. El primero suele ser el still. */
  imageIds: string[];
  /** 1..30. Mesa de luz usa 6 de serie. */
  fps: number;
}

export const FPS_LOOP_DEFECTO = 6;
export const MIN_FOTOS_LOOP = 2;
export const MAX_FOTOS_LOOP = 12;

export function normalizarLoop(raw: unknown): LoopImagen | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const ids = Array.isArray(r.imageIds)
    ? r.imageIds.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, MAX_FOTOS_LOOP)
    : [];
  if (ids.length < MIN_FOTOS_LOOP) return undefined;
  const fps = Math.round(Number(r.fps));
  return {
    imageIds: ids,
    fps: Number.isFinite(fps) ? Math.max(1, Math.min(30, fps)) : FPS_LOOP_DEFECTO,
  };
}

/** Qué fotograma toca a los `t` segundos. */
export function indiceLoop(loop: LoopImagen, t: number): number {
  const n = loop.imageIds.length;
  if (n < 2) return 0;
  const i = Math.floor(Math.max(0, t) * loop.fps) % n;
  return i < 0 ? i + n : i;
}

export function idLoopEn(loop: LoopImagen | undefined, t: number, respaldo: string): string {
  if (!loop || loop.imageIds.length < MIN_FOTOS_LOOP) return respaldo;
  return loop.imageIds[indiceLoop(loop, t)] || respaldo;
}

type EscenaConMedio = {
  medio?: string;
  capas?: { loop?: LoopImagen; spr?: unknown }[];
  loop?: LoopImagen;
};

/**
 * El medio efectivo: lo que HAY montado, no lo que la IA apuntó.
 *
 * CON UNA EXCEPCIÓN, y es nueva: una foto viva hecha con sprites TAMBIÉN son
 * capas —la foto quieta abajo y los actores encima—, así que por la forma no se
 * distingue de un paralaje. Lo que las separa es la intención: si la escena
 * dice «apng» y trae capas, es una foto viva montada con actores, no un 2.5D.
 * Sin esta salvedad, la interfaz ofrecía «aplanar el paralaje» sobre algo que
 * nunca fue un paralaje.
 *
 * Las escenas de antes no dicen «apng» con capas —o dicen «paralaje», o no
 * dicen nada—, así que siguen leyéndose exactamente igual que siempre.
 */
export function medioDe(sc: EscenaConMedio): MedioEscena {
  if (sc.capas && sc.capas.length > 0) return sc.medio === "apng" ? "apng" : "paralaje";
  if (sc.loop && sc.loop.imageIds.length >= MIN_FOTOS_LOOP) return "apng";
  return "still";
}

/** ¿Esta foto viva está hecha con actores recortados en vez de repintada? */
export function vivaConSprites(sc: EscenaConMedio): boolean {
  return medioDe(sc) === "apng" && (sc.capas ?? []).some((c) => !!c.spr);
}

export function idsDeLoopEscena(sc: Pick<EscenaConMedio, "loop" | "capas">): string[] {
  const ids: string[] = [];
  if (sc.loop) ids.push(...sc.loop.imageIds);
  for (const c of sc.capas ?? []) {
    if (c.loop) ids.push(...c.loop.imageIds);
  }
  return ids;
}
