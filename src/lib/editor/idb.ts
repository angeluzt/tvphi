// Persistencia de la última grabación en IndexedDB, para no perderla si el usuario
// recarga por accidente (localStorage no admite blobs grandes; IndexedDB sí).

const DB = "tvphi-editor";
const STORE = "takes";
const KEY = "last";

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

export async function saveTake(blob: Blob, durationSec: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put({ blob, durationSec, at: Date.now() }, KEY);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch {}
}

export async function loadTake(): Promise<{ blob: Blob; durationSec: number } | null> {
  try {
    const db = await openDb();
    return await new Promise((res) => {
      const t = db.transaction(STORE, "readonly");
      const rq = t.objectStore(STORE).get(KEY);
      rq.onsuccess = () => {
        const v = rq.result as any;
        res(v?.blob ? { blob: v.blob, durationSec: v.durationSec ?? 0 } : null);
      };
      rq.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function clearTake(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).delete(KEY);
      t.oncomplete = () => res();
      t.onerror = () => res();
    });
  } catch {}
}
