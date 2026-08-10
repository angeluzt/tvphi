/** Borrador del montaje en IndexedDB para no perder trabajo al recargar. */

const DB = "tvphi-lab";
const STORE = "borradores";
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
    spr?: unknown;
    dataUrl: string;
  }[];
  escena?: unknown;
  cola?: unknown[];
};

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

export async function guardarBorradorMontaje(data: BorradorMontaje): Promise<void> {
  const db = await abrir();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, CLAVE);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("No se pudo guardar el borrador"));
  });
  db.close();
}

export async function leerBorradorMontaje(): Promise<BorradorMontaje | null> {
  const db = await abrir();
  const out = await new Promise<BorradorMontaje | null>((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(CLAVE);
    req.onsuccess = () => res((req.result as BorradorMontaje) ?? null);
    req.onerror = () => rej(req.error ?? new Error("No se pudo leer el borrador"));
  });
  db.close();
  return out;
}

export async function borrarBorradorMontaje(): Promise<void> {
  const db = await abrir();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(CLAVE);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("No se pudo borrar el borrador"));
  });
  db.close();
}

export function imgADataUrl(img: HTMLImageElement): Promise<string> {
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth || img.width;
  cv.height = img.naturalHeight || img.height;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return Promise.resolve(cv.toDataURL("image/png"));
}
