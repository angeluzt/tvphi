// Almacén de recursos (imágenes, audios) por id en IndexedDB. Los recursos grandes
// no se suben al servidor; viven en el navegador del usuario.

import { esDeBiblioteca, urlPista, esDeBibliotecaSonido, urlSonido } from "./musica";

const DB = "tvphi-story";
const STORE = "assets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  // Si se sustituye el archivo, la URL antigua ya no vale: si no se olvida,
  // el motor sigue pintando/sonando la versión anterior (mismo id).
  forgetUrl(id);
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(blob, id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

// Las pistas de la biblioteca no están en el navegador: están dentro de la app,
// en /musica. Se resuelven AQUÍ, en el único sitio por el que pasan todos los
// audios, para que el motor, el exportador, el ZIP y el panel de «faltan
// archivos» sigan funcionando sin enterarse de que existe una biblioteca.
//
// Consecuencia buena: una pista de biblioteca nunca «falta» al abrir un
// proyecto en otro equipo, porque viaja con la aplicación.
const cacheLib = new Map<string, Blob>();

export async function getAsset(id: string): Promise<Blob | null> {
  if (esDeBiblioteca(id) || esDeBibliotecaSonido(id)) {
    const guardado = cacheLib.get(id);
    if (guardado) return guardado;
    try {
      const r = await fetch(esDeBiblioteca(id) ? urlPista(id) : urlSonido(id));
      if (!r.ok) return null;
      const blob = await r.blob();
      cacheLib.set(id, blob);
      return blob;
    } catch {
      return null;
    }
  }
  const db = await openDb();
  return new Promise((res) => {
    const t = db.transaction(STORE, "readonly");
    const rq = t.objectStore(STORE).get(id);
    rq.onsuccess = () => res((rq.result as Blob) ?? null);
    rq.onerror = () => res(null);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(id);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}

// Devuelve una object URL para un asset (cacheada por id en memoria).
const urlCache = new Map<string, string>();
export async function assetUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const blob = await getAsset(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}
export function cachedUrl(id: string): string | null {
  return urlCache.get(id) ?? null;
}
/** Olvida la object URL de un id (p. ej. tras reemplazar el blob). */
export function forgetUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    try { URL.revokeObjectURL(url); } catch {}
    urlCache.delete(id);
  }
}
