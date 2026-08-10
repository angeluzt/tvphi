"use client";

import { Layers, Lock, LockOpen, Eye, EyeOff, X, Trash2 } from "lucide-react";
import { Barra } from "./controles-basicos";

// El panel de «varias capas a la vez».
//
// POR QUÉ EXISTE. El paralaje es lo que más se pide y era lo más pesado de
// hacer: no es una propiedad de una capa, es la relación entre varias, y para
// conseguirlo había que abrir capa por capa y teclear una profundidad a ojo en
// cada una. Con cinco capas eso son cinco viajes por el panel, mirar el
// resultado, y volver a hacer los cinco porque la tercera se ve pegada a la
// segunda.
//
// Aquí se marcan las capas y se decide UNA vez qué relación tienen entre
// ellas: escalonadas (se separan, hay profundidad) o a la misma distancia (se
// mueven como si fueran un solo dibujo). Es literalmente lo que se pidió:
// «seleccionar n capas y aplicarle un paralaje, otros moverse junto o
// separarse».
//
// No sabe nada del canvas ni del estado del montaje: recibe la lista y avisa.

export interface CapaDelPanel {
  id: string;
  nombre: string;
  depth: number;
  visible: boolean;
  bloqueada?: boolean;
  /** Para avisar de a cuáles se les va a pisar una animación que ya tenían. */
  tieneMov: boolean;
}

