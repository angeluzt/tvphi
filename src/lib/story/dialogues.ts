// Exportar e importar los TEXTOS de la narración en un JSON sencillo, pensado
// para poder pasárselo a una IA (o abrirlo en cualquier editor), corregir la
// redacción y devolverlo al proyecto.
//
// El archivo solo lleva textos: ni imágenes, ni audios, ni ajustes. Al volver a
// importarlo, los diálogos que cambiaron quedan MARCADOS (stale) — conservan su
// audio antiguo para poder seguir viendo el video, pero avisan de que hay que
// regenerar la voz, y hay un botón para regenerar de golpe solo esos.

import { VOICE_EFFECTS, type StoryProject, type VoiceEffect } from "./model";

export const DIALOGUE_FILE_KIND = "tvphi.dialogos";
export const DIALOGUE_FILE_VERSION = 1;

export interface DialogueRow {
  id: string;
  escena: number;
  toma: number;
  orden: number;
  texto: string;
  efecto: VoiceEffect;
  modificado: boolean;
}

export interface DialogueFile {
  tvphi: string;
  version: number;
  proyecto: string;
  instrucciones: string;
  efectosDisponibles: string[];
  dialogos: DialogueRow[];
}

export function exportDialogues(project: StoryProject, projectName: string): DialogueFile {
  const dialogos: DialogueRow[] = [];
  project.scenes.forEach((sc, si) => {
    sc.shots.forEach((sh, ti) => {
      sh.dialogues.forEach((d, di) => {
        dialogos.push({
          id: d.id,
          escena: si + 1,
          toma: ti + 1,
          orden: di + 1,
          texto: d.text,
          efecto: d.effect,
          modificado: d.stale,
        });
      });
    });
  });
  return {
    tvphi: DIALOGUE_FILE_KIND,
    version: DIALOGUE_FILE_VERSION,
    proyecto: projectName,
    instrucciones:
      'Edita el campo "texto" (y si quieres, "efecto"). Marca "modificado": true en los que cambies. ' +
      'No cambies ni quites el campo "id": es lo que empareja cada texto con su sitio en el video. ' +
      "Puedes dejar fuera los diálogos que no toques.",
    efectosDisponibles: VOICE_EFFECTS.map((v) => `${v.id} (${v.label})`),
    dialogos,
  };
}

export interface ImportResult {
  project: StoryProject;
  cambiados: number; // textos o efectos que cambiaron
  marcados: number; // los que quedan pendientes de regenerar la voz
  desconocidos: number; // ids del archivo que no están en el proyecto
  error?: string;
}

// Aplica un archivo de textos sobre el proyecto. Empareja por id y no toca nada
// más: ni el orden, ni las pausas, ni las imágenes, ni los audios existentes.
export function applyDialogues(project: StoryProject, raw: unknown): ImportResult {
  const vacio = { project, cambiados: 0, marcados: 0, desconocidos: 0 };
  if (!raw || typeof raw !== "object") return { ...vacio, error: "El archivo no es un JSON válido." };
  const file = raw as Partial<DialogueFile>;
  const filas = file.dialogos;
  if (!Array.isArray(filas)) {
    return { ...vacio, error: 'Al archivo le falta la lista "dialogos".' };
  }

  const porId = new Map<string, DialogueRow>();
  for (const f of filas) {
    if (f && typeof f === "object" && typeof (f as any).id === "string") porId.set((f as any).id, f as DialogueRow);
  }
  if (!porId.size) return { ...vacio, error: "El archivo no trae ningún diálogo con id." };

  const efectosValidos = new Set(VOICE_EFFECTS.map((v) => v.id));
  const vistos = new Set<string>();
  let cambiados = 0;
  let marcados = 0;

  const scenes = project.scenes.map((sc) => ({
    ...sc,
    shots: sc.shots.map((sh) => ({
      ...sh,
      dialogues: sh.dialogues.map((d) => {
        const fila = porId.get(d.id);
        if (!fila) return d;
        vistos.add(d.id);
        const texto = typeof fila.texto === "string" ? fila.texto : d.text;
        const efecto = efectosValidos.has(fila.efecto) ? fila.efecto : d.effect;
        const cambioTexto = texto !== d.text;
        const cambioEfecto = efecto !== d.effect;
        if (!cambioTexto && !cambioEfecto && fila.modificado !== true) return d;
        if (cambioTexto || cambioEfecto) cambiados++;
        // Se marca si el texto cambió (el audio ya no dice eso) o si el archivo
        // lo pide expresamente. Cambiar solo el efecto no obliga a regenerar:
        // el efecto se aplica al vuelo sobre el audio que ya hay.
        const marcar = cambioTexto || fila.modificado === true;
        if (marcar && d.audioId) marcados++;
        return { ...d, text: texto, effect: efecto, stale: marcar ? true : d.stale };
      }),
    })),
  }));

  return {
    project: { ...project, scenes },
    cambiados,
    marcados,
    desconocidos: porId.size - vistos.size,
  };
}
