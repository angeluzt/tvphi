"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Trash2, X } from "lucide-react";
import { SEMANTICO_LABEL, type Escena, type Semantico } from "@/lib/lab/escena";
import {
  borrarObjeto, cajaDeObjeto, cambiarObjeto, duplicarObjeto, moverObjeto,
  moverObjetoDeCapa, redimensionarObjeto, type Golpe,
} from "@/lib/lab/geometria-mapa";

// Los mandos de la forma que está cogida.
//
// El arrastre sirve para colocar «por ahí»; esto es para lo que el arrastre no
// puede: afinar con las flechas, cambiar qué ES la forma —de «objeto» a
// «vegetación», que cambia su color y lo que se le pide a la IA—, mandarla a
// otra capa para que se mueva con otra profundidad, duplicarla y borrarla.
//
// El paso de las flechas es 1% del cuadro: bastante para notarse, poco para no
// pasarse. Con Mayúsculas va de 5 en 5, que es lo que se quiere al recolocar.

const PASO = 0.01;
const PASO_LARGO = 0.05;

export function InspectorForma({ esc, seleccion, onEscena, onSeleccion }: {
  esc: Escena;
  seleccion: Golpe;
  onEscena: (e: Escena) => void;
  onSeleccion: (g: Golpe | null) => void;
}) {
  const capa = esc.layers.find((c) => c.id === seleccion.capaId);
  const obj = capa?.objects.find((o) => o.id === seleccion.objetoId);
  // Puede desaparecer bajo los pies: la IA reescribe el mapa, o se deshace un
  // borrado. Antes de dar por hecho que existe, se comprueba.
  if (!capa || !obj) return null;

  const c = cajaDeObjeto(obj);
  const editar = (f: Parameters<typeof cambiarObjeto>[3]) =>
    onEscena(cambiarObjeto(esc, capa.id, obj.id, f));
  const empujar = (dx: number, dy: number) => editar((o) => moverObjeto(o, dx, dy));

  return (
    <div className="space-y-2 rounded-xl border border-accent/50 bg-accent/5 p-2">
      <div className="flex items-center gap-1.5">
        <span className="label text-accent">Forma cogida</span>
        <code className="min-w-0 flex-1 truncate text-[10px] text-muted" title={obj.id}>{obj.id}</code>
        <button type="button" onClick={() => onSeleccion(null)}
          className="rounded border border-border p-0.5 text-muted hover:text-fg"
          aria-label="Soltar la forma">
          <X className="h-3 w-3" />
        </button>
      </div>

      <label className="block text-[10px] text-muted">
        Etiqueta · es lo que lee la IA
        <input
          className="input mt-0.5 w-full py-1 text-[11px]"
          value={obj.label ?? ""}
          placeholder={SEMANTICO_LABEL[obj.semantic]}
          onChange={(e) => editar((o) => ({ ...o, label: e.target.value.slice(0, 80) || undefined }))}
        />
      </label>

      <div className="grid grid-cols-2 gap-1">
        <label className="text-[10px] text-muted">
          Qué es
          <select
            className="input mt-0.5 w-full py-1 text-[10px]"
            value={obj.semantic}
            onChange={(e) => editar((o) => ({ ...o, semantic: e.target.value as Semantico }))}
          >
            {(Object.keys(SEMANTICO_LABEL) as Semantico[]).map((s) => (
              <option key={s} value={s}>{SEMANTICO_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-muted">
          En la capa
          <select
            className="input mt-0.5 w-full py-1 text-[10px]"
            value={capa.id}
            onChange={(e) => {
              onEscena(moverObjetoDeCapa(esc, capa.id, e.target.value, obj.id));
              onSeleccion({ capaId: e.target.value, objetoId: obj.id });
            }}
          >
            {esc.layers.map((x) => (
              <option key={x.id} value={x.id}>{x.name} · {x.depth}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Las flechas afinan lo que el dedo no acierta. Con Mayúsculas, de 5 en 5. */}
      <div className="flex items-center gap-2">
        <div className="grid shrink-0 grid-cols-3 gap-0.5">
          <span />
          <Flecha etiqueta="Subir" onPulsa={(largo) => empujar(0, -(largo ? PASO_LARGO : PASO))}>
            <ArrowUp className="h-3 w-3" />
          </Flecha>
          <span />
          <Flecha etiqueta="Izquierda" onPulsa={(largo) => empujar(-(largo ? PASO_LARGO : PASO), 0)}>
            <ArrowLeft className="h-3 w-3" />
          </Flecha>
          <span />
          <Flecha etiqueta="Derecha" onPulsa={(largo) => empujar(largo ? PASO_LARGO : PASO, 0)}>
            <ArrowRight className="h-3 w-3" />
          </Flecha>
          <span />
          <Flecha etiqueta="Bajar" onPulsa={(largo) => empujar(0, largo ? PASO_LARGO : PASO)}>
            <ArrowDown className="h-3 w-3" />
          </Flecha>
          <span />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex gap-1">
            <button type="button"
              onClick={() => editar((o) => redimensionarObjeto(o, {
                x: c.x - c.w * 0.05, y: c.y - c.h * 0.05, w: c.w * 1.1, h: c.h * 1.1,
              }))}
              className="flex-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2 hover:text-fg">
              Más grande
            </button>
            <button type="button"
              onClick={() => editar((o) => redimensionarObjeto(o, {
                x: c.x + c.w * 0.045, y: c.y + c.h * 0.045, w: c.w * 0.91, h: c.h * 0.91,
              }))}
              className="flex-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2 hover:text-fg">
              Más pequeña
            </button>
          </div>
          <p className="text-[9px] tabular-nums text-muted">
            x {c.x.toFixed(2)} · y {c.y.toFixed(2)} · {(c.w * 100).toFixed(0)}×{(c.h * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="flex gap-1">
        <button type="button"
          onClick={() => {
            const { escena, nuevoId } = duplicarObjeto(esc, capa.id, obj.id);
            onEscena(escena);
            // Se salta a la COPIA: es la que se va a colocar ahora mismo, y
            // dejar seleccionada la original hace que el siguiente arrastre
            // mueva justo la que ya estaba bien.
            if (nuevoId) onSeleccion({ capaId: capa.id, objetoId: nuevoId });
          }}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-border py-1 text-[10px] text-muted hover:bg-surface-2 hover:text-fg">
          <Copy className="h-3 w-3" /> Duplicar
        </button>
        <button type="button"
          onClick={() => { onEscena(borrarObjeto(esc, capa.id, obj.id)); onSeleccion(null); }}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-danger/50 py-1 text-[10px] text-danger hover:bg-danger/10">
          <Trash2 className="h-3 w-3" /> Borrar
        </button>
      </div>
    </div>
  );
}

function Flecha({ etiqueta, onPulsa, children }: {
  etiqueta: string;
  onPulsa: (largo: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${etiqueta} · con Mayúsculas, cinco veces más`}
      aria-label={etiqueta}
      onClick={(e) => onPulsa(e.shiftKey)}
      className="rounded border border-border p-1 text-muted hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </button>
  );
}
