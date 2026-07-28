"use client";

import { nanoid } from "nanoid";
import {
  Plus, Trash2, Wand2, Volume2, Sticker, Image as ImageIcon, ChevronUp, ChevronDown, Clock,
} from "lucide-react";
import { MotionEditor } from "./motion-editor";
import { Slider } from "./slider";
import {
  newDialogue, shotDur,
  type Shot, type Dialogue, type ShotSfx, type PngOverlay,
  type TransitionKind, type OverlayTransition, type OverlayMotion,
} from "@/lib/story/model";

// Panel de una sub-escena (toma): movimiento, duración, transición de entrada,
// diálogos narrados, efectos de sonido y stickers.
export function ShotEditor({
  shot,
  index,
  imageId,
  imgW,
  imgH,
  canMove,
  expanded,
  busyDialogue,
  selectedOverlay,
  onChange,
  onDelete,
  onMove,
  onToggle,
  onGenVoice,
  onAddSfx,
  onAddSticker,
  onSelectOverlay,
}: {
  shot: Shot;
  index: number;
  imageId: string;
  imgW: number;
  imgH: number;
  canMove: boolean;
  expanded: boolean;
  busyDialogue: string | null;
  selectedOverlay: string | null;
  onChange: (s: Shot) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onGenVoice: (d: Dialogue) => void;
  onAddSfx: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddSticker: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectOverlay: (id: string | null) => void;
}) {
  const dur = shotDur(shot);

  const updDialogue = (id: string, patch: Partial<Dialogue>) =>
    onChange({ ...shot, dialogues: shot.dialogues.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const updSfx = (id: string, patch: Partial<ShotSfx>) =>
    onChange({ ...shot, sfx: shot.sfx.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const updOverlay = (id: string, patch: Partial<PngOverlay>) =>
    onChange({ ...shot, overlays: shot.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  return (
    <div className={`rounded-xl border bg-surface-2/40 p-3 ${expanded ? "border-brand/60" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="chip bg-brand/15 text-brand">Toma {index + 1}</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Clock className="h-3 w-3" /> {dur.toFixed(1)}s
          </span>
          {!expanded && (
            <span className="truncate text-xs text-muted">
              · {shot.motionMode === "preset" ? MOTION_LABEL[shot.preset.kind] : "Libre 1→2"}
              {shot.holdSec > 0 ? ` · pausa ${shot.holdSec.toFixed(1)}s` : ""}
              {shot.dialogues.length ? ` · ${shot.dialogues.length} diálogo${shot.dialogues.length > 1 ? "s" : ""}` : ""}
              {shot.sfx.length ? ` · ${shot.sfx.length} sonido${shot.sfx.length > 1 ? "s" : ""}` : ""}
              {shot.overlays.length ? ` · ${shot.overlays.length} PNG` : ""}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          {canMove && (
            <>
              <button onClick={() => onMove(-1)} className="text-muted hover:text-fg" title="Subir toma"><ChevronUp className="h-4 w-4" /></button>
              <button onClick={() => onMove(1)} className="text-muted hover:text-fg" title="Bajar toma"><ChevronDown className="h-4 w-4" /></button>
            </>
          )}
          <button onClick={onDelete} className="text-muted hover:text-danger" title="Borrar toma"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onToggle} className="text-muted hover:text-fg" title={expanded ? "Contraer" : "Editar toma"}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!expanded ? null : (
      <>
      {/* Movimiento */}
      <div className="mt-3">
        <MotionEditor shot={shot} imageId={imageId} imgW={imgW} imgH={imgH} onChange={onChange} />
      </div>

      {/* Tiempo: la duración marca la velocidad del movimiento */}
      <div className="mt-3 rounded-xl border border-border p-2.5">
        <span className="label">Tiempo</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-0.5 text-xs">
            <span className="text-muted">Duración</span>
            <select
              className="input"
              value={shot.autoDuration ? "auto" : "fija"}
              onChange={(e) => onChange({ ...shot, autoDuration: e.target.value === "auto", durationSec: dur })}
            >
              <option value="auto">Según los diálogos</option>
              <option value="fija">Fija</option>
            </select>
          </label>
          <label className="space-y-0.5 text-xs">
            <span className="text-muted">Segundos</span>
            <input
              type="number" step={0.1} min={0.3} className="input"
              value={shot.autoDuration ? dur.toFixed(1) : shot.durationSec}
              disabled={shot.autoDuration}
              onChange={(e) => onChange({ ...shot, durationSec: Math.max(0.3, Number(e.target.value)) })}
            />
          </label>
        </div>
        <div className="mt-2">
          <Slider
            label="Pausa al final (imagen quieta en el punto 2)"
            value={shot.holdSec} min={0} max={Math.max(1, dur)} step={0.1}
            onChange={(v) => onChange({ ...shot, holdSec: v })}
            format={(v) => `${v.toFixed(1)}s`}
            hint={`El movimiento dura ${Math.max(0.1, dur - shot.holdSec).toFixed(1)}s y luego se queda quieto`}
          />
        </div>
      </div>

      {/* Entrada desde la toma anterior */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-xs">
          <span className="text-muted">Entrada desde la toma anterior</span>
          <select
            className="input"
            value={shot.transition}
            onChange={(e) => onChange({ ...shot, transition: e.target.value as TransitionKind })}
          >
            <option value="cut">Corte</option>
            <option value="fade">Fundido</option>
            <option value="slide">Deslizar</option>
          </select>
        </label>
        <label className="space-y-0.5 text-xs">
          <span className="text-muted">Duración de la entrada (s)</span>
          <input
            type="number" step={0.1} min={0} max={5} className="input"
            value={shot.transitionDur}
            disabled={shot.transition === "cut"}
            onChange={(e) => onChange({ ...shot, transitionDur: Math.max(0, Number(e.target.value)) })}
          />
        </label>
      </div>

      {/* Diálogos */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="label">Diálogos (voz IA)</span>
          <button
            onClick={() => onChange({ ...shot, dialogues: [...shot.dialogues, newDialogue(nextStart(shot))] })}
            className="btn-ghost ml-auto text-xs"
          >
            <Plus className="h-3.5 w-3.5 text-accent" /> Añadir diálogo
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {shot.dialogues.map((d, i) => (
            <div key={d.id} className="rounded-lg border border-border p-2">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-[11px] text-muted">{i + 1}</span>
                <textarea
                  className="input min-h-[46px] flex-1 text-sm" rows={2}
                  placeholder="Texto que narra la voz (no se ve en el video)…"
                  value={d.text}
                  onChange={(e) => updDialogue(d.id, { text: e.target.value })}
                />
                <button
                  onClick={() => onChange({ ...shot, dialogues: shot.dialogues.filter((x) => x.id !== d.id) })}
                  className="mt-1 text-muted hover:text-danger"
                ><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button onClick={() => onGenVoice(d)} disabled={busyDialogue === d.id} className="btn-ghost text-xs">
                  <Wand2 className="h-3.5 w-3.5 text-accent" />
                  {busyDialogue === d.id ? "Generando…" : d.audioId ? "Regenerar voz" : "Generar voz"}
                </button>
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  Empieza a los
                  <input
                    type="number" step={0.1} min={0} className="input w-20 py-0.5"
                    value={d.startSec}
                    onChange={(e) => updDialogue(d.id, { startSec: Math.max(0, Number(e.target.value)) })}
                  />
                  s
                </label>
                {d.audioId ? (
                  <span className="text-[11px] text-muted">🔊 {d.dur.toFixed(1)}s</span>
                ) : (
                  <span className="text-[11px] text-muted">sin voz aún</span>
                )}
              </div>
            </div>
          ))}
          {!shot.dialogues.length && (
            <p className="text-[11px] text-muted">Sin diálogos: la toma dura lo que marques a mano.</p>
          )}
        </div>
      </div>

      {/* Efectos de sonido de la toma */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="label">Sonidos de esta toma</span>
          <label className="btn-ghost ml-auto cursor-pointer text-xs">
            <Volume2 className="h-3.5 w-3.5 text-accent" /> Añadir sonido
            <input type="file" accept="audio/*" className="hidden" onChange={onAddSfx} />
          </label>
        </div>
        <div className="mt-2 space-y-1">
          {shot.sfx.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
              <Volume2 className="h-3.5 w-3.5 text-accent" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <label className="flex items-center gap-1 text-[11px] text-muted">
                a los
                <input
                  type="number" step={0.1} min={0} className="input w-16 py-0.5"
                  value={s.startSec}
                  onChange={(e) => updSfx(s.id, { startSec: Math.max(0, Number(e.target.value)) })}
                />
                s
              </label>
              <input
                type="range" min={0} max={1} step={0.05} value={s.volume}
                onChange={(e) => updSfx(s.id, { volume: Number(e.target.value) })}
                className="w-20" title="Volumen"
              />
              <button
                onClick={() => onChange({ ...shot, sfx: shot.sfx.filter((x) => x.id !== s.id) })}
                className="text-muted hover:text-danger"
              ><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {!shot.sfx.length && (
            <p className="text-[11px] text-muted">Golpes, choques, ambiente… suenan en el momento que marques dentro de la toma.</p>
          )}
        </div>
      </div>

      {/* Stickers PNG */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="label">Imágenes encima (PNG)</span>
          <label className="btn-ghost ml-auto cursor-pointer text-xs">
            <Sticker className="h-3.5 w-3.5 text-accent" /> Añadir PNG
            <input type="file" accept="image/*" className="hidden" onChange={onAddSticker} />
          </label>
        </div>
        <div className="mt-2 space-y-2">
          {shot.overlays.map((o, oi) => (
            <div
              key={o.id}
              className={`rounded-lg border ${selectedOverlay === o.id ? "border-accent bg-accent/10" : "border-border"}`}
            >
              <div
                onClick={() => onSelectOverlay(o.id)}
                className="flex cursor-pointer flex-wrap items-center gap-2 px-2 py-1 text-xs"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span className="flex-1">PNG {oi + 1}</span>
                <span className="text-[11px] text-muted">{OVERLAY_MOTION_LABEL[o.motion]}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onChange({ ...shot, overlays: shot.overlays.filter((x) => x.id !== o.id) }); onSelectOverlay(null); }}
                  className="text-muted hover:text-danger"
                ><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              {selectedOverlay === o.id && (
                <div className="space-y-2 border-t border-border/60 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-0.5 text-[11px]">
                      <span className="text-muted">Movimiento</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={o.motion}
                        onChange={(e) => updOverlay(o.id, { motion: e.target.value as OverlayMotion })}
                      >
                        <option value="follow">Sigue a la toma</option>
                        <option value="fixed">Quieto</option>
                        <option value="free">Libre (A → B)</option>
                      </select>
                    </label>
                    <label className="space-y-0.5 text-[11px]">
                      <span className="text-muted">Cómo aparece</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={o.transition}
                        onChange={(e) => updOverlay(o.id, { transition: e.target.value as OverlayTransition })}
                      >
                        <option value="inherit">Igual que la toma</option>
                        <option value="cut">Corte</option>
                        <option value="fade">Fundido</option>
                        <option value="slide">Deslizar</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-lg border border-border/60 p-2">
                    <span className="text-[11px] text-muted">
                      {o.motion === "free" ? "Posición A (inicio)" : "Posición y tamaño"}
                    </span>
                    <Slider label="X" value={o.x} min={0} max={1} step={0.005}
                      onChange={(v) => updOverlay(o.id, { x: v })} format={pct} />
                    <Slider label="Y" value={o.y} min={0} max={1} step={0.005}
                      onChange={(v) => updOverlay(o.id, { y: v })} format={pct} />
                    <Slider label="Tamaño" value={o.w} min={0.03} max={1} step={0.005}
                      onChange={(v) => updOverlay(o.id, { w: v, h: v })} format={pct} />
                  </div>

                  {o.motion === "free" && (
                    <div className="rounded-lg border border-accent/40 p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted">Posición B (final)</span>
                        <div className="ml-auto flex flex-wrap gap-1">
                          {OVERLAY_PRESETS.map((p) => (
                            <button
                              key={p.label}
                              onClick={() => updOverlay(o.id, p.apply(o))}
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Slider label="X" value={o.toX} min={0} max={1} step={0.005}
                        onChange={(v) => updOverlay(o.id, { toX: v })} format={pct} />
                      <Slider label="Y" value={o.toY} min={0} max={1} step={0.005}
                        onChange={(v) => updOverlay(o.id, { toY: v })} format={pct} />
                      <Slider label="Tamaño" value={o.toW} min={0.03} max={1} step={0.005}
                        onChange={(v) => updOverlay(o.id, { toW: v, toH: v })} format={pct} />
                    </div>
                  )}

                  <p className="text-[11px] text-muted">
                    También puedes arrastrarlo sobre la previsualización.
                    {o.motion === "follow" && " Ahora va pegado a la imagen: se mueve y escala con la toma."}
                  </p>
                </div>
              )}
            </div>
          ))}
          {!shot.overlays.length && (
            <p className="text-[11px] text-muted">Explosiones, flechas, logos… con su propio movimiento o pegados a la imagen.</p>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const MOTION_LABEL: Record<string, string> = {
  fixed: "Fijo", in: "Acercar", out: "Alejar",
  left: "Izquierda", right: "Derecha", up: "Subir", down: "Bajar",
};
const OVERLAY_MOTION_LABEL: Record<OverlayMotion, string> = {
  follow: "sigue a la toma",
  fixed: "quieto",
  free: "libre A→B",
};

// Atajos para colocar la posición final de un sticker.
const OVERLAY_PRESETS: { label: string; apply: (o: PngOverlay) => Partial<PngOverlay> }[] = [
  { label: "←", apply: (o) => ({ toX: Math.max(0, o.x - 0.3), toY: o.y, toW: o.w, toH: o.h }) },
  { label: "→", apply: (o) => ({ toX: Math.min(1 - o.w, o.x + 0.3), toY: o.y, toW: o.w, toH: o.h }) },
  { label: "↑", apply: (o) => ({ toX: o.x, toY: Math.max(0, o.y - 0.3), toW: o.w, toH: o.h }) },
  { label: "↓", apply: (o) => ({ toX: o.x, toY: Math.min(1 - o.h, o.y + 0.3), toW: o.w, toH: o.h }) },
  { label: "+", apply: (o) => ({ toX: o.x, toY: o.y, toW: Math.min(1, o.w * 1.6), toH: Math.min(1, o.h * 1.6) }) },
  { label: "−", apply: (o) => ({ toX: o.x, toY: o.y, toW: Math.max(0.03, o.w * 0.6), toH: Math.max(0.03, o.h * 0.6) }) },
];

// Coloca el nuevo diálogo justo después del último.
function nextStart(shot: Shot) {
  let end = 0;
  for (const d of shot.dialogues) end = Math.max(end, d.startSec + (d.dur || 0));
  return Number(end.toFixed(2));
}

export function newSfx(audioId: string, name: string): ShotSfx {
  return { id: nanoid(6), audioId, name, volume: 0.8, startSec: 0 };
}
