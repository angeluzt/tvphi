import type { MedioEscena } from "./paleta";

// Un loop de fotogramas: la foto viva (APNG de mesa de luz) o una lámina
// 2.5D que se anima. Se guardan los ids del almacén, no el PNG: el motor
// elige el cuadro según el tiempo de la toma.

export interface LoopImagen {
  /** Ids en IndexedDB, en el orden de reproducción. El primero suele ser el still. */
  imageIds: string[];
  /** 1..30. Mesa de luz usa 6 de serie. */
  fps: number;
  /**
   * VAIVÉN: al llegar al final vuelve hacia atrás en vez de cortar al primero.
   *
   * ES LA DIFERENCIA ENTRE UN BUCLE Y UN TIRÓN. Los fotogramas se dibujan
   * ENCADENADOS —cada uno a partir del anterior—, así que el último se parece
   * mucho al penúltimo y muy poco al primero: toda la deriva acumulada del
   * encadenado está justo ahí. Cortando del último al primero, el salto más
   * grande de todo el ciclo se repite una vez por vuelta, y eso es lo que se
   * ve como un parpadeo rítmico.
   *
   * Yendo y volviendo no hay corte en ninguna parte: cada paso es entre dos
   * cuadros vecinos, que es exactamente para lo que se generaron. Y sale gratis
   * —no hace falta ni una imagen más—, así que va encendido salvo que se apague
   * a mano (por ejemplo, en algo que solo tiene sentido en un sentido: una gota
   * que cae, una puerta que se abre).
   */
  vaiven?: boolean;
}

export const FPS_LOOP_DEFECTO = 6;
export const MIN_FOTOS_LOOP = 2;
export const MAX_FOTOS_LOOP = 12;

/**
 * EL PLAN de una foto viva: qué se mueve, cuántos dibujos y a qué velocidad.
 *
 * No es lo mismo que el `loop`. El loop son las fotos ya hechas; esto es lo que
 * se va a pedir. Existe porque el fallo más caro de la foto viva no estaba en
 * el motor sino aquí: se generaban seis cuadros SIN DECIRLE AL MODELO QUÉ SE
 * MUEVE, así que cada uno elegía una cosa distinta —en uno temblaba el agua, en
 * el siguiente cambiaba una nube, en el tercero se movía una persona—. Eso no
 * es una animación, es una imagen inquieta.
 *
 * Lo escribe la IA junto con el capítulo, porque es quien acaba de inventar la
 * escena y sabe qué tiene dentro; también se puede escribir a mano o pedirle
 * que mire la foto y lo proponga.
 */
export interface PlanAnimacion {
  /** Qué se mueve, en una frase y en inglés. «the water ripples along the shore». */
  movimiento: string;
  /** Cuántas fotos en total, contando la que ya existe. */
  fotogramas: number;
  fps: number;
}

/**
 * Cuántos dibujos y a qué velocidad, según lo que se mueva.
 *
 * Son los dos números que más cambian el resultado y los que nadie sabe elegir
 * a ciegas: el fuego necesita muchos cuadros rápidos porque cambia de forma
 * entero, y una nube necesita pocos y lentos porque si va rápida parece
 * acelerada. Con el defecto único de 6 a 6 fps, el fuego salía a tirones y la
 * nube parecía un vídeo en avance rápido.
 */
export const FOTOGRAMAS_DEFECTO = 5;

export function normalizarPlanAnimacion(raw: unknown): PlanAnimacion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const movimiento = String(r.movimiento ?? "").trim().replace(/\s+/g, " ").slice(0, 400);
  if (movimiento.length < 4) return undefined;
  const f = Math.round(Number(r.fotogramas));
  const v = Math.round(Number(r.fps));
  return {
    movimiento,
    fotogramas: Number.isFinite(f)
      ? Math.max(MIN_FOTOS_LOOP, Math.min(MAX_FOTOS_LOOP, f))
      : FOTOGRAMAS_DEFECTO,
    fps: Number.isFinite(v) ? Math.max(1, Math.min(30, v)) : FPS_LOOP_DEFECTO,
  };
}

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
    // Los loops guardados ANTES de que existiera el vaivén no traen el campo, y
    // se benefician igual: por eso el defecto es sí, no no.
    vaiven: r.vaiven !== false,
  };
}

/**
 * Qué fotograma toca a los `t` segundos.
 *
 * En vaivén el ciclo dura `2n-2` pasos: sube 0…n-1 y baja n-2…1. Los extremos
 * NO se repiten —un cuadro congelado el doble de tiempo en cada punta se nota
 * como una pausa— y con n=2 sale exactamente lo mismo que alternar.
 */
export function indiceLoop(loop: LoopImagen, t: number): number {
  const n = loop.imageIds.length;
  if (n < 2) return 0;
  const paso = Math.floor(Math.max(0, t) * Math.max(0.1, loop.fps));
  if (!Number.isFinite(paso) || paso < 0) return 0;
  if (loop.vaiven === false) return paso % n;
  const ciclo = 2 * n - 2;
  const k = paso % ciclo;
  return k < n ? k : ciclo - k;
}

/** Lo que tarda una vuelta entera, en segundos. Con vaivén es casi el doble. */
export function duracionLoop(loop: LoopImagen): number {
  const n = loop.imageIds.length;
  if (n < 2) return 0;
  const pasos = loop.vaiven === false ? n : 2 * n - 2;
  return pasos / Math.max(0.1, loop.fps);
}

export function idLoopEn(loop: LoopImagen | undefined, t: number, respaldo: string): string {
  if (!loop || loop.imageIds.length < MIN_FOTOS_LOOP) return respaldo;
  return loop.imageIds[indiceLoop(loop, t)] || respaldo;
}

type EscenaConMedio = {
  medio?: string;
  capas?: { loop?: LoopImagen }[];
  loop?: LoopImagen;
};

/** El medio efectivo: lo que HAY montado, no lo que la IA apuntó. */
export function medioDe(sc: EscenaConMedio): MedioEscena {
  if (sc.capas && sc.capas.length > 0) return "paralaje";
  if (sc.loop && sc.loop.imageIds.length >= MIN_FOTOS_LOOP) return "apng";
  return "still";
}

export function idsDeLoopEscena(sc: Pick<EscenaConMedio, "loop" | "capas">): string[] {
  const ids: string[] = [];
  if (sc.loop) ids.push(...sc.loop.imageIds);
  for (const c of sc.capas ?? []) {
    if (c.loop) ids.push(...c.loop.imageIds);
  }
  return ids;
}
