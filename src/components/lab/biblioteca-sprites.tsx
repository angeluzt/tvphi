"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Library, Loader2, Trash2, Plus, AlertTriangle, RefreshCw, Compass, Check, Search, Pencil,
  ChevronLeft, ChevronRight, Film,
} from "lucide-react";
import { pedirJson } from "@/lib/pedir-json";
import { nombreCorto, pesoLegible, resumenPrompt, urlSprite, type SpriteMeta } from "@/lib/lab/biblioteca";
import { VistaSprite } from "./vista-sprite";

const POR_PAGINA = 9;

export function BibliotecaSprites({ recargar, onUsar, onEditarPlantilla, onNuevaAnimacion }: {
  recargar?: number;
  onUsar?: (s: SpriteMeta) => void;
  onEditarPlantilla?: (animationId: string) => void;
  onNuevaAnimacion?: (characterId: string) => void;
}) {
  const [sprites, setSprites] = useState<SpriteMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [plantillas, setPlantillas] = useState<Record<string, string>>({});
  const [borrando, setBorrando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardandoMeta, setGuardandoMeta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");

  const leer = useCallback(async () => {
    setError(null);
    try {
      const j = await pedirJson("/api/story/lab/sprites");
      setSprites(j.sprites ?? []);
      setPuedeEditar(!!j.puedeEditar);
      setPlantillas(j.plantillas ?? {});
    } catch (e) {
      setError((e as Error).message);
      setSprites([]);
      setPlantillas({});
    }
  }, []);

  useEffect(() => { void leer(); }, [leer, recargar]);
  useEffect(() => { setPagina(0); }, [busqueda]);

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLocaleLowerCase("es");
    if (!t || !sprites) return sprites ?? [];
    return sprites.filter((s) => `${s.nombre} ${s.que}`.toLocaleLowerCase("es").includes(t));
  }, [sprites, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaClamped = Math.min(pagina, totalPaginas - 1);
  const paginaSprites = filtrados.slice(paginaClamped * POR_PAGINA, paginaClamped * POR_PAGINA + POR_PAGINA);

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

  async function cambiarMeta(s: SpriteMeta, patch: Partial<SpriteMeta>) {
    const siguiente = { ...s, ...patch };
    setSprites((lista) => (lista ?? []).map((x) => (x.id === s.id ? siguiente : x)));
  }

  async function guardarMeta(s: SpriteMeta) {
    setGuardandoMeta(s.id);
    setError(null);
    try {
      await pedirJson(urlSprite(s.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: s.nombre,
          vista: s.vista, direccion: s.direccion, accion: s.accion, anclaje: s.anclaje,
        }),
      });
      setEditando(null);
      setRenombrandoId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardandoMeta(null);
    }
  }

  async function guardarNombre(s: SpriteMeta) {
    const nombre = nombreEdit.trim();
    if (!nombre || nombre === s.nombre) {
      setRenombrandoId(null);
      return;
    }
    const next = { ...s, nombre };
    setSprites((lista) => (lista ?? []).map((x) => (x.id === s.id ? next : x)));
    await guardarMeta(next);
  }

  const total = sprites?.reduce((a, s) => a + s.bytes, 0) ?? 0;

  return (
    <div className="card min-w-0 space-y-3 overflow-hidden p-4">
      <div className="flex items-center gap-2">
        <Library className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Biblioteca pública de sprites</span>
          <span className="block text-[11px] text-muted">
            Lo publicado para todos. Se mete en cualquier montaje sin gastar nada.
          </span>
        </span>
        <button onClick={() => void leer()} className="btn-ghost shrink-0 text-xs" title="Releer">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {!!sprites?.length && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted" />
          <input
            className="input w-full py-1.5 pl-7 text-xs"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o prompt…"
            aria-label="Buscar sprites"
          />
        </div>
      )}

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
          Todavía no hay nada. Fabrica un sprite aquí arriba y dale a «Publicar para todos».
        </p>
      )}

      {!!sprites?.length && !filtrados.length && (
        <p className="text-[11px] text-muted">Ningún sprite coincide con «{busqueda.trim()}».</p>
      )}

      {!!paginaSprites.length && (
        <>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {paginaSprites.map((s) => {
              const characterId = s.animationId ? plantillas[s.animationId] : undefined;
              const tienePlantilla = !!characterId;
              return (
                <div key={s.id} className="min-w-0 space-y-1.5 overflow-hidden rounded-lg border border-border bg-surface-2/40 p-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <VistaSprite tira={urlSprite(s.id)} fotogramas={s.fotogramas} fps={s.fps} tam={72} />
                    <div className="min-w-0 flex-1">
                      {puedeEditar && renombrandoId === s.id ? (
                        <div className="flex gap-1">
                          <input
                            className="input min-w-0 flex-1 py-0.5 text-[11px]"
                            value={nombreEdit}
                            maxLength={60}
                            autoFocus
                            onChange={(e) => setNombreEdit(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void guardarNombre(s);
                              if (e.key === "Escape") setRenombrandoId(null);
                            }}
                          />
                          <button type="button" className="btn-brand px-1.5 py-0.5" onClick={() => void guardarNombre(s)}>
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <p className="min-w-0 truncate text-xs font-medium text-fg" title={s.nombre}>{nombreCorto(s.nombre)}</p>
                          {puedeEditar && (
                            <button
                              type="button"
                              className="shrink-0 text-muted hover:text-accent"
                              title="Renombrar"
                              onClick={() => { setRenombrandoId(s.id); setNombreEdit(s.nombre); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <p className="truncate text-[10px] text-muted" title={s.que}>{resumenPrompt(s.que, 70)}</p>
                      <p className="truncate text-[10px] text-muted">
                        {s.fotogramas} fotogramas · {s.fps}/s · {s.ancho}×{s.alto} · {pesoLegible(s.bytes)}
                      </p>
                      <p className="truncate text-[9px] text-accent">
                        {s.vista} · apunta {s.direccion} · {s.accion} · {s.anclaje}
                      </p>
                    </div>
                  </div>
                  {puedeEditar && editando === s.id && (
                    <div className="grid grid-cols-2 gap-1 rounded-md border border-accent/30 bg-accent/5 p-1.5">
                      <select value={s.vista} onChange={(e) => void cambiarMeta(s, { vista: e.target.value as SpriteMeta["vista"] })} className="input min-w-0 py-1 text-[10px]">
                        <option value="lateral">Lateral</option><option value="frontal">Frontal</option><option value="trasera">Trasera</option><option value="superior">Superior</option><option value="libre">Libre</option>
                      </select>
                      <select value={s.direccion} onChange={(e) => void cambiarMeta(s, { direccion: e.target.value as SpriteMeta["direccion"] })} className="input min-w-0 py-1 text-[10px]">
                        <option value="derecha">Apunta derecha</option><option value="izquierda">Apunta izquierda</option><option value="frente">Apunta al frente</option><option value="espaldas">Apunta atrás</option><option value="arriba">Apunta arriba</option><option value="abajo">Apunta abajo</option><option value="ninguna">Sin dirección</option>
                      </select>
                      <select value={s.accion} onChange={(e) => void cambiarMeta(s, { accion: e.target.value as SpriteMeta["accion"] })} className="input min-w-0 py-1 text-[10px]">
                        {(["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"] as const).map((a) => <option value={a} key={a}>{a}</option>)}
                      </select>
                      <select value={s.anclaje} onChange={(e) => void cambiarMeta(s, { anclaje: e.target.value as SpriteMeta["anclaje"] })} className="input min-w-0 py-1 text-[10px]">
                        <option value="centro">Ancla al centro</option><option value="pies">Ancla por los pies</option>
                      </select>
                      <button type="button" onClick={() => void guardarMeta(s)} disabled={guardandoMeta === s.id} className="btn-brand col-span-2 py-1 text-[10px]">
                        {guardandoMeta === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Guardar orientación
                      </button>
                    </div>
                  )}
                  {tienePlantilla && (onEditarPlantilla || onNuevaAnimacion) && (
                    <div className="flex min-w-0 gap-1.5">
                      {onEditarPlantilla && s.animationId && (
                        <button
                          type="button"
                          className="btn-ghost min-w-0 flex-1 py-1 text-[10px]"
                          title="Abrir plantilla completa en el taller"
                          onClick={() => onEditarPlantilla(s.animationId!)}
                        >
                          <Pencil className="h-3 w-3" /> Editar plantilla
                        </button>
                      )}
                      {onNuevaAnimacion && characterId && (
                        <button
                          type="button"
                          className="btn-ghost min-w-0 flex-1 py-1 text-[10px]"
                          title="Añadir otra animación al mismo personaje"
                          onClick={() => onNuevaAnimacion(characterId)}
                        >
                          <Film className="h-3 w-3" /> Nueva animación
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex min-w-0 gap-1.5 overflow-hidden">
                    <button
                      onClick={() => onUsar?.(s)}
                      disabled={!onUsar}
                      className="btn-brand min-w-0 flex-1 py-1 text-[11px] disabled:opacity-40"
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
                        <button
                          onClick={() => setConfirmar(s.id)}
                          className="rounded-md border border-border px-2 py-1 text-muted hover:border-danger/50 hover:text-danger"
                          title="Borrar de la biblioteca"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )
                    )}
                    {puedeEditar && confirmar !== s.id && (
                      <button type="button" onClick={() => {
                        if (editando === s.id) { setEditando(null); void leer(); }
                        else setEditando(s.id);
                      }}
                        className="rounded-md border border-border px-2 py-1 text-muted hover:border-accent/50 hover:text-accent"
                        title="Corregir vista, dirección y anclaje">
                        <Compass className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filtrados.length > POR_PAGINA && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40"
                disabled={paginaClamped <= 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </button>
              <span className="tabular-nums">
                {paginaClamped + 1} / {totalPaginas} · {filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40"
                disabled={paginaClamped >= totalPaginas - 1}
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              >
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <p className="text-[10px] text-muted">
            {sprites!.length} sprite{sprites!.length === 1 ? "" : "s"} · {pesoLegible(total)} en total.
            Cada uno se pagó una vez.
          </p>
        </>
      )}
    </div>
  );
}
