// Crear y recorrer a mano lo que hasta ahora solo podía escribir la IA.
//
// LO QUE FALTABA. El mapa se podía mover, estirar, duplicar y borrar, pero no
// CREAR: si la IA no puso un arco, no había forma de añadirlo. Y para llegar a
// una forma concreta solo se podía cazarla con el dedo en el lienzo, que con
// dieciocho formas amontonadas es una lotería —las de detrás son inalcanzables
// porque siempre coge la de delante—.
//
// Aquí está la parte que decide QUÉ pasa. Lo de pintarlo va aparte.

import type { Capa, Escena, Objeto } from "./escena";
import { cajaDeObjeto, idLibre } from "./geometria-mapa";

/** Las etiquetas que la IA entiende, con un nombre en cristiano. */
export const SEMANTICAS = [
  ["sky", "Cielo"], ["terrain", "Terreno"], ["wall", "Muro"], ["floor", "Suelo"],
  ["door", "Puerta"], ["window", "Ventana"], ["column", "Columna"], ["arch", "Arco"],
  ["stairs", "Escalera"], ["vegetation", "Vegetación"], ["water", "Agua"],
  ["subject", "Personaje (reserva)"], ["prop", "Objeto"], ["light_anchor", "Foco de luz"],
  ["vfx_zone", "Zona de efecto"], ["negative_space", "Vacío"],
] as const;

/**
 * Una forma nueva, en el centro y de un tamaño que se ve.
 *
 * Nace GRANDE (un tercio del ancho) a propósito: una forma diminuta en el
 * centro de un mapa lleno no se encuentra, y lo primero que hace cualquiera
 * después de crearla es agrandarla. Es más fácil encoger que buscar.
 */
export function formaNueva(esc: Escena, semantic: string, etiqueta?: string): Objeto {
  return {
    id: idLibre(esc, semantic),
    shape: "rect",
    semantic,
    x: 0.33,
    y: 0.33,
    w: 0.34,
    h: 0.34,
    label: (etiqueta ?? nombreDe(semantic)).toUpperCase(),
  } as Objeto;
}

export const nombreDe = (semantic: string) =>
  SEMANTICAS.find(([id]) => id === semantic)?.[1] ?? semantic;

/** Mete la forma en esa capa. Si la capa no existe, devuelve la escena igual. */
export function anadirForma(esc: Escena, capaId: string, o: Objeto): Escena {
  if (!esc.layers.some((c) => c.id === capaId)) return esc;
  return {
    ...esc,
    layers: esc.layers.map((c) =>
      c.id === capaId ? { ...c, objects: [...(c.objects ?? []), o] } : c),
  };
}

/**
 * Una capa nueva, delante de todas.
 *
 * Va delante y no detrás porque la primera capa es EL FONDO —opaca y a pantalla
 * completa— y una capa nueva metida ahí taparía la escena entera. Su
 * profundidad se pone a medio camino entre la última y el frente, que es donde
 * casi siempre se quiere: lo que se añade a mano suele ser primer plano.
 */
export function anadirCapa(esc: Escena, nombre?: string): { escena: Escena; capaId: string } {
  const ultima = esc.layers[esc.layers.length - 1];
  const depth = Math.min(0.98, ((ultima?.depth ?? 0.5) + 1) / 2);
  const n = esc.layers.length + 1;
  const capa: Capa = {
    id: idLibre(esc, "capa"),
    name: `${String(n).padStart(2, "0")} Capa ${n}`,
    depth,
    ai: { prompt: "", exclude: "" },
    objects: [],
  } as Capa;
  return { escena: { ...esc, layers: [...esc.layers, capa] }, capaId: capa.id };
}

/** Todas las formas, en el orden en que se recorren: de atrás hacia delante. */
export function formasEnOrden(esc: Escena): { capaId: string; objetoId: string }[] {
  const out: { capaId: string; objetoId: string }[] = [];
  for (const c of esc.layers) {
    for (const o of c.objects ?? []) out.push({ capaId: c.id, objetoId: o.id });
  }
  return out;
}

/**
 * La forma siguiente o anterior, dando la vuelta al llegar al final.
 *
 * Da la vuelta a propósito: con dieciocho formas, llegar a la última y que el
 * botón deje de responder se siente roto. Y sin nada seleccionado, «siguiente»
 * coge la primera en vez de no hacer nada.
 */
export function recorrerFormas(
  esc: Escena,
  actual: { capaId: string; objetoId: string } | null,
  dir: -1 | 1,
): { capaId: string; objetoId: string } | null {
  const todas = formasEnOrden(esc);
  if (!todas.length) return null;
  if (!actual) return dir > 0 ? todas[0] : todas[todas.length - 1];
  const i = todas.findIndex((f) => f.capaId === actual.capaId && f.objetoId === actual.objetoId);
  if (i < 0) return todas[0];
  return todas[(i + dir + todas.length) % todas.length];
}

/** En qué puesto va, para poder decir «7 de 18». */
export function puestoDe(
  esc: Escena,
  actual: { capaId: string; objetoId: string } | null,
): { i: number; total: number } {
  const todas = formasEnOrden(esc);
  if (!actual) return { i: 0, total: todas.length };
  const i = todas.findIndex((f) => f.capaId === actual.capaId && f.objetoId === actual.objetoId);
  return { i: i < 0 ? 0 : i + 1, total: todas.length };
}

/**
 * Si esa capa se puede tocar ahora mismo.
 *
 * Con una capa aislada, las demás se ven pero NO se cogen. Sin esto, aislar
 * servía para mirar y aun así el dedo agarraba una forma de otra capa que
 * estaba encima, que es exactamente lo que se quería evitar.
 */
export function capaEditable(capaId: string, aislada: string | null, bloqueado: boolean): boolean {
  if (bloqueado) return false;
  return !aislada || aislada === capaId;
}

/** El centro de una forma, para poder llevar la vista hasta ella. */
export function centroDeObjeto(o: Objeto): { x: number; y: number } {
  const c = cajaDeObjeto(o);
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}
