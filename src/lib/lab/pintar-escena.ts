import {
  cajaSprite, estadoSpriteEn, fotogramaEn, pintarSprite, spriteSigueCamara,
  type Plano, type SpriteEnCapa,
} from "@/lib/lab/sprite-capa";
import { copiarPlanoBucle, moverPlano, planoCentrado } from "@/lib/lab/plano-movimiento";
import { desplazamientoCapa, type MovCapa } from "@/lib/lab/movimiento-capa";
import type { VistaCamara } from "@/lib/lab/anim-paralaje";

// Pintar la escena: capas, sprites y sus copias de bucle.
//
// POR QUÉ VIVE FUERA DEL COMPOSITOR. No por el tamaño del archivo, sino porque
// había DOS dibujantes. La vista previa pintaba aquí y «Montaje PNG» tenía su
// propia copia, más simple, dentro de `exportarPng`. Y las copias se separan:
// la del PNG se quedó sin efectos, sin el movimiento propio de las capas y sin
// la posición de la cámara, así que exportabas una imagen que no era la que
// estabas viendo. Con un solo dibujante eso no puede volver a pasar.
//
// LO QUE NO ESTÁ AQUÍ, a propósito: la máquina de estados de la cámara. Esa
// consume el tiempo, cruza las junturas entre pasos y avisa a React de por
// dónde va —cuatro `set…` y trece refs—. Traerla aquí serían diecisiete
// parámetros y el mismo acoplamiento con peor firma. Se queda donde está y
// aquí llega ya resuelta, en `vista`.

/** Una capa lista para pintar. Es lo que el compositor tiene en memoria. */
export interface CapaPintable {
  id: string;
  clave?: string;
  nombre: string;
  img: HTMLImageElement;
  depth: number;
  visible: boolean;
  escala: number;
  opacidad: number;
  mov?: MovCapa;
  spr?: SpriteEnCapa;
}

export interface OpcionesPintado {
  capas: CapaPintable[];
  /** La cámara YA resuelta para este fotograma. */
  vista: VistaCamara;
  /** Tamaño del lienzo en píxeles. */
  w: number;
  h: number;
  /** Segundos de animación de cada capa. Distintos por capa: cada una tiene su reloj. */
  tiempoDeCapa: (capa: CapaPintable) => number;
  /** Qué capa hace de fondo opaco, si alguna. */
  idFondo?: string;
  /** De qué sprite hay que devolver la guía de ruta para dibujarla luego. */
  rutaVisibleId?: string | null;
}

/** Lo que hace falta para pintar la guía de ruta encima, si se quiere. */
export interface GuiaRuta {
  spr: SpriteEnCapa;
  plano: Plano;
  tiempo: number;
}

/**
 * Pinta las capas en orden. Devuelve la guía de ruta del sprite marcado, si
 * lo hay, para que quien llame decida si la dibuja —la vista previa sí, el
 * PNG exportado no—.
 */
