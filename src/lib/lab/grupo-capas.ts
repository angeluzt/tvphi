// Trabajar con VARIAS capas a la vez.
//
// QUÉ FALTABA. Todo el montaje estaba pensado para una capa cada vez: eliges
// una, la animas, eliges la siguiente. Para un paralaje eso es justo lo
// contrario de lo que se necesita, porque el paralaje NO es una propiedad de
// una capa —es la relación entre varias—. Poner cinco capas escalonadas a mano
// significa teclear cinco profundidades, mirar, y volver a teclearlas todas
// porque la tercera se ve pegada a la segunda.
//
// Y «aplicar a todas» tampoco servía: casi nunca se quiere a TODAS. Se quiere
// a los tres árboles del frente, y que el cielo y el suelo se queden quietos.
//
// LAS DOS OPERACIONES QUE IMPORTAN, y son opuestas:
//   · SEPARARSE  → profundidades escalonadas: cada capa se mueve distinto y
//                  aparece la sensación de profundidad.
//   · IR JUNTAS  → la misma profundidad para todas: se comportan como si
//                  fueran un solo dibujo, que es lo que se quiere cuando un
//                  personaje y su sombra tienen que quedarse pegados.
//
// Aquí solo está la aritmética, sin React ni canvas, porque es donde se cuelan
// los errores de un píxel y donde una prueba vale de algo.

import { normalizarMov, type MovCapa } from "./movimiento-capa";

const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Profundidades repartidas entre `desde` y `hasta`, en el orden recibido.
 *
 * El orden que llega es el de la pila de capas: la primera es la de más atrás.
 * Con una sola capa no hay reparto que hacer y se le da `desde`, que es el
 * extremo «fondo»: es menos sorprendente que dejarla en el medio.
 */
export function profundidadesEscalonadas(
  ids: string[],
  desde: number,
  hasta: number,
): Map<string, number> {
  const a = acotar(desde, 0, 1);
  const b = acotar(hasta, 0, 1);
  const m = new Map<string, number>();
  if (ids.length === 1) {
    m.set(ids[0], redondear(a));
    return m;
  }
  ids.forEach((id, i) => {
    m.set(id, redondear(a + ((b - a) * i) / (ids.length - 1)));
  });
  return m;
}

/**
 * Desfases repartidos por el ciclo, para que las capas no se mezan a la vez.
 *
 * Cinco capas con el mismo vaivén y el mismo desfase no parecen cinco cosas
 * vivas: parecen una sola imagen temblando. Se reparte el ciclo completo entre
 * ellas —0, 1/n, 2/n…— porque cualquier separación regular sirve y esta además
 * es estable: la misma selección da siempre los mismos números.
 */
export function desfasesDelGrupo(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  ids.forEach((id, i) => m.set(id, redondear(i / Math.max(1, ids.length))));
  return m;
}

/** Los tipos que se mecen en ciclo y que por tanto conviene desfasar. */
export const ES_CICLICO = (t: MovCapa["tipo"] | undefined) =>
  t === "flotar" || t === "vaiven" || t === "pulso";

/**
 * La animación de una capa, copiada al resto del grupo.
 *
 * `desfasar` solo hace algo con los movimientos cíclicos: desfasar una ruta o
 * una deriva no significa nada —no tienen ciclo que correr— y meter el campo
 * ahí solo sería ruido en el proyecto guardado.
 */
export function movimientoParaGrupo(
  origen: MovCapa,
  ids: string[],
  opts: { desfasar?: boolean } = {},
): Map<string, MovCapa | undefined> {
  const desfases = opts.desfasar && ES_CICLICO(origen.tipo)
    ? desfasesDelGrupo(ids)
    : null;
  const m = new Map<string, MovCapa | undefined>();
  for (const id of ids) {
    m.set(id, normalizarMov({
      ...origen,
      ...(desfases ? { desfase: desfases.get(id) } : {}),
    }));
  }
  return m;
}

export interface CapaSeleccionable {
  id: string;
  bloqueada?: boolean;
}

/**
 * Reparte una selección entre las que se pueden tocar y las que no.
 *
 * El candado tiene que ganar SIEMPRE, también en bloque: si «aplicar al grupo»
 * pasara por encima del bloqueo, el candado dejaría de significar nada y la
 * única forma de proteger una capa sería no seleccionarla nunca. Y como aquí
 * se seleccionan muchas de golpe, eso es exactamente lo que pasaría.
 */
export function repartirPorCandado<T extends CapaSeleccionable>(
  capas: T[],
  seleccion: readonly string[],
): { destino: T[]; bloqueadas: T[] } {
  const dentro = capas.filter((c) => seleccion.includes(c.id));
  return {
    destino: dentro.filter((c) => !c.bloqueada),
    bloqueadas: dentro.filter((c) => c.bloqueada),
  };
}

/** El aviso de lo que se acaba de hacer, con las bloqueadas contadas aparte. */
export function resumenDelGrupo(hechas: number, bloqueadas: number, accion: string): string {
  if (!hechas) {
    return bloqueadas
      ? `Las ${bloqueadas} capas del grupo están bloqueadas: quita el candado para ${accion}.`
      : "No hay capas en el grupo.";
  }
  return `${accion[0].toUpperCase()}${accion.slice(1)} en ${hechas} capa${hechas === 1 ? "" : "s"}`
    + (bloqueadas ? ` · ${bloqueadas} bloqueada${bloqueadas === 1 ? "" : "s"}, sin tocar` : "")
    + ".";
}
