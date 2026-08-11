// El almacén de borradores del laboratorio, en IndexedDB.
//
// POR QUÉ EXISTE APARTE. Esto ya estaba escrito dentro de `borrador-montaje`,
// que solo guardaba el montaje. Y el editor del mapa NO guardaba nada: al dar
// «atrás» sin querer, o al recargar, el mapa desaparecía entero —y el hueco lo
// llenaba un ejemplo cargado de serie, así que además parecía que tu escena se
// había convertido en otra—. Es la forma más tonta de perder una hora de
// trabajo, y pasó de verdad, varias veces.
//
// Un solo almacén con varias claves: el montaje pesa megas (lleva los PNG) y el
// mapa son unos kilobytes de JSON, pero los dos tienen el mismo problema y la
// misma solución. localStorage no sirve: son cinco megas para todo el dominio y
// un montaje de seis capas se los come.

const DB = "tvphi-lab";
const STORE = "borradores";

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("No se pudo abrir IndexedDB"));
  });
}

export async function guardarBorrador(clave: string, data: unknown): Promise<void> {
  const db = await abrir();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, clave);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("No se pudo guardar el borrador"));
  });
  db.close();
}

export async function leerBorrador<T>(clave: string): Promise<T | null> {
  const db = await abrir();
  const out = await new Promise<T | null>((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(clave);
    req.onsuccess = () => res((req.result as T) ?? null);
    req.onerror = () => rej(req.error ?? new Error("No se pudo leer el borrador"));
  });
  db.close();
  return out;
}

export async function borrarBorrador(clave: string): Promise<void> {
  const db = await abrir();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clave);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("No se pudo borrar el borrador"));
  });
  db.close();
}