export function PanelGrupo({
  capas, seleccion, onSeleccion,
  fondo, frente, onFondo, onFrente,
  onEscalonar, onJuntas,
  nombreOrigen, puedeCopiar, desacompasar, onDesacompasar, onCopiarMov,
  onQuitarMov, onBloquear, onVisible,
}: {
  capas: CapaDelPanel[];
  seleccion: string[];
  onSeleccion: (ids: string[]) => void;
  fondo: number;
  frente: number;
  onFondo: (v: number) => void;
  onFrente: (v: number) => void;
  onEscalonar: () => void;
  onJuntas: () => void;
  /** La capa cuya animación se copiaría; null si la activa no tiene ninguna. */
  nombreOrigen: string | null;
  puedeCopiar: boolean;
  desacompasar: boolean;
  onDesacompasar: (v: boolean) => void;
  onCopiarMov: () => void;
  onQuitarMov: () => void;
  onBloquear: (bloquear: boolean) => void;
  onVisible: (visible: boolean) => void;
}) {
  const n = seleccion.length;
  const dentro = capas.filter((c) => seleccion.includes(c.id));
  const bloqueadas = dentro.filter((c) => c.bloqueada).length;
  const utiles = n - bloqueadas;

  const alternar = (id: string) =>
    onSeleccion(seleccion.includes(id) ? seleccion.filter((s) => s !== id) : [...seleccion, id]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-accent" />
        <span className="label">Grupo</span>
        <span className="chip bg-surface-2 text-muted">{n}</span>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => onSeleccion(capas.map((c) => c.id))}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2">
            Todas
          </button>
          <button type="button" onClick={() => onSeleccion(capas.filter((c) => c.visible && !c.bloqueada).map((c) => c.id))}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2">
            Visibles
          </button>
          <button type="button" onClick={() => onSeleccion([])} disabled={!n}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2 disabled:opacity-30">
            Vaciar
          </button>
        </div>
      </div>

      {/* La lista es la selección. Un panel que solo dijera «3 capas» obligaría
          a subir a la columna de capas para saber CUÁLES, y con nombres largos
          esa columna vive truncada. */}
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border/70 bg-surface-2/30 p-1">
        {capas.map((c) => {
          const marcada = seleccion.includes(c.id);
          return (
            <label key={c.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] ${
                marcada ? "bg-accent/15 text-fg" : "text-muted hover:bg-surface-2"
              }`}>
              <input type="checkbox" checked={marcada} onChange={() => alternar(c.id)}
                className="h-3 w-3 shrink-0 accent-accent"
                aria-label={`${marcada ? "Quitar" : "Añadir"} ${c.nombre} del grupo`} />
              <span className="min-w-0 flex-1 truncate" title={c.nombre}>{c.nombre}</span>
              {c.tieneMov && (
                <span className="shrink-0 text-[8px] text-accent" title="Ya tiene animación propia">●</span>
              )}
              {c.bloqueada && <Lock className="h-3 w-3 shrink-0 text-gold" />}
              {!c.visible && <EyeOff className="h-3 w-3 shrink-0 opacity-60" />}
              <span className="shrink-0 tabular-nums opacity-60">{c.depth.toFixed(2)}</span>
            </label>
          );
        })}
        {!capas.length && <p className="p-1 text-[10px] text-muted">Todavía no hay capas.</p>}
      </div>

      {n > 0 && bloqueadas > 0 && (
        <p className="text-[10px] text-gold">
          {bloqueadas} de las {n} está{bloqueadas === 1 ? "" : "n"} bloqueada{bloqueadas === 1 ? "" : "s"}:
          el candado gana también en grupo.
        </p>
      )}

      <fieldset disabled={utiles < 1} className="space-y-2 disabled:opacity-45">
        <div className="rounded-lg border border-border/70 bg-surface-2/30 p-2">
          <p className="mb-1 text-[11px] font-medium">Paralaje del grupo</p>
          <p className="mb-1.5 text-[10px] text-muted">
            «Separarlas» reparte la distancia entre la primera y la última del grupo, en el orden de
            la pila: cada una se mueve distinto y aparece el fondo. «Juntas» les da la misma y se
            comportan como un solo dibujo.
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            <Barra etiqueta="Más lejos" valor={fondo} max={1} paso={0.01}
              onCambio={onFondo} formato={(v) => v.toFixed(2)} />
            <Barra etiqueta="Más cerca" valor={frente} max={1} paso={0.01}
              onCambio={onFrente} formato={(v) => v.toFixed(2)} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button type="button" onClick={onEscalonar}
              className="flex-1 rounded-lg border border-accent/60 bg-accent/10 py-1 text-[11px] font-medium text-accent hover:bg-accent/20">
              Separarlas ({utiles})
            </button>
            <button type="button" onClick={onJuntas}
              className="flex-1 rounded-lg border border-accent/60 bg-accent/10 py-1 text-[11px] font-medium text-accent hover:bg-accent/20">
              Juntas, a {fondo.toFixed(2)}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-surface-2/30 p-2">
          <p className="mb-1 text-[11px] font-medium">Animación del grupo</p>
          <button type="button" onClick={onCopiarMov} disabled={!puedeCopiar}
            className="w-full rounded-lg border border-accent/60 bg-accent/10 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:border-border disabled:bg-transparent disabled:text-muted">
            {nombreOrigen
              ? `Copiar la animación de «${nombreOrigen}»`
              : "La capa activa no tiene animación que copiar"}
          </button>
          <label className="mt-1 flex items-center gap-1.5 text-[10px] text-muted">
            <input type="checkbox" checked={desacompasar} onChange={(e) => onDesacompasar(e.target.checked)}
              className="h-3 w-3 accent-accent" />
            Desacompasarlas · sin esto, varias capas meciéndose a la vez parecen una sola temblando
          </label>
          <button type="button" onClick={onQuitarMov}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-border py-1 text-[11px] text-muted hover:bg-surface-2">
            <Trash2 className="h-3 w-3" /> Dejarlas quietas
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => onBloquear(true)}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2">
            <Lock className="h-3 w-3" /> Bloquear
          </button>
          <button type="button" onClick={() => onBloquear(false)}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2">
            <LockOpen className="h-3 w-3" /> Soltar
          </button>
          <button type="button" onClick={() => onVisible(false)}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2">
            <EyeOff className="h-3 w-3" /> Ocultar
          </button>
          <button type="button" onClick={() => onVisible(true)}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2">
            <Eye className="h-3 w-3" /> Mostrar
          </button>
        </div>
      </fieldset>

      {!n && (
        <p className="flex items-center gap-1 text-[10px] text-muted">
          <X className="h-3 w-3" /> Marca capas arriba para poder aplicarles algo en bloque.
        </p>
      )}
    </div>
  );
}
