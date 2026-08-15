// Archivos que un proyecto usa pero que no están en este navegador.
//
// Por qué pasa: el proyecto (textos, encuadres, efectos) se guarda en el
// servidor, pero las imágenes y los audios pesan y viven SOLO en el almacén del
// navegador (IndexedDB). Así que al abrir un proyecto en otro equipo, en otro
// navegador, o después de limpiar los datos de navegación, los archivos no
// están: el proyecto se ve entero pero sin imágenes.
//
// Esto no es un fallo raro, es lo normal en cualquier editor de video: el
// montaje y los archivos van por separado. Los editores lo llaman "reconectar":
// te enseñan lo que falta y tú les dices dónde está cada cosa. Aquí igual.
//
// La gracia está en reconectar CON EL MISMO identificador: si la escena 3 y un
// sticker de la 7 usaban la misma imagen, al reponerla se arreglan las dos a la
// vez, sin tocar el proyecto.

import { getAsset } from "./store";
import { esDeBiblioteca, esDeBibliotecaSonido } from "./musica";
import type { StoryProject } from "./model";

export type TipoRef = "escena" | "sticker" | "voz" | "sonido" | "musica" | "video";

export type RefArchivo = {
  id: string;
  tipo: TipoRef;
  // Dónde se usa, en cristiano, para poder decir "esta es la de la escena 3".
  donde: string;
  // Solo en imágenes de escena: al reponerla hay que rehacer estas medidas,
  // porque los encuadres se guardan en tanto por uno y la proporción manda.
  sceneId?: string;
};

const ETIQUETA: Record<TipoRef, string> = {
  escena: "Imagen de escena",
  sticker: "Sticker",
  voz: "Voz generada",
  sonido: "Sonido",
  musica: "Música",
  video: "Video",
};

export function etiquetaTipo(t: TipoRef) {
  return ETIQUETA[t];
}

// Solo se puede reponer con un archivo del mismo palo.
export function aceptaDe(t: TipoRef) {
  if (t === "escena" || t === "sticker") return "image/*";
  if (t === "video") return "video/*";
  return "audio/*";
}

// Todo lo que el proyecto referencia, con su sitio. Un mismo archivo puede salir
// varias veces si se usa en varios sitios; se agrupa después.
export function referencias(p: StoryProject): RefArchivo[] {
  const out: RefArchivo[] = [];
  p.scenes.forEach((sc, si) => {
    if (sc.imageId) out.push({ id: sc.imageId, tipo: "escena", donde: `Escena ${si + 1}`, sceneId: sc.id });
    (sc.loop?.imageIds ?? []).forEach((id, fi) => {
      if (id && id !== sc.imageId) {
        out.push({ id, tipo: "escena", donde: `Escena ${si + 1} · fotograma ${fi + 1}`, sceneId: sc.id });
      }
    });
    (sc.capas ?? []).forEach((c, ci) => {
      if (c.imageId) out.push({ id: c.imageId, tipo: "escena", donde: `Escena ${si + 1} · lámina ${c.nombre || ci + 1}`, sceneId: sc.id });
      (c.loop?.imageIds ?? []).forEach((id, fi) => {
        if (id && id !== c.imageId) {
          out.push({ id, tipo: "escena", donde: `Escena ${si + 1} · ${c.nombre || "lámina"} · fotograma ${fi + 1}`, sceneId: sc.id });
        }
      });
    });
    sc.shots.forEach((sh, hi) => {
      const sitio = `Escena ${si + 1} · toma ${hi + 1}`;
      for (const d of sh.dialogues) if (d.audioId) out.push({ id: d.audioId, tipo: "voz", donde: sitio });
      for (const s of sh.sfx) if (s.audioId) out.push({ id: s.audioId, tipo: "sonido", donde: `${sitio} · ${s.name}` });
      for (const o of sh.overlays) {
        if (o.imageId) out.push({ id: o.imageId, tipo: "sticker", donde: sitio });
        if (o.soundId) out.push({ id: o.soundId, tipo: "sonido", donde: `${sitio} · sonido del sticker` });
      }
    });
  });
  for (const l of p.audioLayers) {
    if (l.audioId) out.push({ id: l.audioId, tipo: l.kind === "music" ? "musica" : "sonido", donde: l.name || "Pista de audio" });
  }
  if (p.intro?.assetId) out.push({ id: p.intro.assetId, tipo: "video", donde: "Careta de entrada" });
  if (p.outro?.assetId) out.push({ id: p.outro.assetId, tipo: "video", donde: "Cierre" });
  return out;
}

export type Falta = {
  id: string;
  tipo: TipoRef;
  // Todos los sitios donde se usa: reponerla una vez los arregla todos.
  donde: string[];
  sceneIds: string[];
};

// Cuáles de esos archivos NO están en este navegador.
export async function faltantes(p: StoryProject): Promise<Falta[]> {
  const refs = referencias(p);
  // Se agrupa por archivo ANTES de mirar el almacén: así no se pregunta dos
  // veces por el mismo id.
  const porId = new Map<string, Falta>();
  for (const r of refs) {
    const y = porId.get(r.id);
    if (y) {
      if (!y.donde.includes(r.donde)) y.donde.push(r.donde);
      if (r.sceneId && !y.sceneIds.includes(r.sceneId)) y.sceneIds.push(r.sceneId);
    } else {
      porId.set(r.id, { id: r.id, tipo: r.tipo, donde: [r.donde], sceneIds: r.sceneId ? [r.sceneId] : [] });
    }
  }
  const out: Falta[] = [];
  for (const f of porId.values()) {
    // Música/sonidos de la app (lib:… / son:…): viven en el servidor, no en
    // IndexedDB. getAsset() ya los resuelve por red; si aquí se miraran como
    // archivo local, un fallo de red o 401 los marcaría «perdidos» y el panel
    // pediría «Buscar» algo que el usuario no puede reponer a mano.
    if (esDeBiblioteca(f.id) || esDeBibliotecaSonido(f.id)) continue;
    if (!(await getAsset(f.id))) out.push(f);
  }
  return out;
}
