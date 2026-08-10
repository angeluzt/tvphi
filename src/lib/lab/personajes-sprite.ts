import type { AccionSprite, AnclajeSprite, DireccionSprite, VistaSprite } from "./biblioteca";
import type { CeldaSprite } from "./sprites";

export interface AnimacionPersonajeSprite {
  id: string;
  nombre: string;
  que: string;
  fotogramas: number;
  fps: number;
  vista: VistaSprite;
  direccion: DireccionSprite;
  accion: AccionSprite;
  anclaje: AnclajeSprite;
  ancho: number;
  alto: number;
  columnas: number;
  filas: number;
  bytes: number;
  actualizadoEn: string;
  tiraUrl: string;
}

/** Personaje del taller de sprites (no ficha de Historias). */
export interface PersonajeSprite {
  id: string;
  spriteId: string | null;
  /** Siempre null: las fichas de Historias ya no se mezclan aquí. */
  storyCharacterId: null;
  origen: "sprites";
  nombre: string;
  descripcion: string;
  prompt: string;
  /**
   * Lo que ocupa en total: su miniatura de referencia MÁS sus animaciones.
   *
   * Se enseña porque un personaje sin animaciones NO pesa cero —conserva su
   * referencia— y «0 animaciones» se lee como «no ocupa nada». Con el tope de
   * 120 MB por cuenta, eso es espacio que desaparece sin explicación.
   */
  bytes: number;
  actualizadoEn: string;
  animaciones: AnimacionPersonajeSprite[];
}

/**
 * De dónde se baja cada imagen de una animación.
 *
 * Un solo sitio que arma la URL: el nombre del parámetro se comprueba contra
 * una lista cerrada en el servidor, así que aquí basta con no inventárselo.
 */
export const urlImagenAnimacion = (id: string, que: "original" | "trabajo" | "tira") =>
  `/api/story/sprite-characters/animations/${id}/image?que=${que}`;

/**
 * El proyecto editable de una animación.
 *
 * Las imágenes viajan como URL, no como base64: las tres juntas en el JSON eran
 * varios megas por respuesta. Se piden en paralelo y el navegador las cachea.
 */
export interface ProyectoAnimacionSprite extends AnimacionPersonajeSprite {
  personajeId: string;
  personajeNombre: string;
  croma: string;
  anchoHoja: number;
  altoHoja: number;
  celdas: CeldaSprite[];
  hojaOriginalUrl: string;
  hojaTrabajoUrl: string;
}
