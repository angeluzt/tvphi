"use client";

import { Sparkles, Trash2, MapPin, X } from "lucide-react";
import { VFX } from "@/lib/story/vfx";
import { nombreEfecto, type EfectoEscena } from "@/lib/lab/efectos-escena";

// Los efectos del motor colgados de la escena.
//
// Hasta ahora la IA los escribía, viajaban en el ZIP y no se pintaban ni se
// veían por ningún sitio: no había forma de saber que existían, y menos de
// quitar uno que quedara mal.
//
// LOS DE ATAJO son los que se piden a mano una y otra vez. El catálogo entero
// tiene más de treinta y está en el desplegable; poner los treinta como botones
// convertiría el panel en una pared.

const ATAJOS = ["fuego", "humo", "lluvia", "nieve", "niebla", "chispas", "polvo", "estrellas"] as const;

export function PanelEfectos({
  efectos,
  pendiente,
  onPendiente,
  onQuitar,
}: {
  efectos: EfectoEscena[];
  /** El efecto elegido, esperando un toque en la escena para plantarse. */
  pendiente: string | null;
  onPendiente: (kind: string | null) => void;
  onQuitar: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-surface-2/40 p-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-[11px] font-medium text-fg">Efectos del motor</span>
        {!!efectos.length && (
          <span className="ml-auto rounded bg-surface-2 px-1.5 text-[9px] tabular-nums text-muted">
            {efectos.length}
          </span>
        )}
      </div>

      {pendiente ? (
        <div className="flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-2 py-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 animate-pulse text-accent" />
          <span className="min-w-0 flex-1 text-[10px] text-accent">
            Toca la escena para poner {nombreEfecto(pendiente as never).toLowerCase()}.
          </span>
          <button
            type="button"
            onClick={() => onPendiente(null)}
            className="shrink-0 text-muted hover:text-fg"
            aria-label="Cancelar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {ATAJOS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPendiente(k)}
                className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-fg"
              >
                {nombreEfecto(k)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-muted">
            Todos
            <select
              value=""
              onChange={(e) => { if (e.target.value) onPendiente(e.target.value); }}
              className="input min-w-0 flex-1 py-0.5 text-[10px]"
              aria-label="Catálogo de efectos"
            >
              <option value="">— elige uno —</option>
              {VFX.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {!efectos.length && !pendiente && (
        <p className="text-[10px] text-muted">
          Nada todavía. Los que escriba la IA aparecen aquí, y los que pongas a mano también.
        </p>
      )}

      {!!efectos.length && (
        <ul className="space-y-1">
          {efectos.map((e) => (
            <li key={e.id} className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: e.colorHex }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[10px]">
                {nombreEfecto(e.kind)}
                <span className="text-muted">
                  {" · "}
                  {/* Decir cuál sigue a la cámara y cuál no evita la pregunta
                      de por qué la lluvia no se mueve al panear. */}
                  {e.espacio === "encuadre" ? "llena el cuadro" : `pegado (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onQuitar(e.id)}
                className="shrink-0 text-muted hover:text-danger"
                title={`Quitar ${nombreEfecto(e.kind)}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
