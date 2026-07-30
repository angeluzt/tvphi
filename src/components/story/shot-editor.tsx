"use client";

import {
  Plus, Trash2, Wand2, Volume2, Sticker, Image as ImageIcon, ChevronUp, ChevronDown, Clock,
  Loader2, Repeat, Play, Pause, Copy,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { VoiceStatus } from "@/lib/story/tts";
import { MotionEditor } from "./motion-editor";
import { Slider } from "./slider";
import { GapInput } from "./gap-input";
import { NumberInput } from "./number-input";
import { LockToggle } from "./lock-toggle";
import { VfxEditor } from "./vfx-editor";
import {
  newDialogue, shotDur, moveDur, dialogueStarts, sfxStarts, dialogueDur, VOICE_EFFECTS, overlayWindows,
  overlaySoundStart,
  type Shot, type Dialogue, type ShotSfx, type PngOverlay, type InheritedLoop, type Frame,
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
  prevTo,
  canMove,
  expanded,
  voiceJobs,
  selectedOverlay,
  selectedVfx,
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
  onPreview,
  onGenVoice,
  onAddSfx,
  onAddSticker,
  onAddOverlaySound,
  onSelectOverlay,
  onSelectVfx,
}: {
  shot: Shot;
  index: number;
  imageId: string;
  imgW: number;
  imgH: number;
  prevTo: Frame | null; // dónde acabó la toma anterior
  canMove: boolean;
  expanded: boolean;
  voiceJobs: Record<string, VoiceStatus>;
  selectedOverlay: string | null;
  selectedVfx: string | null;
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
  onPreview: () => void;
  onGenVoice: (d: Dialogue) => void;
  onAddSfx: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddSticker: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddOverlaySound: (overlayId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectOverlay: (id: string | null) => void;
  onSelectVfx: (id: string | null) => void;
}) {
  const dur = shotDur(shot);
  const movim = moveDur(shot); // lo que tarda el recorrido, sin la pausa
  const hold = Math.max(0, shot.holdSec || 0);
  const dStarts = dialogueStarts(shot);
  const sStarts = sfxStarts(shot);
  const ventanas = overlayWindows(shot.overlays, dur);
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

  // Duplicar: la copia va justo detrás y, si el original tenía su propio rato,
  // se encadena a él — que es para lo que se suele duplicar (una explosión
  // detrás de otra). Comparte el archivo, no se sube nada dos veces.
  function duplicarOverlay(o: PngOverlay, i: number) {
    const copia: PngOverlay = {
      ...o,
      id: nanoid(6),
      timing: o.timing === "all" ? "all" : "after",
      startSec: o.timing === "all" ? o.startSec : 0,
      durSec: o.timing === "range" ? Math.max(0.1, o.endSec - o.startSec) : o.durSec,
    };
    const overlays = [...shot.overlays];
    overlays.splice(i + 1, 0, copia);
    onChange({ ...shot, overlays });
    onSelectOverlay(copia.id);
  }

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
              · {shot.motionMode === "preset"
                ? MOTION_LABEL[shot.preset.kind]
                : shot.motionMode === "continue" ? "Sigue a la anterior" : "Libre 1→2"}
              {hold > 0 ? ` · pausa ${Math.round(hold)}s` : ""}
              {shot.dialogues.length ? ` · ${shot.dialogues.length} diálogo${shot.dialogues.length > 1 ? "s" : ""}` : ""}
              {shot.sfx.length ? ` · ${shot.sfx.length} sonido${shot.sfx.length > 1 ? "s" : ""}` : ""}
              {shot.overlays.length ? ` · ${shot.overlays.length} sticker${shot.overlays.length > 1 ? "s" : ""}` : ""}
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
        <MotionEditor shot={shot} imageId={imageId} imgW={imgW} imgH={imgH} prevTo={prevTo} onChange={onChange} />
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
              // Al pasar a "fija" se hereda lo que tardaba el recorrido; la
              // pausa va aparte y no se toca.
              onChange={(e) => onChange({ ...shot, autoDuration: e.target.value === "auto", durationSec: movim })}
            >
              <option value="auto">Según los diálogos</option>
              <option value="fija">Fija</option>
            </select>
          </label>
          <NumberInput
            label="Segundos de movimiento"
            value={movim}
            onChange={(v) => onChange({ ...shot, durationSec: v })}
            min={0.3} max={600} step={0.5}
            disabled={shot.autoDuration}
            disabledHint="Lo marcan los diálogos. Pon «Fija» para escribirlo."
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {/* La pausa es tiempo AÑADIDO, no un trozo de la duración: acabado el
              recorrido la imagen se queda quieta y hasta que no pasa no empieza
              la toma siguiente. Por eso su tope no depende de la duración. */}
          <NumberInput
            label="Pausa al final"
            value={hold}
            onChange={(v) => onChange({ ...shot, holdSec: v })}
            min={0} max={60} step={1} decimals={0}
            hint="Quieta en el punto 2 antes de pasar a la siguiente"
          />
          <div className="flex flex-col justify-center rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted">
            <span>
              Se mueve <span className="text-fg tabular-nums">{movim.toFixed(1)}s</span>
              {hold > 0 && <> y se queda quieta <span className="text-fg tabular-nums">{hold}s</span></>}
            </span>
            <span>La toma dura <span className="text-fg tabular-nums">{dur.toFixed(1)}s</span></span>
          </div>
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
        <NumberInput
          label="Duración de la entrada (s)"
          value={shot.transitionDur}
          onChange={(v) => onChange({ ...shot, transitionDur: v })}
          min={0} max={5} step={0.1}
          disabled={shot.transition === "cut"}
          disabledHint="El corte es instantáneo: no dura nada."
        />
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
                  // Si ya tenía voz, cambiar el texto la deja desfasada: se marca
                  // para poder regenerar después solo las que hagan falta.
                  onChange={(e) => updDialogue(d.id, {
                    text: e.target.value,
                    ...(d.audioId && e.target.value !== d.text ? { stale: true } : {}),
                  })}
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
                {/* Atajos: la voz IA solo trae una, así que las "otras voces"
                    salen de tocarle el tono sin cambiar lo que tarda en leer. */}
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  Voz
                  <select
                    className="input w-28 py-0.5 text-[11px]"
                    value={vozPreset(d.pitch)}
                    onChange={(e) => updDialogue(d.id, { pitch: Number(e.target.value) })}
                  >
                    {VOZ_PRESETS.map((v) => <option key={v.pitch} value={v.pitch}>{v.label}</option>)}
                    {!VOZ_PRESETS.some((v) => v.pitch === vozPreset(d.pitch)) && (
                      <option value={d.pitch}>A mano</option>
                    )}
                  </select>
                </label>
                {d.audioId ? (
                  <span className="text-[11px] text-muted">
                    🔊 {dialogueDur(d).toFixed(1)}s · empieza en {dStarts[i].toFixed(1)}s
                  </span>
                ) : (
                  <span className="text-[11px] text-muted">sin voz aún</span>
                )}
                {d.stale && d.audioId && (
                  <span className="chip bg-gold/15 text-gold" title="El texto cambió después de generar la voz">
                    texto cambiado · regenera la voz
                  </span>
                )}
              </div>
              {/* Velocidad y tono, cada uno por su lado. No hay que regenerar
                  la voz: se retoca el audio que ya está hecho. */}
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Slider
                  label="Velocidad de lectura" value={d.speed} min={0.6} max={1.6} step={0.05}
                  onChange={(v) => updDialogue(d.id, { speed: v })}
                  format={(v) => `${v.toFixed(2)}×`}
                  hint={Math.abs(d.speed - 1) < 0.005 ? undefined : "El tono no cambia"}
                />
                <Slider
                  label="Tono de voz" value={d.pitch} min={0.7} max={1.5} step={0.02}
                  onChange={(v) => updDialogue(d.id, { pitch: v })}
                  format={(v) => `${v.toFixed(2)}×`}
                  hint={Math.abs(d.pitch - 1) < 0.005 ? undefined : "Lo que tarda en leer no cambia"}
                />
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

      {/* Stickers: PNG quietos o GIF animados */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="label">Imágenes encima (PNG / GIF)</span>
          <button onClick={onPreview} className="btn-ghost ml-auto text-xs" title="Ver esta toma repitiéndose mientras ajustas">
            <Repeat className="h-3.5 w-3.5 text-accent" /> Vista previa
          </button>
          <label className="btn-ghost cursor-pointer text-xs">
            <Sticker className="h-3.5 w-3.5 text-accent" /> Añadir PNG o GIF
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
                <span className="flex-1">Sticker {oi + 1}</span>
                <span className="text-[11px] text-muted">{OVERLAY_MOTION_LABEL[o.motion]}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicarOverlay(o, oi); }}
                  className="text-muted hover:text-fg"
                  title="Duplicar este sticker"
                ><Copy className="h-3.5 w-3.5" /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); onChange({ ...shot, overlays: shot.overlays.filter((x) => x.id !== o.id) }); onSelectOverlay(null); }}
                  className="text-muted hover:text-danger"
                  title="Borrar este sticker"
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

                  {/* Cuándo se ve: toda la toma o solo un rato. Así caben varias
                      explosiones seguidas en la misma toma. */}
                  <div className="rounded-lg border border-border/60 p-2">
                    <label className="block space-y-0.5 text-[11px]">
                      <span className="text-muted">Cuándo se ve</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={o.timing}
                        onChange={(e) => {
                          const t = e.target.value as PngOverlay["timing"];
                          updOverlay(o.id, t === "range"
                            ? { timing: t, startSec: o.startSec || 0, endSec: Math.min(dur, (o.startSec || 0) + 1) }
                            : t === "after"
                              ? { timing: t, startSec: 0, durSec: o.durSec || 1 }
                              : { timing: t });
                        }}
                      >
                        <option value="all">Toda la toma</option>
                        <option value="range">Solo un rato</option>
                        <option value="after" disabled={oi === 0}>
                          {oi === 0 ? "Después del anterior (no hay ninguno antes)" : "Después del anterior"}
                        </option>
                      </select>
                    </label>
                    {o.timing === "range" && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <NumberInput
                          label="Aparece a los"
                          value={o.startSec}
                          onChange={(v) => updOverlay(o.id, { startSec: v, endSec: Math.max(v + 0.1, o.endSec) })}
                          min={0} max={Math.max(0.1, dur - 0.1)} step={0.2}
                        />
                        <NumberInput
                          label="Se va a los"
                          value={Math.min(o.endSec, dur)}
                          onChange={(v) => updOverlay(o.id, { endSec: v })}
                          min={0.1} max={dur} step={0.2}
                        />
                      </div>
                    )}
                    {o.timing === "after" && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <NumberInput
                          label="Espera antes"
                          value={o.startSec}
                          onChange={(v) => updOverlay(o.id, { startSec: v })}
                          min={0} max={dur} step={0.2}
                        />
                        <NumberInput
                          label="Cuánto dura"
                          value={o.durSec}
                          onChange={(v) => updOverlay(o.id, { durSec: v })}
                          min={0.1} max={dur} step={0.2}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted/80">
                      {o.timing === "all"
                        ? `Toda la toma (${dur.toFixed(1)}s)`
                        : `Se ve de ${ventanas[oi].start.toFixed(1)}s a ${ventanas[oi].end.toFixed(1)}s` +
                          ` (${(ventanas[oi].end - ventanas[oi].start).toFixed(1)}s de los ${dur.toFixed(1)}s de la toma)` +
                          (o.timing === "after" ? " · va detrás del sticker anterior" : "")}
                    </p>
                  </div>

                  {/* Su propio sonido: la explosión que va con la explosión.
                      Cuelga del sticker, así que se mueve con él. */}
                  <div className="rounded-lg border border-border/60 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-accent" />
                      <span className="flex-1 truncate text-[11px]">
                        {o.soundId ? (o.soundName || "Sonido") : <span className="text-muted">Sonido de este sticker</span>}
                      </span>
                      <label className="btn-ghost cursor-pointer text-[11px]">
                        {o.soundId ? "Cambiar" : "Añadir sonido"}
                        <input
                          type="file" accept="audio/*" className="hidden"
                          onChange={(e) => onAddOverlaySound(o.id, e)}
                        />
                      </label>
                      {o.soundId && (
                        <button
                          onClick={() => updOverlay(o.id, { soundId: undefined, soundName: undefined })}
                          className="text-muted hover:text-danger"
                          title="Quitar el sonido de este sticker"
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    {o.soundId ? (
                      <>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                          <label className="space-y-0.5 text-[11px]">
                            <span className="text-muted">Cómo suena</span>
                            <select
                              className="input py-0.5 text-xs"
                              value={o.soundLoop ? "loop" : "once"}
                              onChange={(e) => updOverlay(o.id, { soundLoop: e.target.value === "loop" })}
                            >
                              <option value="once">Una sola vez</option>
                              <option value="loop">En bucle mientras se ve</option>
                            </select>
                          </label>
                          <NumberInput
                            label="Empieza a los"
                            value={o.soundDelay}
                            onChange={(v) => updOverlay(o.id, { soundDelay: v })}
                            min={0} max={Math.max(0, ventanas[oi].end - ventanas[oi].start - 0.05)} step={0.1}
                            hint="Desde que aparece el sticker"
                          />
                        </div>
                        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                          Volumen
                          <VolumeInput value={o.soundVolume} onChange={(v) => updOverlay(o.id, { soundVolume: v })} />
                        </label>
                        <p className="mt-1 text-[10px] text-muted/80">
                          Suena a los {overlaySoundStart(o, ventanas[oi]).toFixed(1)}s de la toma
                          {o.soundLoop
                            ? `, repitiéndose hasta los ${ventanas[oi].end.toFixed(1)}s`
                            : ", una vez (si dura más que el sticker, se le deja acabar)"}.
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-[10px] text-muted/80">
                        Un golpe, una explosión… arranca cuando aparece el sticker, no cuando
                        empieza la toma.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/60 p-2">
                    <span className="text-[11px] text-muted">
                      {o.motion === "free" ? "Posición A (inicio)" : "Posición y tamaño"}
                    </span>
                    {/* El recorrido llega hasta sacarlo del cuadro ENTERO por
                        los cuatro lados: por la izquierda hay que poder llegar
                        a −tamaño, y por la derecha con 1 ya está fuera. Si no,
                        no hay forma de dejar asomando solo una esquina. */}
                    <Slider label="X" value={o.x} min={fuera(o.w)} max={1} step={0.005}
                      onChange={(v) => updOverlay(o.id, { x: v })} format={pct} />
                    <Slider label="Y" value={o.y} min={fuera(o.h)} max={1} step={0.005}
                      onChange={(v) => updOverlay(o.id, { y: v })} format={pct} />
                    {/* Hasta el 200 %: hay PNG pequeños que hay que agrandar
                        para que cubran de verdad. */}
                    <Slider label="Tamaño" value={o.w} min={0.03} max={2} step={0.005}
                      onChange={(v) => updOverlay(o.id, { w: v, h: v })} format={pct}
                      hint={o.w > 1 ? "Más del 100 %: se sale del cuadro por los lados" : undefined} />
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
                      <Slider label="X" value={o.toX} min={fuera(o.toW)} max={1} step={0.005}
                        onChange={(v) => updOverlay(o.id, { toX: v })} format={pct} />
                      <Slider label="Y" value={o.toY} min={fuera(o.toH)} max={1} step={0.005}
                        onChange={(v) => updOverlay(o.id, { toY: v })} format={pct} />
                      <Slider label="Tamaño" value={o.toW} min={0.03} max={2} step={0.005}
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

      <VfxEditor
        vfx={shot.vfx ?? []}
        dur={dur}
        seleccionado={selectedVfx}
        onChange={(v) => onChange({ ...shot, vfx: v })}
        onSelect={onSelectVfx}
      />
      </fieldset>
      </div>
      </>
      )}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

// La voz IA (MMS-TTS) trae UNA sola voz por idioma: no hay hombre/mujer que
// elegir dentro del modelo. Estos atajos son esa misma voz con el tono movido,
// que es lo que se puede hacer sin cambiar de modelo. No suplantan a una voz
// distinta de verdad, pero dan personajes que se distinguen entre sí.
const VOZ_PRESETS: { pitch: number; label: string }[] = [
  { pitch: 0.82, label: "Muy grave" },
  { pitch: 0.92, label: "Grave" },
  { pitch: 1, label: "Normal" },
  { pitch: 1.12, label: "Clara" },
  { pitch: 1.24, label: "Aguda" },
];
// Se redondea al atajo más cercano para que el desplegable no parezca vacío
// cuando el tono se ha ajustado con la barra.
const vozPreset = (p: number) => {
  const v = p || 1;
  const cerca = VOZ_PRESETS.find((x) => Math.abs(x.pitch - v) < 0.01);
  return cerca ? cerca.pitch : v;
};

// Hasta dónde puede irse un sticker por la izquierda o por arriba: a −tamaño ya
// está fuera del todo. Nunca menos de −1, para que con un sticker pequeño la
// barra no se quede en un palmo y siga habiendo sitio donde moverlo.
const fuera = (tam: number) => -Math.max(1, tam);

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


