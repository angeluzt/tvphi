"use client";

import { useCallback, useEffect, useState } from "react";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
import { pedirJson } from "@/lib/pedir-json";
import { nombreCorto, urlSprite, type SpriteMeta } from "@/lib/lab/biblioteca";
import type { AnimLigada, SpriteEnCapa } from "@/lib/lab/sprite-capa";

// Colgarle a un actor OTRAS animaciones suyas, para que la ruta pueda
// cambiarlas a mitad de camino.
//
// EL PROBLEMA QUE QUITA. Un personaje que llega andando, se para y saluda eran
// tres capas con la misma criatura, encendidas y apagadas a mano en los
// momentos justos. Cuadrarlo ya era pesado; en cuanto movías un punto de la
// ruta, había que recalcular los tres a ojo y volver a intentarlo.
//
// Aquí se ligan una vez y la ruta las llama por su clave. Cada animación
// conserva sus propios fotogramas y su propia velocidad, que es justo lo que
// no se podía hacer con una sola tira.

/** Clave corta, legible y única dentro de esta capa. */
export function claveDeAnimacion(nombre: string, usadas: string[]): string {
  const base = nombre
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 20) || "anim";
  if (!usadas.includes(base)) return base;
  for (let i = 2; i < 99; i++) {
    if (!usadas.includes(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function LigarAnimaciones({ spr, onLigar, onQuitar }: {
  spr: SpriteEnCapa;
  onLigar: (anim: AnimLigada, img: HTMLImageElement) => void;
  onQuitar: (clave: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<SpriteMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const ligadas = spr.anims ?? [];

  const leer = useCallback(async () => {
    setError(null);
    try {
      const j = await pedirJson("/api/story/lab/sprites");
      setLista((j.sprites ?? []) as SpriteMeta[]);
    } catch (e) {
      setError((e as Error).message);
      setLista([]);
    }
  }, []);

  useEffect(() => { if (abierto && lista === null) void leer(); }, [abierto, lista, leer]);

  async function ligar(id: string) {
    const s = lista?.find((x) => x.id === id);
    if (!s) return;
    setCargando(id);
    setError(null);
    try {
      // La tira se carga AQUÍ y no al pintar: si el sprite ya no está en la
      // biblioteca hay que enterarse ahora, no a mitad de una reproducción.
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("No se pudo cargar esa tira."));
        i.src = urlSprite(s.id);
      });
      onLigar({
        clave: claveDeAnimacion(nombreCorto(s.nombre || s.que), ligadas.map((a) => a.clave)),
        id: s.id,
        fotogramas: s.fotogramas,
        fps: s.fps,
      }, img);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(null);
    }
  }

  // Las que ya están ligadas y la propia tira de la capa no se vuelven a
  // ofrecer: ligar dos veces la misma solo llena el desplegable de la ruta.
  const yaPuestas = new Set([spr.id, ...ligadas.map((a) => a.id)].filter(Boolean) as string[]);
  const disponibles = (lista ?? []).filter((s) => !yaPuestas.has(s.id));

  return (
    <div className="space-y-1 rounded border border-border/70 bg-surface/40 p-1.5">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1 text-[9px] font-medium text-fg">
        <Film className="h-3 w-3 text-accent" />
        Animaciones ligadas
        {!!ligadas.length && <span className="chip bg-accent/15 text-[8px] text-accent">{ligadas.length}</span>}
        <span className="ml-auto text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {!!ligadas.length && (
        <div className="space-y-0.5">
          {ligadas.map((a) => (
            <div key={a.clave} className="flex items-center gap-1 rounded bg-surface-2/50 px-1 py-0.5 text-[9px]">
              <code className="shrink-0 text-accent">{a.clave}</code>
              <span className="min-w-0 flex-1 truncate text-muted">
                {a.fotogramas} cuadros · {a.fps}/s
              </span>
              <button type="button" onClick={() => onQuitar(a.clave)}
                className="shrink-0 rounded border border-border p-0.5 text-muted hover:text-danger"
                aria-label={`Desligar ${a.clave}`}>
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <div className="space-y-1 border-t border-border/50 pt-1">
          <p className="text-[8px] leading-snug text-muted">
            Elige otras animaciones del mismo personaje. Después, en cada paso de la ruta, dices
            con cuál pasa por ahí: «va CORRIENDO hasta la puerta, se para y SALUDA».
          </p>
          {lista === null && (
            <p className="flex items-center gap-1 text-[9px] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Leyendo la biblioteca…
            </p>
          )}
          {lista !== null && !disponibles.length && (
            <p className="text-[9px] text-muted">
              No queda ninguna otra animación en tu biblioteca. Fabrica más en la pestaña Sprites.
            </p>
          )}
          {!!disponibles.length && (
            <div className="max-h-32 space-y-0.5 overflow-y-auto">
              {disponibles.map((s) => (
                <button key={s.id} type="button" onClick={() => void ligar(s.id)} disabled={!!cargando}
                  className="flex w-full items-center gap-1 rounded border border-border px-1 py-0.5 text-left text-[9px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40">
                  {cargando === s.id
                    ? <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" />
                    : <Plus className="h-2.5 w-2.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{nombreCorto(s.nombre || s.que)}</span>
                  <span className="shrink-0 opacity-70">{s.fotogramas}c</span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-[9px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
