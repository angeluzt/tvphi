import type { EfectoEscena } from "@/lib/lab/efectos-escena";
import type { VfxLayer } from "@/lib/story/model";

// Traducir los efectos que escribe la IA al formato que guarda una escena.
//
// Son dos formas de decir lo mismo con distinta forma. El laboratorio guarda un
// efecto como UN sitio (`x, y`, y `x2, y2` si es una línea) más la distancia a
// la que está; una escena de historia guarda una capa de efecto con una LISTA
// de sitios, porque tres ramas ardiendo son tres nodos de la misma hoguera.
//
// Sin esta traducción, los efectos que la IA colocaba —y que se pagaban en la
// misma llamada que el mapa— se tiraban al guardar la escena, y el capítulo
// salía sin la lluvia ni el humo que se habían pedido.

/**
 * `follow` decide si el efecto se mueve con la imagen al mover la cámara.
 *
 * Lo que cae sobre todo el cuadro —lluvia, nieve, niebla— NO se ancla: se
 * quedaría pegado a un trozo de foto y viajaría con él, que es justo lo que no
 * hace la lluvia. Lo que está en un sitio concreto sí, o una hoguera se quedaría
 * flotando en el aire en cuanto la toma se desplaza.
 */
const SOBRE_EL_CUADRO = new Set(["lluvia", "nieve", "niebla", "polvo", "hojas", "ceniza", "burbujas"]);

export function efectoSigueALaImagen(kind: string, shape: string): boolean {
  if (shape === "arriba") return false;
  return !SOBRE_EL_CUADRO.has(kind);
}

/**
 * Un efecto del laboratorio, como capa de efecto de una escena.
 *
 * Los sitios van en espacio «imagen», no «encuadre»: la IA los sitúa sobre la
 * imagen entera («la ventana está al 72% del ancho»), sin saber cómo va a
 * quedar encuadrada la toma. Guardarlos como «encuadre» los movería en cuanto
 * alguien recortara la toma.
 */
export function aCapaVfx(e: EfectoEscena): VfxLayer {
  return {
    id: e.id,
    kind: e.kind,
    shape: e.shape,
    espacio: "imagen",
    nodes: [{
      x: acotar(e.x),
      y: acotar(e.y),
      // Un punto no tiene segundo extremo: se repite el primero, que es lo que
      // espera el motor para las formas de un solo sitio.
      x2: e.shape === "punto" ? acotar(e.x) : acotar(e.x2),
      y2: e.shape === "punto" ? acotar(e.y) : acotar(e.y2),
    }],
    follow: efectoSigueALaImagen(e.kind, e.shape),
    // No son «de serie»: los ha colocado la IA mirando el mapa, así que si
    // alguien añade uno a mano estos no deben desaparecer.
    auto: false,
    colorHex: e.colorHex,
    params: { ...e.params },
    timing: "all",
    startSec: 0,
    endSec: 0,
  };
}

const acotar = (v: number) => (Number.isFinite(v) ? Math.max(-0.5, Math.min(1.5, v)) : 0.5);

/** Todos los de una escena, saltándose lo ilegible en vez de tumbar el lote. */
export function capasVfxDeLaIa(efectos: unknown): VfxLayer[] {
  if (!Array.isArray(efectos)) return [];
  const fuera: VfxLayer[] = [];
  for (const e of efectos) {
    if (!e || typeof e !== "object") continue;
    const c = e as EfectoEscena;
    if (!c.kind || !c.shape) continue;
    try {
      fuera.push(aCapaVfx(c));
    } catch { /* uno malo no se lleva por delante a los demás */ }
  }
  return fuera;
}
