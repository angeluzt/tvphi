"use client";

import { useState } from "react";
import { Plus, Folder, FolderOpen, Film, ChevronLeft, Trash2, Loader2, Users, FileUp } from "lucide-react";
import { IaPanel } from "./ia-panel";
import type { CupoHistorias } from "./story-app";

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
// Desde aquí también se asigna, mueve o suelta un capítulo si el usuario se
// equivocó de sitio.

export interface SerieMeta { id: string; name: string; capitulos: number; personajes: number }
export interface CapMeta { id: string; name: string; updatedAt: string; seriesId?: string | null }

function textoCupo(cupo: CupoHistorias) {
  if (cupo.exento) return null;
  if (cupo.quedan > 0) {
    return `Historias con IA: te quedan ${cupo.quedan} de ${cupo.limite} en 24 h. Crear a mano no tiene límite.`;
  }
  const cuando = cupo.retryAt ? new Date(cupo.retryAt).toLocaleString() : "más tarde";
  return `Ya usaste tus ${cupo.limite} historias con IA de hoy. Podrás generar otra a partir de ${cuando}. Crear a mano sigue libre.`;
}

export function StoryHome({
  series, proyectos, cupo, busy,
  onAbrir, onNuevoCapitulo, onNuevaSerie, onBorrar, onGenerado, onImportarZip, onCupo,
  onMoverSerie,
}: {
  series: SerieMeta[];
  proyectos: CapMeta[];
  cupo: CupoHistorias;
  busy: boolean;
  onAbrir: (id: string) => void;
  onNuevoCapitulo: (seriesId: string | null) => void;
  onNuevaSerie: () => void;
  onBorrar: (id: string, name: string) => void;
  onGenerado: (name: string, project: unknown) => void;
  onImportarZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCupo?: (c: CupoHistorias) => void;
  /** Asignar a una serie, mover a otra, o null = dejar suelto. */
  onMoverSerie?: (capId: string, seriesId: string | null) => void;
}) {
  // null = viendo las series; una cadena (o "") = dentro de esa serie.
  const [dentro, setDentro] = useState<string | null>(null);
  const sueltos = proyectos.filter((p) => !p.seriesId);
  const avisoCupo = textoCupo(cupo);

  if (dentro === null) {
    return (
      <div className="tool-ui space-y-4">
        {avisoCupo && (
          <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
            {avisoCupo}
          </p>
        )}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Tus series</span>
            <button onClick={onNuevaSerie} disabled={busy} className="btn-brand ml-auto text-xs disabled:opacity-40">
              <Plus className="h-4 w-4" /> Serie nueva
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Una serie agrupa los capítulos de una misma historia y sus personajes. Un video suelto
            no necesita ninguna. Si un capítulo está en el sitio equivocado, puedes moverlo o soltarlo
            desde su fila.
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

        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Sin serie</span>
            <button
              onClick={() => onNuevoCapitulo(null)}
              disabled={busy}
              className="btn-ghost ml-auto text-xs disabled:opacity-40"
            >
              <Plus className="h-4 w-4 text-accent" /> Video nuevo
            </button>
            <a href="/story/personajes" className="btn-ghost text-xs">
              <Users className="h-4 w-4 text-accent" /> Personajes
            </a>
            <label className="btn-ghost cursor-pointer text-xs">
              <FileUp className="h-4 w-4 text-accent" /> Importar .zip
              <input type="file" accept=".zip,application/zip" className="hidden" onChange={onImportarZip} />
            </label>
          </div>
          <Lista
            items={sueltos}
            series={series}
            serieActual={null}
            busy={busy}
            onAbrir={onAbrir}
            onBorrar={onBorrar}
            onMoverSerie={onMoverSerie}
            vacio="Nada suelto. Todo lo tuyo está dentro de una serie."
          />
        </div>

        <IaPanel onGenerado={onGenerado} cupo={cupo} onCupo={onCupo} />
      </div>
    );
  }

  const serie = series.find((s) => s.id === dentro);
  const caps = proyectos.filter((p) => p.seriesId === dentro);
  return (
    <div className="tool-ui space-y-4">
      {avisoCupo && (
        <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
          {avisoCupo}
        </p>
      )}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDentro(null)} className="btn-ghost text-xs">
            <ChevronLeft className="h-4 w-4" /> Series
          </button>
          <span className="label ml-1 min-w-0 truncate">{serie?.name ?? "Serie"}</span>
          <a href={`/story/personajes?serie=${dentro}`} className="btn-ghost ml-auto text-xs">
            <Users className="h-4 w-4 text-accent" /> Personajes
          </a>
          <button
            onClick={() => onNuevoCapitulo(dentro)}
            disabled={busy}
            className="btn-brand text-xs disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Capítulo nuevo
          </button>
        </div>
        <Lista
          items={caps}
          series={series}
          serieActual={dentro}
          busy={busy}
          onAbrir={onAbrir}
          onBorrar={onBorrar}
          onMoverSerie={onMoverSerie}
          vacio="Esta serie aún no tiene capítulos. Crea el primero."
        />
      </div>
    </div>
  );
}

function Lista({
  items, series, serieActual, busy, onAbrir, onBorrar, onMoverSerie, vacio,
}: {
  items: CapMeta[];
  series: SerieMeta[];
  serieActual: string | null;
  busy: boolean;
  vacio: string;
  onAbrir: (id: string) => void;
  onBorrar: (id: string, name: string) => void;
  onMoverSerie?: (capId: string, seriesId: string | null) => void;
}) {
  if (!items.length) return <p className="mt-3 text-[11px] text-muted">{vacio}</p>;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border hover:border-accent">
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
          {onMoverSerie && (
            <label className="sr-only" htmlFor={`serie-${p.id}`}>Serie del capítulo</label>
          )}
          {onMoverSerie && (
            <select
              id={`serie-${p.id}`}
              className="input mr-1 max-w-[10.5rem] py-1 text-[11px]"
              disabled={busy}
              value={serieActual ?? ""}
              title="Mover a otra serie o dejar suelto"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = e.target.value;
                onMoverSerie(p.id, v === "" ? null : v);
              }}
            >
              <option value="">Sin serie</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
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
