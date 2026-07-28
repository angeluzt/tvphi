"use client";

// Bloqueos de escenas y tomas. Sirven para no tocar por accidente lo que ya está
// ajustado: una escena bloqueada no se abre ni se mueve, y una toma bloqueada no
// deja cambiar nada de dentro.
//
// Se guardan en el navegador (localStorage) y no en el proyecto: son una ayuda
// para editar, no parte del video, y así se recuerdan aunque no se guarde nada.

const KEY = "tvphi:story:locks";

export type Locks = Record<string, boolean>;

export function loadLocks(): Locks {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocks(locks: Locks) {
  if (typeof window === "undefined") return;
  try {
    // Solo se guardan los que están puestos, para no acumular basura.
    const limpio: Locks = {};
    for (const [id, v] of Object.entries(locks)) if (v) limpio[id] = true;
    localStorage.setItem(KEY, JSON.stringify(limpio));
  } catch {}
}
