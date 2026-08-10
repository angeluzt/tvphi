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
  actualizadoEn: string;
  animaciones: AnimacionPersonajeSprite[];
}

export interface ProyectoAnimacionSprite extends AnimacionPersonajeSprite {
  personajeId: string;
  personajeNombre: string;
  croma: string;
  anchoHoja: number;
  altoHoja: number;
  celdas: CeldaSprite[];
  hojaOriginal: string;
  hojaTrabajo: string;
  tira: string;
}
