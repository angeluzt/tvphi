"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Play, Pause, Download, Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Mic, Music, Volume2, Save, FolderOpen, Film, Layers,
} from "lucide-react";
import { StoryEngine } from "@/lib/story/engine";
import { synthesize, audioDuration, VOICES } from "@/lib/story/tts";
import { putAsset, assetUrl, cachedUrl } from "@/lib/story/store";
import { ShotEditor, newSfx, newOverlay } from "./shot-editor";
import {
  emptyProject, newScene, newShot, moveScene, reorderScene, moveShot, migrateProject,
  flatten, shotDur, totalDuration,
  type StoryProject, type StoryScene, type Shot, type Dialogue, type AudioLayer, type PngOverlay,
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
// Lee el tamaño natural de una imagen para poder calcular los encuadres.
function imageSize(file: Blob): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { res({ w: 16, h: 9 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export function StoryApp({ initialProjects }: { initialProjects: ProjMeta[] }) {
  const [project, setProject] = useState<StoryProject>(emptyProject());
  const [projects, setProjects] = useState<ProjMeta[]>(initialProjects);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Mi historia");
  const [voice, setVoice] = useState("es");

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [openScene, setOpenScene] = useState<string | null>(null);
  const [selShot, setSelShot] = useState<string | null>(null);
  const [selOverlay, setSelOverlay] = useState<string | null>(null);
  const [dragScene, setDragScene] = useState<string | null>(null);

  const [busyDialogue, setBusyDialogue] = useState<string | null>(null);
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

  useEffect(() => { engineRef.current?.update(project); }, [project]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && project.scenes.length) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, project.scenes.length]);

  const dur = totalDuration(project);
  const flat = flatten(project);
  const curFlat = flat.find((f) => f.shot.id === selShot) ?? null;
  const curOverlay = curFlat?.shot.overlays.find((o) => o.id === selOverlay) ?? null;
  // El recuadro para colocar el sticker solo tiene sentido si el reproductor
  // está dentro de la toma a la que pertenece.
  const overlayVisible =
    !!curFlat && playhead >= curFlat.start - 0.001 && playhead <= curFlat.start + curFlat.dur;

  function mut(fn: (p: StoryProject) => StoryProject) {
    setDirty(true);
    setProject((prev) => fn(prev));
  }
  function updShot(sceneId: string, shotId: string, next: Shot) {
    mut((p) => ({
      ...p,
      scenes: p.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, shots: sc.shots.map((s) => (s.id === shotId ? next : s)) } : sc,
      ),
    }));
  }

  // ---------- reproducción ----------
  async function togglePlay() {
    const eng = engineRef.current!;
    if (playing) { eng.pause(); setPlaying(false); }
    else { await eng.play(); setPlaying(true); }
  }
  function seek(t: number) {
    engineRef.current?.seek(t);
    setPlaying(false);
  }
  function focusShot(shotId: string) {
    setSelShot(shotId);
    setSelOverlay(null);
    engineRef.current?.seekToShot(shotId);
    setPlaying(false);
  }

  // ---------- escenas ----------
  async function addImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      const id = nanoid(10);
      await putAsset(id, f);
      await assetUrl(id);
      const { w, h } = await imageSize(f);
      const sc = newScene(id, w, h);
      mut((p) => ({ ...p, scenes: [...p.scenes, sc] }));
      setOpenScene(sc.id);
      setSelShot(sc.shots[0].id);
    }
  }
  function delScene(sc: StoryScene, i: number) {
    const n = sc.shots.length;
    const msg = n > 1
      ? `¿Borrar la escena ${i + 1} y sus ${n} tomas?`
      : `¿Borrar la escena ${i + 1}?`;
    if (!confirm(msg)) return;
    mut((p) => ({ ...p, scenes: p.scenes.filter((x) => x.id !== sc.id) }));
    if (openScene === sc.id) setOpenScene(null);
    if (sc.shots.some((s) => s.id === selShot)) setSelShot(null);
  }
  function addShot(sc: StoryScene) {
    const s = newShot(sc.imgW, sc.imgH, "in");
    mut((p) => ({ ...p, scenes: p.scenes.map((x) => (x.id === sc.id ? { ...x, shots: [...x.shots, s] } : x)) }));
    setOpenScene(sc.id);
    setSelShot(s.id);
  }
  function delShot(sc: StoryScene, shotId: string, i: number) {
    if (sc.shots.length === 1) {
      setStatus("Una escena necesita al menos una toma. Borra la escena entera si ya no la quieres.");
      return;
    }
    if (!confirm(`¿Borrar la toma ${i + 1}?`)) return;
    mut((p) => ({ ...p, scenes: p.scenes.map((x) => (x.id === sc.id ? { ...x, shots: x.shots.filter((s) => s.id !== shotId) } : x)) }));
    if (selShot === shotId) setSelShot(null);
  }

  // ---------- voz ----------
  async function genVoice(sceneId: string, shot: Shot, d: Dialogue) {
    if (!d.text.trim()) { setStatus("Escribe el texto del diálogo primero."); return; }
    setBusyDialogue(d.id);
    setStatus(null);
    try {
      const blob = await synthesize(d.text, voice, (s) => setStatus(s));
      const audioId = nanoid(10);
      await putAsset(audioId, blob);
      const secs = await audioDuration(blob);
      updShot(sceneId, shot.id, {
        ...shot,
        dialogues: shot.dialogues.map((x) => (x.id === d.id ? { ...x, audioId, dur: secs } : x)),
      });
      setStatus("Voz generada ✓");
    } catch (err: any) {
      setStatus("Error generando voz: " + (err?.message ?? ""));
    }
    setBusyDialogue(null);
  }
  async function genAllVoices() {
    for (const sc of projRef.current.scenes) {
      for (const sh of sc.shots) {
        for (const d of sh.dialogues) {
          if (d.text.trim() && !d.audioId) {
            const live = projRef.current.scenes.find((x) => x.id === sc.id)?.shots.find((x) => x.id === sh.id);
            if (live) await genVoice(sc.id, live, d);
          }
        }
      }
    }
  }

  // ---------- sonidos y stickers por toma ----------
  async function addSfx(sceneId: string, shot: Shot, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const audioId = nanoid(10);
    await putAsset(audioId, f);
    updShot(sceneId, shot.id, { ...shot, sfx: [...shot.sfx, newSfx(audioId, f.name)] });
  }
  async function addSticker(sceneId: string, shot: Shot, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const imageId = nanoid(10);
    await putAsset(imageId, f);
    await assetUrl(imageId);
    const ov = newOverlay(imageId);
    updShot(sceneId, shot.id, { ...shot, overlays: [...shot.overlays, ov] });
    setSelShot(shot.id);
    setSelOverlay(ov.id);
    // Coloca el reproductor en la toma para poder situar el sticker al momento.
    engineRef.current?.seekToShot(shot.id);
    setPlaying(false);
  }
  function updOverlayPos(patch: Partial<PngOverlay>) {
    if (!curFlat || !curOverlay) return;
    updShot(curFlat.scene.id, curFlat.shot.id, {
      ...curFlat.shot,
      overlays: curFlat.shot.overlays.map((o) => (o.id === curOverlay.id ? { ...o, ...patch } : o)),
    });
  }

  // ---------- audio global ----------
  async function addAudioLayer(kind: "music" | "sfx", e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const audioId = nanoid(10);
    await putAsset(audioId, f);
    const layer: AudioLayer = {
      id: nanoid(6), kind, audioId, name: f.name,
      volume: kind === "music" ? 0.35 : 0.8, startSec: 0, loop: kind === "music",
    };
    mut((p) => ({ ...p, audioLayers: [...p.audioLayers, layer] }));
  }
  function updLayer(id: string, patch: Partial<AudioLayer>) {
    mut((p) => ({ ...p, audioLayers: p.audioLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  // ---------- persistencia ----------
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
      setProjects((prev) => [
        { id: j.project.id, name: j.project.name, updatedAt: j.project.updatedAt },
        ...prev.filter((p) => p.id !== j.project.id),
      ]);
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
      const data = migrateProject(j.project.data);
      const ids = new Set<string>();
      for (const sc of data.scenes) {
        ids.add(sc.imageId);
        for (const sh of sc.shots) sh.overlays.forEach((o) => ids.add(o.imageId));
      }
      await Promise.all([...ids].map((i) => assetUrl(i)));
      setProject(data);
      setProjectId(j.project.id);
      setName(j.project.name);
      setOpenScene(data.scenes[0]?.id ?? null);
      setSelShot(data.scenes[0]?.shots[0]?.id ?? null);
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
    setOpenScene(null);
    setSelShot(null);
    setSelOverlay(null);
    setDirty(false);
    seek(0);
  }

  // ---------- exportar ----------
  async function doExport() {
    if (!project.scenes.length) { setStatus("Añade al menos una imagen."); return; }
    const eng = engineRef.current!;
    setExporting(true);
    setPlaying(false);
    setProgress(0);
    setStatus(null);
    try {
      const webmMime = Recorder.pickMime();
      if (format === "webm") {
        download(await eng.export(webmMime, setProgress), `tvphi-historia-${Date.now()}.webm`);
      } else if (format === "mp4") {
        const mp4 = Recorder.pickMp4();
        if (mp4) {
          download(await eng.export(mp4, setProgress), `tvphi-historia-${Date.now()}.mp4`);
        } else {
          setStatus("Convirtiendo a MP4 (puede tardar)…");
          const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
          download(await convert(b, "mp4", (p) => setProgress(0.5 + p * 0.5)), `tvphi-historia-${Date.now()}.mp4`);
        }
      } else {
        setStatus(`Convirtiendo a ${format.toUpperCase()} (puede tardar)…`);
        const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
        download(await convert(b, format, (p) => setProgress(0.5 + p * 0.5)), `tvphi-historia-${Date.now()}.${format}`);
      }
      setStatus("Descarga lista ✓");
    } catch (err: any) {
      setStatus("Error al exportar: " + (err?.message ?? ""));
    }
    setExporting(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {/* Previsualización: se queda fija al desplazarse para poder colocar
            stickers y ver el encuadre mientras se edita una toma larga. */}
        <div className="card p-3 lg:sticky lg:top-16 lg:z-20">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            <div ref={previewRef} className="absolute inset-0" />
            {curOverlay && overlayVisible && <StickerBox overlay={curOverlay} onChange={updOverlayPos} />}
            {!project.scenes.length && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
                Sube imágenes para empezar tu historia.
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button onClick={togglePlay} className="btn-brand" disabled={!project.scenes.length}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="text-sm tabular-nums text-muted">{fmt(playhead)} / {fmt(dur)}</span>
            <input
              type="range" min={0} max={dur || 0} step={0.05} value={Math.min(playhead, dur)}
              onChange={(e) => seek(Number(e.target.value))} className="flex-1"
            />
          </div>

          {/* Línea de tiempo: escenas agrupadas, tomas dentro */}
          {flat.length > 0 && (
            <div className="relative mt-2 w-full overflow-hidden rounded-lg bg-surface-2 p-1">
              <div className="flex h-12 w-full gap-1">
                {project.scenes.map((sc, si) => {
                  const scDur = sc.shots.reduce((a, s) => a + shotDur(s), 0);
                  return (
                    <div key={sc.id} className="flex h-full gap-px overflow-hidden rounded"
                      style={{ width: `${dur ? (scDur / dur) * 100 : 0}%` }}>
                      {sc.shots.map((sh, hi) => (
                        <button key={sh.id} onClick={() => focusShot(sh.id)}
                          className={`relative h-full min-w-[14px] flex-1 overflow-hidden ${selShot === sh.id ? "ring-2 ring-accent" : ""}`}
                          title={`Escena ${si + 1} · toma ${hi + 1} · ${shotDur(sh).toFixed(1)}s`}>
                          <Thumb id={sc.imageId} />
                          <span className="absolute inset-x-0 bottom-0 bg-black/50 text-center text-[9px] text-white">
                            {si + 1}.{hi + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-accent"
                style={{ left: `${dur ? (playhead / dur) * 100 : 0}%` }} />
            </div>
          )}
        </div>

        {/* Escenas */}
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className="label">Escenas</span>
            <label className="btn-brand ml-auto cursor-pointer">
              <Plus className="h-4 w-4" /> Añadir imágenes
              <input type="file" accept="image/*" multiple className="hidden" onChange={addImages} />
            </label>
          </div>

          <div className="mt-3 space-y-3">
            {project.scenes.map((sc, si) => (
              <div
                key={sc.id}
                draggable
                onDragStart={() => setDragScene(sc.id)}
                onDragEnd={() => setDragScene(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragScene && dragScene !== sc.id) mut((p) => reorderScene(p, dragScene, si));
                  setDragScene(null);
                }}
                className={`rounded-xl border p-3 ${openScene === sc.id ? "border-brand bg-brand/5" : "border-border"} ${dragScene === sc.id ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted" />
                  <button
                    onClick={() => { setOpenScene(openScene === sc.id ? null : sc.id); focusShot(sc.shots[0].id); }}
                    className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-black"
                  >
                    <Thumb id={sc.imageId} />
                    <span className="absolute left-1 top-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{si + 1}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Escena {si + 1}</p>
                    <p className="text-xs text-muted">
                      {sc.shots.length} {sc.shots.length === 1 ? "toma" : "tomas"} ·{" "}
                      {sc.shots.reduce((a, s) => a + shotDur(s), 0).toFixed(1)}s
                    </p>
                  </div>
                  <button onClick={() => addShot(sc)} className="btn-ghost text-xs" title="Añadir sub-escena">
                    <Plus className="h-3.5 w-3.5 text-accent" /> Toma
                  </button>
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={() => mut((p) => moveScene(p, sc.id, -1))} title="Subir escena" className="text-muted hover:text-fg"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => mut((p) => moveScene(p, sc.id, 1))} title="Bajar escena" className="text-muted hover:text-fg"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  <button onClick={() => delScene(sc, si)} title="Borrar escena" className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  <button
                    onClick={() => setOpenScene(openScene === sc.id ? null : sc.id)}
                    className="btn-ghost text-xs"
                  >
                    <Layers className="h-3.5 w-3.5" /> {openScene === sc.id ? "Cerrar" : "Editar"}
                  </button>
                </div>

                {openScene === sc.id && (
                  <div className="mt-3 space-y-3">
                    {sc.shots.map((sh, hi) => (
                      <ShotEditor
                        key={sh.id}
                        shot={sh}
                        index={hi}
                        imageId={sc.imageId}
                        imgW={sc.imgW}
                        imgH={sc.imgH}
                        canMove={sc.shots.length > 1}
                        expanded={selShot === sh.id}
                        busyDialogue={busyDialogue}
                        selectedOverlay={selShot === sh.id ? selOverlay : null}
                        onChange={(next) => updShot(sc.id, sh.id, next)}
                        onDelete={() => delShot(sc, sh.id, hi)}
                        onMove={(d) => mut((p) => moveShot(p, sc.id, sh.id, d))}
                        onToggle={() => (selShot === sh.id ? setSelShot(null) : focusShot(sh.id))}
                        onGenVoice={(d) => genVoice(sc.id, sh, d)}
                        onAddSfx={(e) => addSfx(sc.id, sh, e)}
                        onAddSticker={(e) => addSticker(sc.id, sh, e)}
                        onSelectOverlay={(id) => { setSelShot(sh.id); setSelOverlay(id); if (id) engineRef.current?.seekToShot(sh.id); }}
                      />
                    ))}
                    <button onClick={() => addShot(sc)} className="btn-ghost w-full text-sm">
                      <Plus className="h-4 w-4 text-accent" /> Añadir otra toma a esta imagen
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!project.scenes.length && (
              <p className="py-6 text-center text-sm text-muted">Aún no hay imágenes. Sube las primeras para empezar.</p>
            )}
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <aside className="space-y-4">
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

        <div className="card p-3">
          <span className="label">Voz (narración)</span>
          <label className="mt-2 block space-y-1 text-sm">
            <span className="text-xs text-muted">Idioma / voz</span>
            <select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <button onClick={genAllVoices} className="btn-ghost mt-2 w-full text-sm">
            <Mic className="h-4 w-4 text-accent" /> Generar la voz de los diálogos que falten
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

        <div className="card p-3">
          <span className="label">Música y sonido global</span>
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
                  <button
                    onClick={() => mut((p) => ({ ...p, audioLayers: p.audioLayers.filter((x) => x.id !== l.id) }))}
                    className="text-muted hover:text-danger"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
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
                  Repetir en bucle todo el video
                </label>
              </div>
            ))}
            {!project.audioLayers.length && (
              <p className="text-[11px] text-muted">Música de fondo para todo el video. Los sonidos puntuales van dentro de cada toma.</p>
            )}
          </div>
        </div>

        <div className="card p-3">
          <span className="label">Exportar</span>
          <div className="mt-2 flex gap-2">
            <select value={format} onChange={(e) => setFormat(e.target.value as any)} disabled={exporting} className="input">
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
              <option value="gif">GIF</option>
              <option value="mp3">MP3 (audio)</option>
            </select>
            <button className="btn-brand" onClick={doExport} disabled={exporting || !project.scenes.length}>
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

// Miniatura de un asset guardado en IndexedDB.
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
