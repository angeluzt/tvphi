"use client";

import { ChevronDown, ChevronRight, ChevronUp, Clapperboard, Eye, Layers, Trash2 } from "lucide-react";

/**
 * TODO lo que se mueve en la escena, en una sola lista.
 *
 * Antes esto no existía en ninguna parte. Los pasos de cámara vivían dentro de
 * la pestaña «Cámara» y el movimiento de cada capa, dentro del panel de esa
 * capa: para saber qué se estaba animando había que pasearse por las seis capas
 * de una en una y acordarse. Quitar algo era encontrarlo primero, y reordenar
 * no se podía.
 *
 * Aquí se ve de golpe qué hay, se quita, se reordena y se salta a lo que sea
 * tocando su fila — que además lo señala en el lienzo.
 */

export interface FilaCamara {
  id: string;
  label: string;
  distancia: number;
  durMs: number;
  activo: boolean;
}

export interface FilaCapa {
  id: string;
  nombre: string;
  resumen: string;
  color: string;
  seleccionada: boolean;
  esSprite: boolean;
}

export function PanelAnimaciones({
  camara,
  capas,
  enSecuencia,
  abierto,
  onAlternar,
  onQuitarPaso,
  onMoverPaso,
  onAbrirPaso,
  onQuitarMovCapa,
  onIrACapa,
  onVaciarCamara,
}: {
  camara: FilaCamara[];
  capas: FilaCapa[];
  enSecuencia: boolean;
  abierto: boolean;
  onAlternar: () => void;
  onQuitarPaso: (id: string) => void;
  onMoverPaso: (id: string, delta: -1 | 1) => void;
  onAbrirPaso: (id: string) => void;
  onQuitarMovCapa: (id: string) => void;
  onIrACapa: (id: string) => void;
  onVaciarCamara: () => void;
}) {
  const total = camara.length + capas.length;

  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-center gap-1.5 p-2">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {abierto
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
          <span className="text-[10px] font-semibold text-fg">Animaciones de la escena</span>
          <span className={`chip text-[9px] ${total ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"}`}>
            {total}
          </span>
          {!abierto && !!total && (
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
              {camara.length ? `${camara.length} de cámara` : ""}
              {camara.length && capas.length ? " · " : ""}
              {capas.length ? `${capas.length} de capa` : ""}
            </span>
          )}
        </button>
      </div>

      <div className={abierto ? "space-y-2 px-2 pb-2" : "hidden"}>
        {!total && (
          <p className="text-[10px] text-muted">
            Todavía no se mueve nada. Dale movimiento a una capa en «Animar selección», o
            añade un paso de cámara desde la pestaña «Cámara».
          </p>
        )}

        {!!camara.length && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Clapperboard className="h-3 w-3 text-brand" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                Cámara · {camara.length} paso{camara.length === 1 ? "" : "s"}
              </span>
              {!enSecuencia && (
                <button type="button" onClick={onVaciarCamara}
                  className="ml-auto text-[9px] text-muted underline hover:text-danger">
                  Vaciar
                </button>
              )}
            </div>
            <ol className="space-y-1">
              {camara.map((p, i) => (
                <li key={p.id}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] ${
                    p.activo ? "bg-brand/15 text-brand" : "bg-surface/60 text-muted"
                  }`}>
                  <span className="w-4 shrink-0 tabular-nums opacity-70">{i + 1}.</span>
                  <button type="button" onClick={() => onAbrirPaso(p.id)}
                    className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline">
                    {p.label}
                  </button>
                  <span className="shrink-0 tabular-nums">{p.distancia}%</span>
                  <span className="shrink-0 tabular-nums">{(p.durMs / 1000).toFixed(1)}s</span>
                  {!enSecuencia && (
                    <>
                      <button type="button" onClick={() => onMoverPaso(p.id, -1)} disabled={i === 0}
                        className="shrink-0 text-muted hover:text-fg disabled:opacity-25"
                        aria-label={`Subir ${p.label}`} title="Antes">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => onMoverPaso(p.id, 1)} disabled={i === camara.length - 1}
                        className="shrink-0 text-muted hover:text-fg disabled:opacity-25"
                        aria-label={`Bajar ${p.label}`} title="Después">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => onQuitarPaso(p.id)}
                        className="shrink-0 text-muted hover:text-danger"
                        aria-label={`Quitar ${p.label}`} title="Quitar este paso">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {!!capas.length && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-accent" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                Capas que se mueven · {capas.length}
              </span>
            </div>
            <ul className="space-y-1">
              {capas.map((c) => (
                <li key={c.id}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] ${
                    c.seleccionada ? "bg-accent/15" : "bg-surface/60"
                  }`}>
                  {/* El punto de color es lo que ata esta fila con su camino
                      dibujado en el lienzo. Sin él, con tres capas animadas no
                      hay forma de saber cuál de los caminos es cuál. */}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }} aria-hidden />
                  <button type="button" onClick={() => onIrACapa(c.id)}
                    className="min-w-0 flex-1 text-left hover:underline">
                    <span className="block truncate font-medium text-fg">{c.nombre}</span>
                    <span className="block truncate text-[9px] text-muted">{c.resumen}</span>
                  </button>
                  <button type="button" onClick={() => onIrACapa(c.id)}
                    className="shrink-0 text-muted hover:text-fg"
                    aria-label={`Ver ${c.nombre}`} title="Ir a esta capa">
                    <Eye className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => onQuitarMovCapa(c.id)}
                    className="shrink-0 text-muted hover:text-danger"
                    aria-label={`Quitar la animación de ${c.nombre}`} title="Dejarla quieta">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
