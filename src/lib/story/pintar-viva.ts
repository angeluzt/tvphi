import { pintarCapas, type CapaPintable } from "@/lib/lab/pintar-escena";
import { normalizarMov } from "@/lib/lab/movimiento-capa";
import { normalizarSprite } from "@/lib/lab/sprite-capa";
import { normalizarAjuste } from "@/lib/lab/ajuste-capa";
import { planDeEscena, vistaEnTiempo, vistaQuieta } from "@/lib/lab/escena-viva";
import { pasoPorDefecto, type PasoSecuencia, type Tramo } from "@/lib/lab/anim-paralaje";
import { indiceLoop, type LoopImagen } from "@/lib/story/medio";
import type { EscenaCapa, StoryScene } from "@/lib/story/model";

// Pintar una escena VIVA para el motor de historias.
//
// Reutiliza el dibujante del laboratorio (`pintarCapas`) tal cual. Que hubiera
// dos dibujantes es justo lo que hacía que una escena guardada desde el
// laboratorio se viera distinta —y más pobre— dentro de un capítulo.
//
// La escena se pinta ENTERA en un lienzo aparte, del tamaño de la imagen, y el
// motor la recorta después con el encuadre de la toma exactamente igual que
// recorta una foto. Así la cámara de la toma y la de la escena no tienen que
// saber la una de la otra: fundir las dos en una sola cuenta era el camino
// corto a un doble movimiento con los signos cruzados.

/** Convierte las láminas guardadas en algo que el dibujante entienda. */
export function laminasPintables(
  capas: EscenaCapa[],
  imagen: (id: string) => HTMLImageElement | undefined,
): CapaPintable[] {
  const fuera: CapaPintable[] = [];
  for (const c of capas) {
    const img = imagen(c.imageId);
    if (!img || !img.complete || !img.naturalWidth) continue;
    fuera.push({
      id: c.id,
      nombre: c.nombre,
      img,
      depth: Math.max(0, Math.min(1, c.depth)),
      visible: true,
      escala: Math.max(0.05, c.escala || 1),
      opacidad: Math.max(0, Math.min(1, c.opacidad ?? 1)),
      mov: normalizarMov(c.mov),
      ajuste: normalizarAjuste(c.ajuste),
      spr: normalizarSprite(c.spr),
      loop: loopPintable(c.loop, imagen),
    });
  }
  return fuera;
}

function loopPintable(
  loop: LoopImagen | undefined,
  imagen: (id: string) => HTMLImageElement | undefined,
): CapaPintable["loop"] {
  if (!loop || loop.imageIds.length < 2) return undefined;
  const imgs = loop.imageIds
    .map((id) => imagen(id))
    .filter((im): im is HTMLImageElement => !!im && im.complete && im.naturalWidth > 0);
  if (imgs.length < 2) return undefined;
  return { imgs, fps: loop.fps };
}

function capaEnTiempo(c: CapaPintable, segundos: number): CapaPintable {
  if (!c.loop || c.loop.imgs.length < 2) return c;
  const i = indiceLoop(
    { imageIds: c.loop.imgs.map((_, n) => String(n)), fps: c.loop.fps },
    segundos,
  );
  const img = c.loop.imgs[i];
  return img && img.complete && img.naturalWidth ? { ...c, img } : c;
}

/** La cola guardada, saneada. Un paso corrupto no debe tumbar el capítulo. */
export function colaDeEscena(camara: unknown[] | undefined): PasoSecuencia[] {
  if (!Array.isArray(camara)) return [];
  const fuera: PasoSecuencia[] = [];
  camara.forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    try {
      fuera.push(pasoPorDefecto({ ...(p as Partial<PasoSecuencia>), id: `esc${i}` }));
    } catch { /* un paso ilegible se salta; el resto de la cola sigue valiendo */ }
  });
  return fuera;
}

/**
 * El pintor de escenas vivas del motor.
 *
 * Guarda el lienzo aparte y la cola ya planificada POR ESCENA: planificar
 * recorre la cola entera y no depende del tiempo, así que hacerlo en cada
 * fotograma sería repetir el mismo trabajo sesenta veces por segundo.
 */
export class PintorEscenaViva {
  private lienzo: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private planes = new Map<string, { tramos: Tramo[]; capas: { id: string; depth: number }[] }>();

  /** Olvida lo planificado de una escena que ha cambiado. */
  invalidar(sceneId?: string) {
    if (sceneId) this.planes.delete(sceneId);
    else this.planes.clear();
  }

  private plan(scene: StoryScene, capas: CapaPintable[]) {
    const guardado = this.planes.get(scene.id);
    if (guardado) return guardado;
    const meta = capas.map((c) => ({ id: c.id, depth: c.depth }));
    const nuevo = { tramos: planDeEscena(colaDeEscena(scene.camara), meta), capas: meta };
    this.planes.set(scene.id, nuevo);
    return nuevo;
  }

  /**
   * Pinta la escena en su lienzo y lo devuelve, listo para recortar.
   *
   * `null` si no hay nada que pintar todavía —imágenes sin cargar—, para que
   * quien llame se caiga al camino de siempre en vez de enseñar un cuadro
   * negro mientras llegan.
   */
  dibujar(
    scene: StoryScene,
    capas: CapaPintable[],
    segundos: number,
    ancho: number,
    alto: number,
  ): HTMLCanvasElement | null {
    if (!capas.length || ancho < 1 || alto < 1) return null;
    if (!this.lienzo) {
      this.lienzo = document.createElement("canvas");
      this.ctx = this.lienzo.getContext("2d");
    }
    const c = this.ctx;
    if (!c || !this.lienzo) return null;
    if (this.lienzo.width !== ancho || this.lienzo.height !== alto) {
      this.lienzo.width = ancho;
      this.lienzo.height = alto;
    }
    c.clearRect(0, 0, ancho, alto);

    const { tramos, capas: meta } = this.plan(scene, capas);
    const vista = tramos.length
      ? vistaEnTiempo(tramos, segundos * 1000, meta)
      : vistaQuieta();

    pintarCapas(c, {
      capas: capas.map((x) => capaEnTiempo(x, segundos)),
      vista,
      w: ancho,
      h: alto,
      // El fondo es la primera lámina que no sea un actor: es la única opaca, y
      // la que hay que agrandar para que el paneo no destape el canto.
      idFondo: capas.find((x) => !x.spr)?.id,
      // La guía de ruta es una ayuda para colocar, no parte de la escena: en un
      // capítulo exportado no pinta nada.
      rutaVisibleId: null,
      // Todas las láminas comparten el reloj de la toma. Aquí no hay «pausar
      // este sprite y no aquel»: eso es del taller, no del vídeo final.
      tiempoDeCapa: () => segundos,
    });
    return this.lienzo;
  }
}
