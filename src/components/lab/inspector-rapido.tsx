"use client";

import { MapPin, Pause, Move, Footprints, CheckSquare, Square } from "lucide-react";
import type { AnimParalaje } from "@/lib/lab/anim-paralaje";

export type ModoEdicionCanvas = "camara" | "colocar" | "punto" | null;

const MOV_CAPA_RAPIDOS = [
  { id: "", label: "Quieto" },
  { id: "flotar", label: "Flotar" },
  { id: "deriva", label: "Deriva" },
  { id: "vaiven", label: "Vaivén" },
  { id: "trayectoria", label: "A → B" },
] as const;

/** Acciones cortas al seleccionar una capa/sprite — sin el formulario eterno. */
export function InspectorRapido({
  esSprite,
  modo,
  onModo,
  moverTodo,
  onMoverTodo,
  volverRuta,
  onVolverRuta,
  voltearDefault,
  onVoltearDefault,
  pausaSeg,
  onPausaSeg,
  onAddPausa,
  onMovCapa,
  movCapaTipo,
  bloqueada,
}: {
  esSprite: boolean;
  modo: ModoEdicionCanvas;
  onModo: (m: ModoEdicionCanvas) => void;
  moverTodo: boolean;
  onMoverTodo: (v: boolean) => void;
  volverRuta: boolean;
  onVolverRuta: (v: boolean) => void;
  voltearDefault: boolean;
  onVoltearDefault: (v: boolean) => void;
  pausaSeg: number;
  onPausaSeg: (n: number) => void;
  onAddPausa: () => void;
  onMovCapa: (tipo: string) => void;
  movCapaTipo?: string;
  bloqueada?: boolean;
}) {
  return (
    <div className={`space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-2 ${bloqueada ? "opacity-55" : ""}`}>
      <p className="text-[10px] font-semibold text-accent">Animar selección</p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        <button
          type="button"
          disabled={bloqueada}
          onClick={() => onModo(modo === "colocar" ? null : "colocar")}
          className={`btn-ghost justify-center px-1 py-1.5 text-[10px] ${modo === "colocar" ? "border-accent bg-accent/15 text-accent" : ""}`}
        >
          <Move className="h-3.5 w-3.5" /> Colocar / arrastrar
        </button>
        {esSprite && (
          <button
            type="button"
            disabled={bloqueada}
            onClick={() => onModo(modo === "punto" ? null : "punto")}
            className={`btn-ghost justify-center px-1 py-1.5 text-[10px] ${modo === "punto" ? "border-accent bg-accent/15 text-accent" : ""}`}
          >
            <MapPin className="h-3.5 w-3.5" /> Puntos de ruta
          </button>
        )}
        {esSprite && (
          <button
            type="button"
            disabled={bloqueada}
            onClick={onAddPausa}
            className="btn-ghost justify-center px-1 py-1.5 text-[10px]"
          >
            <Pause className="h-3.5 w-3.5" /> Pausa {pausaSeg}s
          </button>
        )}
      </div>

      {esSprite && (
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <label className="flex items-center gap-1 text-muted">
            Pausa
            <input
              type="number"
              min={0.2}
              max={30}
              step={0.5}
              value={pausaSeg}
              disabled={bloqueada}
              onChange={(e) => onPausaSeg(Math.max(0.2, Math.min(30, Number(e.target.value) || 1)))}
              className="input w-14 py-0.5 text-[10px]"
            />
            s
          </label>
          <button
            type="button"
            disabled={bloqueada}
            onClick={() => onVolverRuta(!volverRuta)}
            className="btn-ghost px-1.5 py-1 text-[10px]"
            title="Al terminar, vuelve por los mismos puntos"
          >
            {volverRuta ? <CheckSquare className="h-3.5 w-3.5 text-accent" /> : <Square className="h-3.5 w-3.5" />}
            Regresar por la ruta
          </button>
          <button
            type="button"
            disabled={bloqueada}
            onClick={() => onVoltearDefault(!voltearDefault)}
            className="btn-ghost px-1.5 py-1 text-[10px]"
            title="Al cambiar de sentido, voltea el sprite"
          >
            {voltearDefault ? <CheckSquare className="h-3.5 w-3.5 text-accent" /> : <Square className="h-3.5 w-3.5" />}
            Voltear al volver
          </button>
        </div>
      )}

      {!esSprite && (
        <label className="flex items-center gap-1.5 text-[10px] text-muted">
          <Footprints className="h-3.5 w-3.5" />
          Movimiento de capa
          <select
            disabled={bloqueada}
            value={movCapaTipo ?? ""}
            onChange={(e) => onMovCapa(e.target.value)}
            className="input min-w-0 flex-1 py-1 text-[10px]"
          >
            {MOV_CAPA_RAPIDOS.map((o) => (
              <option key={o.id || "quieto"} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      )}

      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <input
          type="checkbox"
          checked={moverTodo}
          disabled={bloqueada}
          onChange={(e) => onMoverTodo(e.target.checked)}
        />
        Arrastrar mueve todas las capas (no solo la seleccionada)
      </label>

      {modo === "punto" && (
        <p className="text-[10px] text-accent">Toca el lienzo para añadir puntos. Cada toque = un tramo.</p>
      )}
      {modo === "colocar" && (
        <p className="text-[10px] text-accent">Arrastra en el lienzo para colocar la selección.</p>
      )}
    </div>
  );
}

export function ParalajeGlobalSimple({
  anim,
  onAnim,
  fuerza,
  onFuerza,
  durSeg,
  onDurSeg,
  pausaSeg,
  onPausaSeg,
  onAplicarCola,
}: {
  anim: AnimParalaje;
  onAnim: (a: AnimParalaje) => void;
  fuerza: number;
  onFuerza: (n: number) => void;
  durSeg: number;
  onDurSeg: (n: number) => void;
  pausaSeg: number;
  onPausaSeg: (n: number) => void;
  onAplicarCola: () => void;
}) {
  return (
    <div className="card space-y-2 p-3">
      <p className="text-xs font-semibold text-fg">Paralaje de toda la escena</p>
      <p className="text-[10px] text-muted">
        Un movimiento de cámara que afecta a todas las capas según su profundidad. Luego puedes pausar y encadenar otro.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] text-muted">
          Tipo
          <select value={anim} onChange={(e) => onAnim(e.target.value as AnimParalaje)} className="input mt-0.5 w-full py-1 text-[11px]">
            <option value="quieto">Quieto</option>
            <option value="suave">Suave</option>
            <option value="izq-der">Izquierda → derecha</option>
            <option value="der-izq">Derecha → izquierda</option>
            <option value="acercar">Acercar</option>
            <option value="alejar">Alejar</option>
            <option value="atravesar">Atravesar</option>
          </select>
        </label>
        <label className="text-[10px] text-muted">
          Fuerza {fuerza}%
          <input type="range" min={0} max={100} value={fuerza} onChange={(e) => onFuerza(Number(e.target.value))} className="mt-1 w-full accent-brand" />
        </label>
        <label className="text-[10px] text-muted">
          Duración (s)
          <input type="number" min={1} max={60} step={0.5} value={durSeg} onChange={(e) => onDurSeg(Math.max(1, Number(e.target.value) || 4))} className="input mt-0.5 w-full py-1 text-[11px]" />
        </label>
        <label className="text-[10px] text-muted">
          Pausa después (s)
          <input type="number" min={0} max={30} step={0.5} value={pausaSeg} onChange={(e) => onPausaSeg(Math.max(0, Number(e.target.value) || 0))} className="input mt-0.5 w-full py-1 text-[11px]" />
        </label>
      </div>
      <button type="button" onClick={onAplicarCola} className="btn-brand text-xs" disabled={anim === "quieto"}>
        Añadir a la cola de cámara
      </button>
    </div>
  );
}
