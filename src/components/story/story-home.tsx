"use client";

import { useEffect, useId, useState } from "react";
import { Plus, Folder, FolderOpen, Film, ChevronLeft, Trash2, Loader2, Users, FileUp } from "lucide-react";
import { IaPanel } from "./ia-panel";
import { ComoFunciona } from "./como-funciona";
import type { CupoHistorias } from "./story-app";

// Pantalla de entrada: primero se elige DÓNDE se va a trabajar, y solo después
// se abre el editor.
//
// Crear con IA va ARRIBA del todo, que es a lo que viene casi todo el mundo.
// Estaba al final, debajo de las series y de los capítulos sueltos, así que
// había que bajar hasta el fondo para encontrar lo principal.
//
// El aviso del cupo estaba aquí Y dentro del panel de IA, diciendo lo mismo dos
// veces. Se queda solo el de dentro, que es donde importa.
//
// Asignar / mover / soltar un capítulo siempre pasa por una ventana: se elige
// qué hacer y se confirma. Así no se mueve nada por un toque accidental.

export interface SerieMeta { id: string; name: string; capitulos: number; personajes: number }
export interface CapMeta { id: string; name: string; updatedAt: string; seriesId?: string | null }

export function StoryHome({
  series, proyectos, cupo, busy,
  onAbrir, onNuevoCapitulo, onNuevaSerie, onBorrar, onGenerado, onImportarZip, onCupo,
  onMoverSerie, serieInicial, onSerieVista,
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
  /** Serie abierta al cargar (p. ej. tras un reload con ?serie=). */
  serieInicial?: string | null;
  /** Avisa al padre qué carpeta de serie se está viendo (para la URL). */
  onSerieVista?: (seriesId: string | null) => void;
}) {
  // null = viendo las series; una cadena = dentro de esa serie.
  const [dentro, setDentro] = useState<string | null>(serieInicial ?? null);
  const sueltos = proyectos.filter((p) => !p.seriesId);

  function irSerie(id: string | null) {
    setDentro(id);
    onSerieVista?.(id);
  }

  if (dentro === null) {
    return (
      <div className="tool-ui space-y-4">
        <IaPanel onGenerado={onGenerado} cupo={cupo} onCupo={onCupo} />
        <ComoFunciona />

        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Tus series</span>
            <button onClick={onNuevaSerie} disabled={busy} className="btn-brand ml-auto text-xs disabled:opacity-40">
              <Plus className="h-4 w-4" /> Serie nueva
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Agrupa los capítulos de una misma historia y sus personajes. Un video suelto no la necesita.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {series.map((s) => (
              <button
                key={s.id}
                onClick={() => irSerie(s.id)}
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
                Ninguna todavía.
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
            vacio="Nada suelto: todo está dentro de una serie."
          />
        </div>
      </div>
    );
  }

  const serie = series.find((s) => s.id === dentro);
  const caps = proyectos.filter((p) => p.seriesId === dentro);
  return (
    <div className="tool-ui space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => irSerie(null)} className="btn-ghost text-xs">
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
          vacio="Sin capítulos todavía."
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
  const [dialogo, setDialogo] = useState<CapMeta | null>(null);

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
            <button
              type="button"
              disabled={busy}
              className="btn-ghost shrink-0 text-xs disabled:opacity-40"
              title={serieActual ? "Desasignar o mover a otra serie" : "Asignar este capítulo a una serie"}
              onClick={(e) => { e.stopPropagation(); setDialogo(p); }}
            >
              <Folder className="h-3.5 w-3.5 text-accent" />
              {serieActual ? "Cambiar serie" : "Asignar a serie"}
            </button>
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

      {dialogo && onMoverSerie && (
        <DialogoSerie
          capitulo={dialogo}
          series={series}
          serieActual={serieActual}
          busy={busy}
          onCancelar={() => setDialogo(null)}
          onAceptar={(seriesId) => {
            const id = dialogo.id;
            setDialogo(null);
            onMoverSerie(id, seriesId);
          }}
        />
      )}
    </div>
  );
}

function DialogoSerie({
  capitulo, series, serieActual, busy, onCancelar, onAceptar,
}: {
  capitulo: CapMeta;
  series: SerieMeta[];
  serieActual: string | null;
  busy: boolean;
  onCancelar: () => void;
  onAceptar: (seriesId: string | null) => void;
}) {
  const tituloId = useId();
  const tieneSerie = !!serieActual;
  const otras = series.filter((s) => s.id !== serieActual);
  // Destino: "" = desasignar; id = esa serie. Por defecto, primera opción útil.
  const [elegida, setElegida] = useState<string>(
    tieneSerie ? (otras[0]?.id ?? "") : (series[0]?.id ?? ""),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancelar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancelar]);

  const destinoValido = elegida === ""
    ? tieneSerie
    : series.some((s) => s.id === elegida && s.id !== serieActual);
  const puedeAceptar = !busy && destinoValido;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onCancelar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="card w-full max-w-md space-y-3 p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={tituloId} className="text-sm font-semibold text-fg">
          {tieneSerie ? "¿Qué hacer con este capítulo?" : "¿A qué serie lo asignas?"}
        </h2>
        <p className="text-xs text-muted">
          <span className="font-medium text-fg">{capitulo.name}</span>
          {tieneSerie
            ? " · Confirma si lo desasignas o lo mueves a otra serie."
            : " · Elige una serie y pulsa Aceptar."}
        </p>

        {!tieneSerie && !series.length ? (
          <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
            Aún no hay series. Crea una primero y vuelve a intentarlo.
          </p>
        ) : tieneSerie && !otras.length ? (
          <fieldset className="space-y-1.5" disabled={busy}>
            <legend className="sr-only">Destino del capítulo</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input
                type="radio"
                name="destino-serie"
                className="mt-1"
                checked={elegida === ""}
                onChange={() => setElegida("")}
              />
              <span>
                <span className="block font-medium">Desasignar</span>
                <span className="block text-[11px] text-muted">Queda suelto, sin serie</span>
              </span>
            </label>
            <p className="px-1 text-[11px] text-muted">No hay otra serie a la que moverlo.</p>
          </fieldset>
        ) : (
          <fieldset className="space-y-1.5" disabled={busy}>
            <legend className="sr-only">Destino del capítulo</legend>
            {tieneSerie && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <input
                  type="radio"
                  name="destino-serie"
                  className="mt-1"
                  checked={elegida === ""}
                  onChange={() => setElegida("")}
                />
                <span>
                  <span className="block font-medium">Desasignar</span>
                  <span className="block text-[11px] text-muted">Queda suelto, sin serie</span>
                </span>
              </label>
            )}
            {(tieneSerie ? otras : series).map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="destino-serie"
                  className="mt-1"
                  checked={elegida === s.id}
                  onChange={() => setElegida(s.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {tieneSerie ? `Mover a «${s.name}»` : s.name}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {s.capitulos} {s.capitulos === 1 ? "capítulo" : "capítulos"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1 text-sm" onClick={onCancelar} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-brand flex-1 text-sm disabled:opacity-40"
            disabled={!puedeAceptar}
            onClick={() => onAceptar(elegida === "" ? null : elegida)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aceptar
          </button>
        </div>
      </div>
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