export function pintarCapas(
  c: CanvasRenderingContext2D,
  o: OpcionesPintado,
): GuiaRuta | null {
  const { capas, vista, w, h, idFondo, rutaVisibleId } = o;
  let guiaRuta: GuiaRuta | null = null;

  for (const capa of capas) {
    if (!capa.visible) continue;
    // El movimiento propio siempre usa coordenadas del lienzo. Para sprites
    // «pantalla» este es TODO su movimiento; para el resto se suma después
    // al paneo y al zoom de cámara.
    const tiempo = o.tiempoDeCapa(capa);
    const propio = desplazamientoCapa(capa.mov, tiempo);

    if (capa.spr && !spriteSigueCamara(capa.spr)) {
      // Plano fijo del lienzo: no usa vista.ox, vista.zoom, profundidad ni
      // alphaCapa. Así una transición de cámara no dobla la trayectoria A→B
      // ni hace desaparecer al sprite. Zoom y opacidad manuales sí mandan.
      const af = capa.img.naturalWidth / capa.spr.fotogramas;
      const hf = capa.img.naturalHeight;
      const i = fotogramaEn(capa.spr, tiempo);
      const estado = estadoSpriteEn(capa.spr, tiempo);
      const spr = {
        ...capa.spr,
        alto: capa.spr.alto * capa.escala * propio.escala,
        espejo: estado.espejo,
      };
      const plano = { x0: propio.dx * w, y0: propio.dy * h, w, h };
      c.save();
      c.globalAlpha = capa.opacidad;
      pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, plano, tiempo));
      if (propio.repetir) {
        if (capa.mov?.x) {
          const p2 = { ...plano, x0: plano.x0 - Math.sign(capa.mov.x) * 2 * w };
          pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
        }
        if (capa.mov?.y) {
          const p2 = { ...plano, y0: plano.y0 - Math.sign(capa.mov.y) * 2 * h };
          pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
        }
      }
      c.restore();
      if (rutaVisibleId === capa.id) guiaRuta = { spr, plano, tiempo };
      continue;
    }

    // Una capa normal también puede ser una sobreimpresión absoluta. En ese
    // caso ignora por completo paneo, profundidad, zoom y fades de cámara;
    // es el equivalente real de un sprite anclado al lienzo.
    if (!capa.spr && capa.mov?.espacio === "pantalla") {
      const base = planoCentrado({
        lienzoW: w, lienzoH: h, escala: capa.escala * propio.escala,
      });
      const plano = moverPlano(base, propio, "pantalla", w, h);
      c.save();
      c.globalAlpha = capa.opacidad;
      c.drawImage(capa.img, plano.x0, plano.y0, plano.w, plano.h);
      if (propio.repetir) {
        const copias = copiarPlanoBucle(plano, capa.mov, "pantalla", w, h);
        if (copias.horizontal) c.drawImage(capa.img, copias.horizontal.x0, copias.horizontal.y0, copias.horizontal.w, copias.horizontal.h);
        if (copias.vertical) c.drawImage(capa.img, copias.vertical.x0, copias.vertical.y0, copias.vertical.w, copias.vertical.h);
      }
      c.restore();
      continue;
    }

    const referencia = capa.mov?.referenciaCapaId
      ? capas.find((otra) => otra.clave === capa.mov?.referenciaCapaId)
      : undefined;
    const depth = referencia?.depth ?? capa.depth;
    let e = capa.escala * vista.zoom * vista.zoomCapa(depth);
    // El paneo también va con la perspectiva: de cerca, el mismo movimiento
    // de cámara barre mucho más cuadro. Sin esto, al acercarse el paralaje se
    // queda corto y la escena vuelve a parecer plana.
    const pan = vista.panCapa(depth);
    if (capa.id === idFondo) {
      // El fondo es el único opaco: si se desplaza o se queda por debajo del
      // cuadro, asoma el negro por el canto. Se le da justo el margen que
      // necesita para el paneo de este fotograma —(e−1)/2 tiene que cubrir el
      // desplazamiento— así que ni se ve el negro ni se agranda de más.
      const holgura = 1 + 2 * Math.max(Math.abs(vista.ox * pan), Math.abs(vista.oy * pan));
      e = Math.max(e, holgura);
    }
    e *= propio.escala;
    const base = planoCentrado({
      lienzoW: w, lienzoH: h, escala: e,
      ox: vista.ox, oy: vista.oy, pan,
    });
    // Este es el arreglo del tren: el movimiento se aplica EN EL PLANO ya
    // transformado, no como píxeles añadidos al final. Si la cámara duplica
    // la vía, también duplica exactamente el recorrido del tren.
    const planoCapa = moverPlano(base, propio, "capa", w, h);
    const { x0, y0, w: dw, h: dh } = planoCapa;
    c.save();
    c.globalAlpha = capa.opacidad * vista.alphaCapa(depth, capa.id);

    if (capa.spr) {
      // Este es el modo opcional «seguir cámara»: el sprite vive dentro del
      // plano transformado y por eso sí hereda paralaje, zoom y fundidos.
      const af = capa.img.naturalWidth / capa.spr.fotogramas;
      const hf = capa.img.naturalHeight;
      const i = fotogramaEn(capa.spr, tiempo);
      const estado = estadoSpriteEn(capa.spr, tiempo);
      const spr = { ...capa.spr, espejo: estado.espejo };
      const plano = { x0, y0, w: dw, h: dh };
      pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, plano, tiempo));
      if (propio.repetir) {
        const copias = copiarPlanoBucle(plano, capa.mov!, "capa", w, h);
        if (copias.horizontal) pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, copias.horizontal, tiempo));
        if (copias.vertical) pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, copias.vertical, tiempo));
      }
      c.restore();
      if (rutaVisibleId === capa.id) guiaRuta = { spr, plano, tiempo };
      continue;
    }

    c.drawImage(capa.img, x0, y0, dw, dh);
    // Con bucle se pinta una segunda copia a un cuadro de distancia: es lo
    // que evita el hueco negro mientras la primera termina de salir.
    if (propio.repetir) {
      const copias = copiarPlanoBucle(planoCapa, capa.mov!, "capa", w, h);
      if (copias.horizontal) c.drawImage(capa.img, copias.horizontal.x0, copias.horizontal.y0, copias.horizontal.w, copias.horizontal.h);
      if (copias.vertical) c.drawImage(capa.img, copias.vertical.x0, copias.vertical.y0, copias.vertical.w, copias.vertical.h);
    }
    c.restore();
  }

  return guiaRuta;
}
