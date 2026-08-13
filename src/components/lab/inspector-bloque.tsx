"use client";

import { Trash2, X } from "lucide-react";
import { MOV_COLA, type MovCola } from "@/lib/lab/anim-paralaje";
import { reloj, type Bloque, type Pista } from "@/lib/lab/linea-tiempo";
import { Num } from "./controles-basicos";

/**
 * Qué hay dentro de la barra que acabas de pulsar, y cómo cambiarlo.
 *
 * Antes pulsar una barra saltaba a otro sitio: un paso de cámara abría sus
 * ajustes en la pestaña «Cámara» —al final de la página, lejos del punto que
 * estabas mirando— y un actor solo seleccionaba su capa. Los efectos no hacían
 * nada. Así que la línea de tiempo servía para MIRAR y había que irse a otra
 * parte para TOCAR, que es justo lo que vuelve lento editar por eventos.
 *
 * Esto sale pegado a la línea: se pulsa la barra, se ve lo que tiene y se
 * cambia o se borra ahí mismo.
 */

export type SeleccionBloque = { pista: Pista; bloque: Bloque };

export function InspectorBloque({
  seleccion,
  onCerrar,
  paso,
  onPaso,
  onQuitarPaso,
  efecto,
  onQuitarEfecto,
  actor,
  onIrAlActor,
  onQuitarActor,
}: {
  seleccion: SeleccionBloque;
  onCerrar: () => void;
  /** El paso de cámara, si la barra es de cámara. */
  paso?: { id: string; mov: MovCola; distancia: number; durMs: number } | null;
  onPaso?: (id: string, patch: { mov?: MovCola; distancia?: number; durMs?: number }) => void;
  onQuitarPaso?: (id: string) => void;
  /** El efecto, si la barra es de efectos. */
  efecto?: { id: string; nombre: string; sitio: string } | null;
  onQuitarEfecto?: (id: string) => void;
  /** El actor y el tramo pulsado, si la barra es de un sprite. */
  actor?: { capaId: string; nombre: string } | null;
  onIrAlActor?: (capaId: string) => void;
  onQuitarActor?: (capaId: string) => void;
}) {
  const { pista, bloque } = seleccion;

  return (
    <div className="space-y-2 rounded-lg border border-accent/50 bg-accent/5 p-2">
      <div className="flex items-center gap-2">
        {/* Sin repetir: en un efecto la pista y el bloque se llaman igual, y
            salía «Humo · Humo». */}
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-accent">
          {pista.nombre === bloque.etiqueta ? pista.nombre : `${pista.nombre} · ${bloque.etiqueta}`}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted">
          {reloj(bloque.desde)} → {reloj(bloque.hasta)}
        </span>
        <button type="button" onClick={onCerrar} className="shrink-0 text-muted hover:text-fg"
          aria-label="Cerrar los ajustes de esta barra">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {paso && onPaso && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-muted">
            Movimiento
            <select
              value={paso.mov}
              onChange={(e) => onPaso(paso.id, { mov: e.target.value as MovCola })}
              className="input mt-0.5 block py-0.5 text-[10px]"
            >
              {MOV_COLA.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <Num etiqueta="Distancia" valor={paso.distancia} min={5} max={100} paso={5}
            sufijo="%" ancho="w-14"
            onCambio={(v) => onPaso(paso.id, { distancia: Math.round(v) })} />
          <Num etiqueta="Dura" valor={paso.durMs / 1000} min={0.8} max={30} paso={0.5}
            sufijo="s" ancho="w-14"
            onCambio={(v) => onPaso(paso.id, { durMs: Math.round(v * 1000) })} />
          {onQuitarPaso && (
            <button type="button" onClick={() => onQuitarPaso(paso.id)}
              className="ml-auto rounded-md border border-border px-1.5 py-1 text-[10px] text-muted hover:border-danger/60 hover:text-danger">
              <Trash2 className="mr-1 inline h-3 w-3" />Quitar paso
            </button>
          )}
        </div>
      )}

      {efecto && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted">{efecto.sitio}</span>
          {/* Los efectos aún no se pueden temporizar: se dice, en vez de
              enseñar unos mandos de principio y fin que el motor ignoraría. */}
          <span className="text-[9px] text-muted">Suena durante toda la escena.</span>
          {onQuitarEfecto && (
            <button type="button" onClick={() => onQuitarEfecto(efecto.id)}
              className="ml-auto rounded-md border border-border px-1.5 py-1 text-[10px] text-muted hover:border-danger/60 hover:text-danger">
              <Trash2 className="mr-1 inline h-3 w-3" />Quitar efecto
            </button>
          )}
        </div>
      )}

      {actor && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted">
            {bloque.clase === "cambiar" ? "Cambia de animación aquí"
              : bloque.clase === "pausa" ? "Se queda quieto"
                : bloque.clase === "voltear" ? "Se da la vuelta"
                  : "Se desplaza"}
            {bloque.nota ? ` · ${bloque.nota}` : ""}
          </span>
          {onIrAlActor && (
            <button type="button" onClick={() => onIrAlActor(actor.capaId)}
              className="rounded-md border border-accent/40 px-1.5 py-1 text-[10px] text-accent hover:bg-accent/10">
              Abrir sus mandos
            </button>
          )}
          {onQuitarActor && (
            <button type="button" onClick={() => onQuitarActor(actor.capaId)}
              className="ml-auto rounded-md border border-border px-1.5 py-1 text-[10px] text-muted hover:border-danger/60 hover:text-danger">
              <Trash2 className="mr-1 inline h-3 w-3" />Quitar actor
            </button>
          )}
        </div>
      )}
    </div>
  );
}
