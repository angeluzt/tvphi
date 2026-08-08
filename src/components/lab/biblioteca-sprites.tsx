"use client";

import { useCallback, useEffect, useState } from "react";
import { Library, Loader2, Trash2, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { pedirJson } from "@/lib/pedir-json";
import { pesoLegible, urlSprite, type SpriteMeta } from "@/lib/lab/biblioteca";
import { VistaSprite } from "./vista-sprite";

// La biblioteca: lo que ya está fabricado y no hay que volver a pagar.
//
// POR QUÉ EXISTE. Un sprite bajado en un ZIP se pierde en la carpeta de
// descargas, y hay que volver a subirlo en cada montaje —desde el móvil, ni
// eso—. Aquí un pájaro se paga UNA vez y entra en todos los vídeos que se
// hagan, desde cualquier equipo. Es lo que convierte «generar imágenes» en
// «tener un repertorio».

export function BibliotecaSprites({ recargar, onUsar }: {
  /** Cambia cuando alguien guarda algo nuevo: es la señal para releer. */
  recargar?: number;
  onUsar?: (s: SpriteMeta) => void;
}) {
  const [sprites, setSprites] = useState<SpriteMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const leer = useCallback(async () => {
    setError(null);
    try {
      const j = await pedirJson("/api/story/lab/sprites");
      setSprites(j.sprites ?? []);
      setPuedeEditar(!!j.puedeEditar);
    } catch (e) {
      setError((e as Error).message);
      setSprites([]);
    }
  }, []);

  useEffect(() => { void leer(); }, [leer, recargar]);

  async function borrar(id: string) {
    setBorrando(id);
    try {
      await pedirJson(urlSprite(id), { method: "DELETE" });
      setSprites((s) => (s ?? []).filter((x) => x.id !== id));
      setConfirmar(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBorrando(null);
    }
  }

  const total = sprites?.reduce((a, s) => a + s.bytes, 0) ?? 0;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Library className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Biblioteca de sprites</span>
          <span className="block text-[11px] text-muted">
            Lo que ya está fabricado. Se mete en cualquier montaje sin gastar nada.
          </span>
        </span>
        <button onClick={() => void leer()} className="btn-ghost shrink-0 text-xs" title="Releer">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {sprites === null && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
        </p>
      )}

      {sprites?.length === 0 && !error && (
        <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted">
          Todavía no hay nada. Fabrica un sprite aquí arriba y dale a «Guardar en la biblioteca»:
          a partir de ahí lo tienes para siempre, en todos los montajes.
        </p>
      )}

      {!!sprites?.length && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sprites.map((s) => (
              <div key={s.id} className="space-y-1.5 rounded-lg border border-border bg-surface-2/40 p-2">
                <div className="flex items-start gap-2">
                  <VistaSprite
                    tira={urlSprite(s.id)}
                    fotogramas={s.fotogramas}
                    fps={s.fps}
                    tam={72}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-fg" title={s.nombre}>{s.nombre}</p>
                    <p className="truncate text-[10px] text-muted" title={s.que}>{s.que}</p>
                    <p className="text-[10px] text-muted">
                      {s.fotogramas} fotogramas · {s.fps}/s · {s.ancho}×{s.alto} · {pesoLegible(s.bytes)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onUsar?.(s)}
                    disabled={!onUsar}
                    className="btn-brand flex-1 py-1 text-[11px] disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" /> Al montaje
                  </button>
                  {puedeEditar && (
                    confirmar === s.id ? (
                      <>
                        <button
                          onClick={() => void borrar(s.id)}
                          disabled={borrando === s.id}
                          className="rounded-md border border-danger/50 px-2 py-1 text-[11px] text-danger disabled:opacity-40"
                        >
                          {borrando === s.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : "Sí, borrar"}
                        </button>
                        <button onClick={() => setConfirmar(null)} className="btn-ghost px-2 py-1 text-[11px]">
                          No
                        </button>
                      </>
                    ) : (
                      // Con confirmación porque no hay vuelta atrás: el PNG solo
                      // está aquí, y rehacerlo es otra llamada pagada.
                      <button
                        onClick={() => setConfirmar(s.id)}
                        className="rounded-md border border-border px-2 py-1 text-muted hover:border-danger/50 hover:text-danger"
                        title="Borrar de la biblioteca"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted">
            {sprites.length} sprite{sprites.length === 1 ? "" : "s"} · {pesoLegible(total)} en total.
            Cada uno se pagó una vez.
          </p>
        </>
      )}
    </div>
  );
}
