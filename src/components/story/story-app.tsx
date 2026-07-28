"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  X, Play, Pause, Download, Plus, Trash2, ChevronUp, ChevronDown, Image as ImageIcon,
  Mic, Music, Volume2, Sticker, Wand2, Save, FolderOpen, Film,
} from "lucide-react";
import { StoryEngine } from "@/lib/story/engine";
import { synthesize, audioDuration, VOICES } from "@/lib/story/tts";
import { putAsset, assetUrl, cachedUrl } from "@/lib/story/store";
import {
  emptyProject, newSlide, moveSlide, slideDur, slideStarts, totalDuration,
  type StoryProject, type StorySlide, type PanDir, type ZoomKind, type TransitionKind,
  type AudioLayer, type PngOverlay,
} from "@/lib/story/model";
import { Recorder } from "@/lib/studio/recorder";
import { convert } from "@/lib/editor/ffmpeg";

interface ProjMeta { id: string; name: string; updatedAt: string }

function fmt(s: number) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}

export function StoryApp({ initialProjects }: { initialProjects: ProjMeta[] }) {
  const [project, setProject] = useState<StoryProject>(emptyProject());
  const [projects, setProjects] = useState<ProjMeta[]>(initialProjects);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Mi historia");
  const [voice, setVoice] = useState("es");

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selSlide, setSelSlide] = useState<string | null>(null);
  const [selOverlay, setSelOverlay] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4" | "gif" | "mp3">("webm");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dirty, setDirty] = useState(false);

  const engineRef = useRef<StoryEngine | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const projRef = useRef(project);
  projRef.current = project;

  // --- engine lifecycle ---
  useEffect(() => {
    const eng = new StoryEngine();
    engineRef.current = eng;
    eng.onTime = (t) => setPlayhead(t);
    eng.onEnded = () => setPlaying(false);
    if (previewRef.current) {
      eng.canvas.className = "h-full w-full object-contain";
      previewRef.current.appendChild(eng.canvas);
    }
    eng.start();
    return () => eng.destroy();
  }, []);

  useEffect(() => {
    engineRef.current?.update(project);
  }, [project]);

  // --- warn before leaving with unsaved/unexported work ---
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && project.slides.length) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, project.slides.length]);

  const dur = totalDuration(project);
  const starts = slideStarts(project);
  const active = selSlide ?? (project.slides[0]?.id ?? null);
  const activeSlide = project.slides.find((s) => s.id === active) ?? null;
  const activeOverlay = activeSlide?.overlays.find((o) => o.id === selOverlay) ?? null;

  function mut(fn: (p: StoryProject) => StoryProject) {
    setDirty(true);
    setProject((prev) => fn(prev));
  }
  function mutSlide(id: string, patch: Partial<StorySlide>) {
    mut((p) => ({ ...p, slides: p.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  // --- playback ---
  async function togglePlay() {
    const eng = engineRef.current!;
    if (playing) { eng.pause(); setPlaying(false); }
    else { await eng.play(); setPlaying(true); }
  }
  function seek(t: number) {
    engineRef.current?.seek(t);
    setPlaying(false);
  }
  function focusSlide(id: string) {
    setSelSlide(id);
    setSelOverlay(null);
    const i = project.slides.findIndex((s) => s.id === id);
    if (i >= 0) seek(starts[i] + 0.01);
  }

  // --- slides ---
  async function addImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      const id = nanoid(10);
      await putAsset(id, f);
      await assetUrl(id); // cachea la object URL
      const s = newSlide(id);
      mut((p) => ({ ...p, slides: [...p.slides, s] }));
      setSelSlide(s.id);
    }
  }
  function delSlide(id: string) {
    mut((p) => ({ ...p, slides: p.slides.filter((s) => s.id !== id) }));
    if (selSlide === id) setSelSlide(null);
  }
  function mvSlide(id: string, d: -1 | 1) { mut((p) => moveSlide(p, id, d)); }

  // --- narración (TTS) ---
  async function genVoice(slide: StorySlide) {
    if (!slide.narration.trim()) { setStatus("Escribe el texto a narrar primero."); return; }
    setBusy(slide.id);
    setStatus(null);
    try {
      const blob = await synthesize(slide.narration, voice, (s) => setStatus(s));
      const audioId = nanoid(10);
      await putAsset(audioId, blob);
      const d = await audioDuration(blob);
      mutSlide(slide.id, { audioId, narrationDur: d });
      setStatus("Voz generada ✓");
    } catch (err: any) {
      setStatus("Error generando voz: " + (err?.message ?? ""));
    }
    setBusy(null);
  }
  async function genAllVoices() {
    for (const s of projRef.current.slides) {
      if (s.narration.trim() && !s.audioId) await genVoice(s);
    }
  }

  // --- stickers PNG ---
  async function addSticker(slideId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const id = nanoid(10);
    await putAsset(id, f);
    await assetUrl(id);
    const ov: PngOverlay = { id: nanoid(6), imageId: id, x: 0.35, y: 0.35, w: 0.3, h: 0.3 };
    mut((p) => ({ ...p, slides: p.slides.map((s) => (s.id === slideId ? { ...s, overlays: [...s.overlays, ov] } : s)) }));
    setSelSlide(slideId);
    setSelOverlay(ov.id);
  }
  function updOverlay(slideId: string, ovId: string, patch: Partial<PngOverlay>) {
    mut((p) => ({
      ...p,
      slides: p.slides.map((s) =>
        s.id === slideId ? { ...s, overlays: s.overlays.map((o) => (o.id === ovId ? { ...o, ...patch } : o)) } : s,
      ),
    }));
  }
  function delOverlay(slideId: string, ovId: string) {
    mut((p) => ({
      ...p,
      slides: p.slides.map((s) => (s.id === slideId ? { ...s, overlays: s.overlays.filter((o) => o.id !== ovId) } : s)),
    }));
    if (selOverlay === ovId) setSelOverlay(null);
  }

  // --- audio layers ---
  async function addAudioLayer(kind: "music" | "sfx", e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const audioId = nanoid(10);
    await putAsset(audioId, f);
    const layer: AudioLayer = {
      id: nanoid(6), kind, audioId, name: f.name,
      volume: kind === "music" ? 0.4 : 0.8, startSec: 0, loop: kind === "music",
    };
    mut((p) => ({ ...p, audioLayers: [...p.audioLayers, layer] }));
  }
  function updLayer(id: string, patch: Partial<AudioLayer>) {
    mut((p) => ({ ...p, audioLayers: p.audioLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }
  function delLayer(id: string) {
    mut((p) => ({ ...p, audioLayers: p.audioLayers.filter((l) => l.id !== id) }));
  }

  // --- persistencia (metadatos) ---
  async function save() {
    setBusy("save");
    setStatus(null);
    try {
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId ?? undefined, name, data: project }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      setProjectId(j.project.id);
      setProjects((prev) => {
        const rest = prev.filter((p) => p.id !== j.project.id);
        return [{ id: j.project.id, name: j.project.name, updatedAt: j.project.updatedAt }, ...rest];
      });
      setDirty(false);
      setStatus("Proyecto guardado ✓");
    } catch (err: any) {
      setStatus("Error al guardar: " + (err?.message ?? ""));
    }
    setBusy(null);
  }
  async function load(id: string) {
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Cargar otro proyecto igualmente?")) return;
    setBusy("load");
    try {
      const res = await fetch(`/api/story?id=${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error");
      const data = j.project.data as StoryProject;
      // precachea las object URLs de imágenes que sigan en IndexedDB
      const ids = new Set<string>();
      for (const s of data.slides) { ids.add(s.imageId); s.overlays.forEach((o) => ids.add(o.imageId)); }
      await Promise.all([...ids].map((i) => assetUrl(i)));
      setProject(data);
      setProjectId(j.project.id);
      setName(j.project.name);
      setSelSlide(data.slides[0]?.id ?? null);
      setDirty(false);
      seek(0);
      setStatus("Proyecto cargado ✓");
    } catch (err: any) {
      setStatus("Error al cargar: " + (err?.message ?? ""));
    }
    setBusy(null);
  }
  function newProject() {
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Empezar un proyecto nuevo?")) return;
    setProject(emptyProject());
    setProjectId(null);
    setName("Mi historia");
    setSelSlide(null);
    setSelOverlay(null);
    setDirty(false);
    seek(0);
  }

  // --- export ---
  async function doExport() {
    if (!project.slides.length) { setStatus("Añade al menos una imagen."); return; }
    const eng = engineRef.current!;
    setExporting(true);
    setPlaying(false);
    setProgress(0);
    setStatus(null);
    try {
      const webmMime = Recorder.pickMime();
      if (format === "webm") {
        const b = await eng.export(webmMime, setProgress);
        download(b, `tvphi-historia-${Date.now()}.webm`);
      } else if (format === "mp4") {
        const mp4 = Recorder.pickMp4();
        if (mp4) {
          const b = await eng.export(mp4, setProgress);
          download(b, `tvphi-historia-${Date.now()}.mp4`);
        } else {
          setStatus("Convirtiendo a MP4 (puede tardar)…");
          const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
          const c = await convert(b, "mp4", (p) => setProgress(0.5 + p * 0.5));
          download(c, `tvphi-historia-${Date.now()}.mp4`);
        }
      } else {
        setStatus(`Convirtiendo a ${format.toUpperCase()} (puede tardar)…`);
        const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
        const c = await convert(b, format, (p) => setProgress(0.5 + p * 0.5));
        download(c, `tvphi-historia-${Date.now()}.${format}`);
      }
      setStatus("Descarga lista ✓");
    } catch (err: any) {
      setStatus("Error al exportar: " + (err?.message ?? ""));
    }
    setExporting(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Columna izquierda: preview + slides */}
      <div className="space-y-4">
        {/* Preview */}
        <div className="card p-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            <div ref={previewRef} className="absolute inset-0" />
            {activeSlide && activeOverlay && (
              <StickerBox
                overlay={activeOverlay}
                onChange={(t) => updOverlay(activeSlide.id, activeOverlay.id, t)}
              />
            )}
            {!project.slides.length && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
                Sube imágenes para empezar tu historia.
              </div>
            )}
          </div>
          {/* transporte */}
          <div className="mt-3 flex items-center gap-3">
            <button onClick={togglePlay} className="btn-brand" disabled={!project.slides.length}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="text-sm tabular-nums text-muted">{fmt(playhead)} / {fmt(dur)}</span>
            <input
              type="range" min={0} max={dur || 0} step={0.05} value={Math.min(playhead, dur)}
              onChange={(e) => seek(Number(e.target.value))} className="flex-1"
            />
          </div>
          {/* timeline de slides */}
          {project.slides.length > 0 && (
            <div className="relative mt-2 h-12 w-full overflow-hidden rounded-lg bg-surface-2">
              <div className="flex h-full w-full gap-0.5">
                {project.slides.map((s, i) => {
                  const pct = dur ? (slideDur(s) / dur) * 100 : 0;
                  return (
                    <button key={s.id} onClick={() => focusSlide(s.id)}
                      className={`relative h-full min-w-[26px] overflow-hidden rounded ${active === s.id ? "ring-2 ring-accent" : ""}`}
                      style={{ width: `${pct}%` }} title={`Imagen ${i + 1} · ${fmt(slideDur(s))}`}>
                      <Thumb id={s.imageId} />
                      <span className="absolute left-1 top-0.5 rounded bg-black/50 px-1 text-[10px] text-white">{i + 1}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-accent" style={{ left: `${dur ? (playhead / dur) * 100 : 0}%` }} />
            </div>
          )}
        </div>

        {/* Slides */}
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className="label">Imágenes / escenas</span>
            <label className="btn-brand ml-auto cursor-pointer">
              <Plus className="h-4 w-4" /> Añadir imágenes
              <input type="file" accept="image/*" multiple className="hidden" onChange={addImages} />
            </label>
          </div>

          <div className="mt-3 space-y-3">
            {project.slides.map((s, i) => (
              <div key={s.id}
                className={`rounded-xl border p-3 ${active === s.id ? "border-brand bg-brand/5" : "border-border"}`}
                onClick={() => setSelSlide(s.id)}>
                <div className="flex gap-3">
                  <button onClick={(e) => { e.stopPropagation(); focusSlide(s.id); }}
                    className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
                    <Thumb id={s.imageId} />
                    <span className="absolute left-1 top-0.5 rounded bg-black/50 px-1 text-[10px] text-white">{i + 1}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <textarea
                      className="input min-h-[52px] text-sm" rows={2}
                      placeholder="Texto que se narrará (no se ve en el video)…"
                      value={s.narration}
                      onChange={(e) => mutSlide(s.id, { narration: e.target.value })}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); genVoice(s); }} disabled={busy === s.id}
                        className="btn-ghost text-xs">
                        <Wand2 className="h-3.5 w-3.5 text-accent" />
                        {busy === s.id ? "Generando…" : s.audioId ? "Regenerar voz" : "Generar voz"}
                      </button>
                      {s.audioId && <span className="text-[11px] text-muted">🔊 {s.narrationDur.toFixed(1)}s</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); mvSlide(s.id, -1); }} className="text-muted hover:text-fg"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); mvSlide(s.id, 1); }} className="text-muted hover:text-fg"><ChevronDown className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); delSlide(s.id); }} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                {/* controles de movimiento/transición */}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="space-y-0.5 text-xs">
                    <span className="text-muted">Movimiento</span>
                    <select className="input" value={s.pan} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => mutSlide(s.id, { pan: e.target.value as PanDir })}>
                      <option value="none">Fijo</option>
                      <option value="up">Subir</option>
                      <option value="down">Bajar</option>
                      <option value="left">Izquierda</option>
                      <option value="right">Derecha</option>
                    </select>
                  </label>
                  <label className="space-y-0.5 text-xs">
                    <span className="text-muted">Zoom</span>
                    <select className="input" value={s.zoom} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => mutSlide(s.id, { zoom: e.target.value as ZoomKind })}>
                      <option value="none">Sin zoom</option>
                      <option value="in">Acercar</option>
                      <option value="out">Alejar</option>
                    </select>
                  </label>
                  <label className="space-y-0.5 text-xs">
                    <span className="text-muted">Transición</span>
                    <select className="input" value={s.transition} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => mutSlide(s.id, { transition: e.target.value as TransitionKind })}>
                      <option value="cut">Corte</option>
                      <option value="fade">Fundido</option>
                      <option value="slide">Deslizar</option>
                    </select>
                  </label>
                </div>

                {/* stickers */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="btn-ghost cursor-pointer text-xs" onClick={(e) => e.stopPropagation()}>
                    <Sticker className="h-3.5 w-3.5 text-accent" /> Añadir PNG
                    <input type="file" accept="image/png,image/*" className="hidden" onChange={(e) => addSticker(s.id, e)} />
                  </label>
                  {s.overlays.map((o) => (
                    <span key={o.id}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${selOverlay === o.id ? "border-accent bg-accent/10" : "border-border"}`}
                      onClick={(e) => { e.stopPropagation(); setSelSlide(s.id); setSelOverlay(o.id); focusSlide(s.id); }}>
                      <ImageIcon className="h-3 w-3" /> PNG
                      <button onClick={(e) => { e.stopPropagation(); delOverlay(s.id, o.id); }} className="text-muted hover:text-danger"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!project.slides.length && (
              <p className="py-6 text-center text-sm text-muted">Aún no hay imágenes. Sube las primeras para empezar.</p>
            )}
          </div>
        </div>
      </div>

      {/* Columna derecha: proyecto, voz, audio, export */}
      <aside className="space-y-4">
        {/* Proyecto */}
        <div className="card p-3">
          <span className="label">Proyecto</span>
          <input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto" />
          <div className="mt-2 flex gap-2">
            <button onClick={save} disabled={busy === "save"} className="btn-brand flex-1"><Save className="h-4 w-4" /> Guardar</button>
            <button onClick={newProject} className="btn-ghost"><Plus className="h-4 w-4" /> Nuevo</button>
          </div>
          {projects.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-muted">Tus proyectos</span>
              <div className="mt-1 space-y-1">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => load(p.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1 text-left text-sm ${projectId === p.id ? "border-brand bg-brand/10" : "border-border hover:bg-surface-2"}`}>
                    <FolderOpen className="h-3.5 w-3.5 text-muted" />
                    <span className="flex-1 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Se guardan los textos y ajustes. Las imágenes/audios se quedan en este navegador.
          </p>
        </div>

        {/* Voz */}
        <div className="card p-3">
          <span className="label">Voz (narración)</span>
          <label className="mt-2 block space-y-1 text-sm">
            <span className="text-xs text-muted">Idioma / voz</span>
            <select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <button onClick={genAllVoices} className="btn-ghost mt-2 w-full text-sm">
            <Mic className="h-4 w-4 text-accent" /> Generar voz de las que falten
          </button>
          <label className="mt-3 block space-y-1 text-sm">
            <span className="flex items-center gap-1 text-xs text-muted"><Volume2 className="h-3.5 w-3.5" /> Volumen narración</span>
            <input type="range" min={0} max={1} step={0.05} value={project.narrationVolume}
              onChange={(e) => mut((p) => ({ ...p, narrationVolume: Number(e.target.value) }))} className="w-full" />
          </label>
          <p className="mt-2 text-[11px] text-muted">
            Voz IA gratis en tu navegador (la 1ª vez descarga el modelo, ~30–60&nbsp;MB). Suena algo
            robótica; es temporal.
          </p>
        </div>

        {/* Audio (música / SFX) */}
        <div className="card p-3">
          <span className="label">Audio (capas)</span>
          <div className="mt-2 flex gap-2">
            <label className="btn-ghost flex-1 cursor-pointer text-xs"><Music className="h-4 w-4 text-accent" /> Música
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => addAudioLayer("music", e)} />
            </label>
            <label className="btn-ghost flex-1 cursor-pointer text-xs"><Volume2 className="h-4 w-4 text-accent" /> Efecto
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => addAudioLayer("sfx", e)} />
            </label>
          </div>
          <div className="mt-2 space-y-2">
            {project.audioLayers.map((l) => (
              <div key={l.id} className="rounded-lg border border-border p-2 text-sm">
                <div className="flex items-center gap-2">
                  {l.kind === "music" ? <Music className="h-3.5 w-3.5 text-accent" /> : <Volume2 className="h-3.5 w-3.5 text-accent" />}
                  <span className="flex-1 truncate text-xs">{l.name}</span>
                  <button onClick={() => delLayer(l.id)} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="space-y-0.5 text-[11px] text-muted">Volumen
                    <input type="range" min={0} max={1} step={0.05} value={l.volume}
                      onChange={(e) => updLayer(l.id, { volume: Number(e.target.value) })} className="w-full" />
                  </label>
                  <label className="space-y-0.5 text-[11px] text-muted">Inicio (s)
                    <input type="number" min={0} step={0.1} value={l.startSec}
                      onChange={(e) => updLayer(l.id, { startSec: Math.max(0, Number(e.target.value)) })} className="input" />
                  </label>
                </div>
                <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <input type="checkbox" checked={l.loop} onChange={(e) => updLayer(l.id, { loop: e.target.checked })} />
                  Repetir (loop)
                </label>
              </div>
            ))}
            {!project.audioLayers.length && <p className="text-[11px] text-muted">Añade música de fondo o efectos, cada uno en su capa.</p>}
          </div>
        </div>

        {/* Export */}
        <div className="card p-3">
          <span className="label">Exportar</span>
          <div className="mt-2 flex gap-2">
            <select value={format} onChange={(e) => setFormat(e.target.value as any)} disabled={exporting} className="input">
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
              <option value="gif">GIF</option>
              <option value="mp3">MP3 (audio)</option>
            </select>
            <button className="btn-brand" onClick={doExport} disabled={exporting || !project.slides.length}>
              <Download className="h-4 w-4" /> {exporting ? `${Math.round(progress * 100)}%` : "Exportar"}
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted"><Film className="h-3 w-3" /> El video se genera en tu navegador y se descarga.</p>
        </div>

        {status && <p className="text-sm text-accent">{status}</p>}
      </aside>
    </div>
  );
}

// Miniatura de un asset guardado en IndexedDB (resuelve la object URL de forma perezosa).
function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(id));
  useEffect(() => {
    let alive = true;
    if (!url) assetUrl(id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id, url]);
  if (!url) return <div className="h-full w-full bg-surface-2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

// Recuadro para mover/redimensionar un sticker PNG sobre la previsualización.
function StickerBox({ overlay, onChange }: { overlay: PngOverlay; onChange: (t: Partial<PngOverlay>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; rw: number; rh: number }>(null);

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    if (!ref.current) return;
    e.preventDefault(); e.stopPropagation();
    const rect = ref.current.getBoundingClientRect();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, ox: overlay.x, oy: overlay.y, ow: overlay.w, oh: overlay.h, rw: rect.width, rh: rect.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / d.rw, dy = (e.clientY - d.sy) / d.rh;
    const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.mode === "move") onChange({ x: cl(d.ox + dx, 0, 1 - d.ow), y: cl(d.oy + dy, 0, 1 - d.oh) });
    else onChange({ w: cl(d.ow + dx, 0.05, 1 - d.ox), h: cl(d.oh + dy, 0.05, 1 - d.oy) });
  }
  function end(e: React.PointerEvent) { drag.current = null; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {} }

  return (
    <div className="pointer-events-none absolute inset-0 z-20" ref={ref}>
      <div onPointerDown={(e) => begin("move", e)} onPointerMove={move} onPointerUp={end}
        className="pointer-events-auto absolute cursor-move rounded border-2 border-accent/80 bg-accent/5"
        style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.w * 100}%`, height: `${overlay.h * 100}%` }}>
        <div onPointerDown={(e) => begin("resize", e)} onPointerMove={move} onPointerUp={end}
          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-black/60 bg-accent" />
      </div>
    </div>
  );
}
