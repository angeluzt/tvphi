/** Borrador del montaje en IndexedDB para no perder trabajo al recargar. */

import { borrarBorrador, guardarBorrador, leerBorrador } from "./borradores";

const CLAVE = "montaje-actual";

export type BorradorMontaje = {
  version: 1;
  guardadoEn: number;
  width: number;
  height: number;
  /** data URL PNG por capa, en orden de pintar. */
  capas: {
    clave: string;
    nombre: string;
    depth: number;
    escala: number;
    opacidad: number;
    bloqueada?: boolean;
    via?: "transparente" | "croma" | "opaca";
    vacio?: number;
    mov?: unknown;
    /** Colocación a mano: empujón, giro, tamaño y centro de la pieza. */
    ajuste?: unknown;
    spr?: unknown;
    dataUrl: string;
    /** Tiras de las animaciones ligadas, por clave, también como data URL. */
    tiras?: Record<string, string>;
  }[];
  escena?: unknown;
  cola?: unknown[];
  /**
   * Los efectos del motor colgados de la escena.
   *
   * Faltaban. El montaje se recuperaba con sus capas, su mapa y su cámara, y el
   * fuego y la lluvia se quedaban por el camino sin que nada lo dijera: se leía
   * «recuperado» y había que volver a colocarlos uno a uno. El ZIP sí los
   * llevaba desde el principio, así que era además una incoherencia entre las
   * dos formas de guardar lo mismo.
   */
  efectos?: unknown[];
};

export const guardarBorradorMontaje = (data: BorradorMontaje) => guardarBorrador(CLAVE, data);
export const leerBorradorMontaje = () => leerBorrador<BorradorMontaje>(CLAVE);
export const borrarBorradorMontaje = () => borrarBorrador(CLAVE);

export function imgADataUrl(img: HTMLImageElement): Promise<string> {
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth || img.width;
  cv.height = img.naturalHeight || img.height;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return Promise.resolve(cv.toDataURL("image/png"));
}
