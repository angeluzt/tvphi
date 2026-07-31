"use client";

import { useState } from "react";
import { Plus, Folder, FolderOpen, Film, ChevronLeft, Trash2, Loader2, Users } from "lucide-react";
import { IaPanel } from "./ia-panel";

// Pantalla de entrada: primero se elige DÓNDE se va a trabajar, y solo después
// se abre el editor.
//
// Antes se caía directamente en el editor y la lista de proyectos vivía en la
// columna de la derecha, que en un móvil acaba debajo de todo: quedaba a
// kilómetros de la escena que estabas tocando y mezclaba capítulos de series
// distintas.
//
// Dos pasos: series → capítulos de esa serie. Lo que no pertenece a ninguna
// serie tiene su propio sitio, para que nada quede escondido.

export interface SerieMeta { id: string; name: string; capitulos: number; personajes: number }
export interface CapMeta { id: string; name: string; updatedAt: string; seriesId?: string | null }

export function StoryHome({
  series, proyectos, busy,
  onAbrir, onNuevoCapitulo, onNuevaSerie, onBorrar, onGenerado,
}: {
  series: SerieMeta[];
  proyectos: CapMeta[];
  busy: boolean;
  onAbrir: (id: string) => void;
  onNuevoCapitulo: (seriesId: string | null) => void;
  onNuevaSerie: () => void;
  onBorrar: (id: string, name: string) => void;
  onGenerado: (name: string, project: unknown) => void;
}) {
  // null = viendo las series; una cadena (o "") = dentro de esa serie.
  const [dentro, setDentro] = useState<string | null>(null);
  const sueltos = proyectos.filter((p) => !p.seriesId);

  if (dentro === null) {
    return (
      <div className="tool-ui space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Tus series</span>
            <button onClick={onNuevaSerie} disabled={busy} className="btn-brand ml-auto text-xs disabled:opacity-40">
              <Plus className="h-4 w-4" /> Serie nueva
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Una serie agrupa los capítulos de una misma historia y sus personajes. Un video suelto
            no necesita ninguna.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {series.map((s) => (
              <button
                key={s.id}
                onClick={() => setDentro(s.id)}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-accent hover:bg-surface-2"
              >
                <Folder className="h-5 w-5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block text-[11px] text-muted">
                    {s.capitulos} {s.capitulos === 1 ? "capítulo" : "capítulos"} · {s.personajes}{" "}
                    {s.personajes === 1 ? "personaje" : "personajes"}
                  </span>
                </span>
              </button>
            ))}
            {!series.length && (
              <p className="col-span-full py-2 text-[11px] text-muted">
                Aún no tienes series. Puedes crear una, o trabajar con capítulos sueltos aquí abajo.
              </p>
            )}
          </div>
        </div>

        {/* Lo que no está en ninguna serie: visible desde el principio, para que
            nada de lo que ya tenías parezca haberse perdido. */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Sin serie</span>
            <button onClick={() => onNuevoCapitulo(null)} disabled={busy} className="btn-ghost ml-auto text-xs disabled:opacity-40">
              <Plus className="h-4 w-4 text-accent" /> Video nuevo
            </button>
          </div>
          <Lista items={sueltos} busy={busy} onAbrir={onAbrir} onBorrar={onBorrar}
            vacio="Nada suelto. Todo lo tuyo está dentro de una serie." />
        </div>

        <IaPanel onGenerado={onGenerado} />
      </div>
    );
  }

  const serie = series.find((s) => s.id === dentro);
  const caps = proyectos.filter((p) => p.seriesId === dentro);
  return (
    <div className="tool-ui space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDentro(null)} className="btn-ghost text-xs">
            <ChevronLeft className="h-4 w-4" /> Series
          </button>
          <span className="label ml-1 min-w-0 truncate">{serie?.name ?? "Serie"}</span>
          {/* Los personajes son de la serie: se entra a los suyos desde aquí. */}
          <a href={`/story/personajes?serie=${dentro}`} className="btn-ghost ml-auto text-xs">
            <Users className="h-4 w-4 text-accent" /> Personajes
          </a>
          <button onClick={() => onNuevoCapitulo(dentro)} disabled={busy} className="btn-brand text-xs disabled:opacity-40">
            <Plus className="h-4 w-4" /> Capítulo nuevo
          </button>
        </div>
        <Lista items={caps} busy={busy} onAbrir={onAbrir} onBorrar={onBorrar}
          vacio="Esta serie aún no tiene capítulos. Crea el primero." />
      </div>
    </div>
  );
}

function Lista({
  items, busy, onAbrir, onBorrar, vacio,
}: {
  items: CapMeta[]; busy: boolean; vacio: string;
  onAbrir: (id: string) => void; onBorrar: (id: string, name: string) => void;
}) {
  if (!items.length) return <p className="mt-3 text-[11px] text-muted">{vacio}</p>;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((p) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border hover:border-accent">
          <button
            onClick={() => onAbrir(p.id)}
            disabled={busy}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" /> : <Film className="h-4 w-4 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{p.name}</span>
              <span className="block text-[11px] text-muted">
                {new Date(p.updatedAt).toLocaleDateString()} · {new Date(p.updatedAt).toLocaleTimeString()}
              </span>
            </span>
          </button>
          <button
            onClick={() => onBorrar(p.id, p.name)}
            className="mr-2 shrink-0 text-muted hover:text-danger"
            title="Borrar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Barra de vuelta, dentro del editor: dice dónde estás y te deja salir.
export function StoryBreadcrumb({
  serie, capitulo, onVolver,
}: {
  serie: string | null; capitulo: string; onVolver: () => void;
}) {
  return (
    <div className="card flex flex-wrap items-center gap-2 p-2">
      <button onClick={onVolver} className="btn-ghost text-xs">
        <ChevronLeft className="h-4 w-4" /> {serie ?? "Mis videos"}
      </button>
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{capitulo || "Sin nombre"}</span>
    </div>
  );
}
