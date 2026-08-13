import {
  estadoNeutro, escalaPerspectiva, interpolarTramo, panPerspectiva, planificarCola,
  visibilidadPorAvance, type PasoSecuencia, type Tramo, type VistaCamara,
} from "@/lib/lab/anim-paralaje";
import type { MovCapa } from "@/lib/lab/movimiento-capa";
import type { SpriteEnCapa } from "@/lib/lab/sprite-capa";

// Llevar la escena del laboratorio al motor de historias.
//
// EL PROBLEMA. Había DOS dibujantes de paralaje. El del laboratorio sabe de
// movimiento por lámina, actores, cola de cámara y efectos; el del motor sabía
// estirar el recorte de cada lámina según su profundidad, y nada más. La IA
// escribía la escena entera —cámara, efectos, actores— y al guardarla en un
// capítulo se quedaba por el camino todo menos las imágenes y su profundidad.
// Se pagaba una escena viva y se guardaba una foto en capas.
//
// LO QUE HACE ESTE MÓDULO. Poner por escrito CUÁNDO una escena necesita el
// dibujante bueno, y resolver la cámara de la cola en un instante dado. Lo de
// pintar se queda donde estaba (`pintarCapas`): no se copia, se reutiliza.
//
// POR QUÉ NO SE MEZCLAN LAS DOS CÁMARAS. La toma de la historia tiene su propio
// encuadre —el zoom y el paneo de siempre— y la cola del laboratorio tiene el
// suyo. Fundirlos en una sola cuenta era el camino corto a un doble movimiento
// con signos cruzados. En vez de eso, la escena viva se pinta aparte, entera, y
// la toma la recorta como recorta una foto: cada cámara sigue haciendo lo suyo
// y ninguna tiene que saber de la otra.

/** Una lámina de una escena de historia, ya normalizada. */
export interface LaminaViva {
  id: string;
  imageId: string;
  nombre: string;
  depth: number;
  escala: number;
  opacidad: number;
  mov?: MovCapa;
  spr?: SpriteEnCapa;
}

/**
 * ¿Esta escena necesita el dibujante del laboratorio?
 *
 * Solo si tiene algo que el de siempre NO sabe pintar. Una escena de láminas
 * quietas se queda en el camino viejo a propósito: ahí el paralaje sale del
 * movimiento de la toma —el zoom y el paneo que ya usaba la gente— y cambiarlo
 * movería escenas que hoy se ven bien.
 */
export function escenaEstaViva(
  capas: { mov?: unknown; spr?: unknown }[] | undefined,
  camara: unknown[] | undefined,
): boolean {
  if (Array.isArray(camara) && camara.length > 0) return true;
  return (capas ?? []).some((c) => !!c.mov || !!c.spr);
}

/** Cuánto dura la cola entera, en milisegundos. */
export function duracionTramos(tramos: Tramo[]): number {
  return tramos.reduce((s, t) => s + t.durMs, 0);
}

/**
 * Planifica la cola una vez. Es cara —recorre todos los pasos— y no depende
 * del tiempo, así que quien pinta la guarda y no la rehace en cada fotograma.
 */
export function planDeEscena(
  camara: PasoSecuencia[],
  capas: { id: string; depth: number }[],
  fuerzaPct = 55,
): Tramo[] {
  if (!camara.length) return [];
  return planificarCola(camara, fuerzaPct, capas, estadoNeutro());
}

/** La cámara neutra: ni zoom, ni paneo, ni fundidos. */
export function vistaQuieta(): VistaCamara {
  const e = estadoNeutro();
  return {
    ox: e.ox, oy: e.oy, zoom: e.zoom,
    zoomCapa: (depth) => escalaPerspectiva(e.avance, depth),
    panCapa: (depth) => panPerspectiva(e.avance, depth),
    alphaCapa: (depth) => visibilidadPorAvance(e.avance, depth),
    t: 1, fin: true,
  };
}

/**
 * Dónde está la cámara de la cola en este instante.
 *
 * Pasado el final SE QUEDA QUIETA en el último fotograma, no vuelve a empezar.
 * Una toma puede durar más que la animación que le escribieron; repetir el
 * movimiento en bucle haría que el capítulo diera tirones cada pocos segundos
 * sin que nadie lo hubiera pedido.
 */
export function vistaEnTiempo(
  tramos: Tramo[],
  ms: number,
  capas: { id: string; depth: number }[],
): VistaCamara {
  if (!tramos.length) return vistaQuieta();
  let resto = Math.max(0, ms);
  for (const tramo of tramos) {
    if (resto < tramo.durMs) return interpolarTramo(tramo, resto, capas).vista;
    resto -= tramo.durMs;
  }
  const ultimo = tramos[tramos.length - 1];
  return interpolarTramo(ultimo, ultimo.durMs, capas).vista;
}
