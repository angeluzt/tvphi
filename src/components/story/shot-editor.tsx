"use client";

import {
  Plus, Trash2, Wand2, Volume2, Sticker, Image as ImageIcon, ChevronUp, ChevronDown, Clock,
  Loader2, Repeat, Play, Pause,
} from "lucide-react";
import type { VoiceStatus } from "@/lib/story/tts";
import { MotionEditor } from "./motion-editor";
import { Slider } from "./slider";
import { GapInput } from "./gap-input";
import { LockToggle } from "./lock-toggle";
import {
  newDialogue, shotDur, dialogueStarts, sfxStarts, dialogueDur, VOICE_EFFECTS,
  type Shot, type Dialogue, type ShotSfx, type PngOverlay, type InheritedLoop,
  type TransitionKind, type OverlayTransition, type OverlayMotion, type VoiceEffect,
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
  voiceJobs,
  selectedOverlay,
  inherited,
  playing,
  locked,
  lockedByScene,
  onToggleLock,
  onChange,
  onDelete,
  onMove,
  onToggle,
  onPlay,
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
  voiceJobs: Record<string, VoiceStatus>;
  selectedOverlay: string | null;
  inherited: InheritedLoop[];
  playing: boolean;
  locked: boolean;
  lockedByScene: boolean; // bloqueada porque lo está su escena entera
  onToggleLock: (v: boolean) => void;
  onChange: (s: Shot) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onPlay: () => void;
  onGenVoice: (d: Dialogue) => void;
  onAddSfx: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddSticker: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectOverlay: (id: string | null) => void;
}) {
  const dur = shotDur(shot);
  const dStarts = dialogueStarts(shot);
  const sStarts = sfxStarts(shot);
  const sueltos = shot.sfx.map((s, i) => ({ s, i })).filter(({ s }) => !s.loop);
  const bucles = shot.sfx.map((s, i) => ({ s, i })).filter(({ s }) => s.loop);

  // Excepción de esta toma sobre un bucle que viene de arriba.
  function setOverride(sfxId: string, patch: { stop?: boolean; volume?: number | null }) {
    const prev = shot.audioOverrides.find((o) => o.sfxId === sfxId);
    const next = {
      sfxId,
      stop: patch.stop ?? prev?.stop ?? false,
      volume: patch.volume !== undefined ? patch.volume : (prev?.volume ?? null),
    };
    onChange({
      ...shot,
      audioOverrides: [...shot.audioOverrides.filter((o) => o.sfxId !== sfxId), next],
    });
  }

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
          <span className="chip shrink-0 bg-brand/15 text-brand">Toma {index + 1}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
            <Clock className="h-3 w-3" /> {dur.toFixed(1)}s
          </span>
          {!expanded && locked && (
            <span className="chip shrink-0 bg-gold/15 text-gold">Bloqueada</span>
          )}
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onPlay}
            className="grid h-7 w-7 place-items-center rounded-lg border border-brand/60 text-brand hover:bg-brand/10"
            title="Ver solo esta toma"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          {canMove && (
            <>
              <button onClick={() => onMove(-1)} disabled={locked} className="text-muted hover:text-fg disabled:opacity-40" title="Subir toma"><ChevronUp className="h-4 w-4" /></button>
              <button onClick={() => onMove(1)} disabled={locked} className="text-muted hover:text-fg disabled:opacity-40" title="Bajar toma"><ChevronDown className="h-4 w-4" /></button>
            </>
          )}
          {!lockedByScene && (
            <LockToggle checked={locked} onChange={onToggleLock} label="" title={locked ? "Toma bloqueada: desactiva para editar" : "Bloquear esta toma"} />
          )}
          <button onClick={onDelete} disabled={locked} className="text-muted hover:text-danger disabled:opacity-40" title="Borrar toma"><Trash2 className="h-4 w-4" /></button>
          <button onClick={onToggle} className="text-muted hover:text-fg" title={expanded ? "Contraer" : "Editar toma"}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!expanded ? null : (
      <>
      {locked && (
        <p className="mt-2 rounded-lg border border-gold/50 bg-gold/10 px-2 py-1.5 text-[11px] text-gold">
          Toma bloqueada: no se puede cambiar nada.
          {lockedByScene
            ? " La escena entera está bloqueada; desactiva su candado para editar."
            : " Desactiva el candado de arriba para editar."}
        </p>
      )}
      {/* Con el candado puesto se apagan los controles (fieldset) y también los
          arrastres, que no son controles de formulario. */}
      <div className={locked ? "pointer-events-none select-none opacity-60" : ""}>
      <fieldset disabled={locked} className="contents">
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
            onClick={() => onChange({ ...shot, dialogues: [...shot.dialogues, newDialogue()] })}
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
                <button onClick={() => onGenVoice(d)} disabled={!!voiceJobs[d.id]} className="btn-ghost text-xs">
                  {voiceJobs[d.id] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5 text-accent" />
                  )}
                  {voiceJobs[d.id] ? voiceLabel(voiceJobs[d.id]) : d.audioId ? "Regenerar voz" : "Generar voz"}
                </button>
                <GapInput
                  value={d.gapSec}
                  onChange={(v) => updDialogue(d.id, { gapSec: v })}
                  label={i === 0 ? "Pausa al empezar" : "Pausa antes"}
                />
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  Efecto
                  <select
                    className="input w-32 py-0.5 text-[11px]"
                    value={d.effect}
                    onChange={(e) => updDialogue(d.id, { effect: e.target.value as VoiceEffect })}
                  >
                    {VOICE_EFFECTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </label>
                {d.audioId ? (
                  <span className="text-[11px] text-muted">
                    🔊 {dialogueDur(d).toFixed(1)}s · empieza en {dStarts[i].toFixed(1)}s
                  </span>
                ) : (
                  <span className="text-[11px] text-muted">sin voz aún</span>
                )}
              </div>
              {voiceJobs[d.id]?.stage === "loading" && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-surface-2">
                  <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(voiceJobs[d.id].pct)}%` }} />
                </div>
              )}
            </div>
          ))}
          {!shot.dialogues.length && (
            <p className="text-[11px] text-muted">Sin diálogos: la toma dura lo que marques a mano.</p>
          )}
        </div>
      </div>

      {/* Sonidos de la toma */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="label">Sonidos de esta toma</span>
          <label className="btn-ghost ml-auto cursor-pointer text-xs">
            <Volume2 className="h-3.5 w-3.5 text-accent" /> Añadir sonido
            <input type="file" accept="audio/*" className="hidden" onChange={onAddSfx} />
          </label>
        </div>

        {/* Sueltos: se encadenan con su pausa, como los diálogos */}
        <div className="mt-2 space-y-1">
          {sueltos.map(({ s, i }) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
              <Volume2 className="h-3.5 w-3.5 text-accent" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <GapInput value={s.gapSec} onChange={(v) => updSfx(s.id, { gapSec: v })} label="Pausa antes" />
              <span className="text-[11px] text-muted">en {sStarts[i].toFixed(1)}s</span>
              <VolumeInput value={s.volume} onChange={(v) => updSfx(s.id, { volume: v })} />
              <button
                onClick={() => updSfx(s.id, { loop: true })}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2"
                title="Que siga sonando en las tomas siguientes"
              >
                <Repeat className="inline h-3 w-3" /> a bucle
              </button>
              <button
                onClick={() => onChange({ ...shot, sfx: shot.sfx.filter((x) => x.id !== s.id) })}
                className="text-muted hover:text-danger"
              ><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {!sueltos.length && (
            <p className="text-[11px] text-muted">Golpes, choques, ambiente… se encadenan uno tras otro con la pausa que pongas.</p>
          )}
        </div>

        {/* En bucle: arrancan aquí y siguen en las tomas de abajo */}
        {!!bucles.length && (
          <div className="mt-2 rounded-lg border border-accent/40 bg-accent/5 p-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-accent">
              <Repeat className="h-3 w-3" /> En bucle desde esta toma
            </span>
            <div className="mt-1 space-y-1">
              {bucles.map(({ s, i }) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <GapInput value={s.gapSec} onChange={(v) => updSfx(s.id, { gapSec: v })} label="Empieza tras" />
                  <VolumeInput value={s.volume} onChange={(v) => updSfx(s.id, { volume: v })} />
                  <button
                    onClick={() => updSfx(s.id, { loop: false })}
                    className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2"
                    title="Que suene solo en esta toma"
                  >
                    solo aquí
                  </button>
                  <button
                    onClick={() => onChange({ ...shot, sfx: shot.sfx.filter((x) => x.id !== s.id) })}
                    className="text-muted hover:text-danger"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted">Sigue sonando en las tomas de abajo hasta que alguna lo corte.</p>
          </div>
        )}

        {/* Bucles que llegan de tomas anteriores */}
        {!!inherited.length && (
          <div className="mt-2 rounded-lg border border-border p-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
              <Repeat className="h-3 w-3" /> Viene sonando de antes
            </span>
            <div className="mt-1 space-y-1">
              {inherited.map((l) => {
                const ov = shot.audioOverrides.find((o) => o.sfxId === l.sfx.id);
                return (
                  <div key={l.sfx.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      {l.sfx.name}
                      <span className="text-[10px] text-muted"> · desde escena {l.fromSceneIndex + 1}, toma {l.fromShotIndex + 1}</span>
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-muted">
                      Volumen aquí
                      <VolumeInput value={l.volume} onChange={(v) => setOverride(l.sfx.id, { volume: v })} />
                    </label>
                    {ov && typeof ov.volume === "number" && (
                      <button
                        onClick={() => setOverride(l.sfx.id, { volume: null })}
                        className="text-[10px] text-muted hover:text-fg"
                        title="Volver al volumen que traía"
                      >
                        restablecer
                      </button>
                    )}
                    <button
                      onClick={() => setOverride(l.sfx.id, { stop: true })}
                      className="rounded border border-danger/50 px-1.5 py-0.5 text-[10px] text-danger hover:bg-danger/10"
                      title="Deja de sonar desde esta toma en adelante"
                    >
                      Cortar aquí
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bucles ya cortados en esta toma: se puede deshacer */}
        {shot.audioOverrides.filter((o) => o.stop).map((o) => (
          <div key={o.sfxId} className="mt-1 flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-[11px] text-muted">
            <Repeat className="h-3 w-3" />
            <span className="flex-1">Un sonido en bucle se corta en esta toma</span>
            <button
              onClick={() => onChange({ ...shot, audioOverrides: shot.audioOverrides.filter((x) => x.sfxId !== o.sfxId) })}
              className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-2"
            >
              Deshacer
            </button>
          </div>
        ))}
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
      </fieldset>
      </div>
      </>
      )}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

// Volumen con pasos finos (1 %) y el valor a la vista, para poder afinar.
function VolumeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20" title="Volumen" aria-label="Volumen"
      />
      <span className="w-9 text-right text-[11px] tabular-nums text-muted">{pct(value)}</span>
    </span>
  );
}

function voiceLabel(s: VoiceStatus) {
  if (s.stage === "queued") return "En cola…";
  if (s.stage === "loading") return `Descargando voz ${Math.round(s.pct)}%`;
  return "Generando…";
}

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


