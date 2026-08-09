import type { AccionSprite, AnclajeSprite, DireccionSprite, VistaSprite } from "./biblioteca";
import type { CeldaSprite } from "./sprites";
export interface AnimacionPersonajeSprite { id:string; nombre:string; que:string; fotogramas:number; fps:number;
 vista:VistaSprite; direccion:DireccionSprite; accion:AccionSprite; anclaje:AnclajeSprite; ancho:number; alto:number;
 columnas:number; filas:number; bytes:number; actualizadoEn:string; tiraUrl:string; }
export interface PersonajeSprite { id:string; nombre:string; descripcion:string; actualizadoEn:string; animaciones:AnimacionPersonajeSprite[]; }
export interface ProyectoAnimacionSprite extends AnimacionPersonajeSprite { personajeId:string; personajeNombre:string; croma:string;
 anchoHoja:number; altoHoja:number; celdas:CeldaSprite[]; hojaOriginal:string; hojaTrabajo:string; tira:string; }
