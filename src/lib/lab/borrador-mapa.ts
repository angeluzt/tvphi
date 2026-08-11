/**
 * El mapa que estás escribiendo, guardado en el navegador.
 *
 * POR QUÉ. Este editor no guardaba NADA. Un «atrás» sin querer, un móvil que
 * descarga la pestaña o una recarga, y el mapa entero desaparecía —y como el
 * editor arrancaba con un ejemplo cargado de serie, el hueco lo llenaba una
 * escena que no era la tuya, así que ni siquiera parecía una pérdida: parecía
 * que tu trabajo se había convertido en otra cosa—.
 *
 * Se guarda el JSON TAL Y COMO ESTÁ ESCRITO, no solo la escena ya validada. Si
 * lo que hay a medio escribir todavía no es válido, tirarlo sería perder el
 * trabajo justo en el momento en que más duele.
 */

import { borrarBorrador, guardarBorrador, leerBorrador } from "./borradores";

const CLAVE = "mapa-actual";

export type BorradorMapa = {
  version: 1;
  guardadoEn: number;
  /** El contenido del cuadro de texto, válido o no. */
  texto: string;
  /** La última escena que sí se pudo leer, para no repintar desde cero. */
  escena?: unknown;
};

export const guardarBorradorMapa = (data: BorradorMapa) => guardarBorrador(CLAVE, data);
export const leerBorradorMapa = () => leerBorrador<BorradorMapa>(CLAVE);
export const borrarBorradorMapa = () => borrarBorrador(CLAVE);
