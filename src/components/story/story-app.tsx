"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Play, Pause, Download, Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Mic, Music, Volume2, Save, FolderOpen, Film, Layers, Loader2, X, MoveVertical,
} from "lucide-react";
import { StoryEngine } from "@/lib/story/engine";
import { synthesize, audioDuration, VOICES, type VoiceStatus } from "@/lib/story/tts";
import { putAsset, assetUrl, cachedUrl } from "@/lib/story/store";
import { ShotEditor } from "./shot-editor";
import {
  emptyProject, newScene, newShot, newOverlay, newSfx, moveScene, reorderScene, moveShot, migrateProject,
  flatten, shotDur, totalDuration, sceneRange, inheritedLoops,
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
  // Tramo que se está viendo suelto (una escena o una toma) + su miniatura flotante.
  const [section, setSection] = useState<{ start: number; end: number; label: string; shotId?: string; sceneId?: string } | null>(null);
  // Escena cuya posición se está cambiando escribiendo el número.
  const [movingScene, setMovingScene] = useState<{ id: string; value: string } | null>(null);

  // Encargos de voz en marcha, por id de diálogo (la generación no bloquea la página).
  const [voiceJobs, setVoiceJobs] = useState<Record<string, VoiceStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4" | "gif" | "mp3">("webm");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dirty, setDirty] = useState(false);

  const engineRef = useRef<StoryEngine | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
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

  // El lienzo es uno solo: se muda a la miniatura flotante mientras se ve un
  // tramo suelto, y vuelve a su sitio al cerrarla.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const host = section ? floatRef.current : previewRef.current;
    if (host && eng.canvas.parentElement !== host) host.appendChild(eng.canvas);
  }, [section]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      // También avisa si hay voces a medias: al recargar se perderían.
      if ((dirty && project.scenes.length) || Object.keys(voiceJobs).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, project.scenes.length, voiceJobs]);

  const pendientes = Object.keys(voiceJobs).length;
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

  // Ver solo un tramo (una escena o una toma) en la miniatura flotante, sin
  // tener que subir hasta el reproductor de arriba.
  async function playSection(start: number, end: number, label: string, ids: { shotId?: string; sceneId?: string }) {
    const eng = engineRef.current!;
    if (section && section.start === start && section.end === end && playing) {
      eng.pause();
      setPlaying(false);
      return;
    }
    setSection({ start, end, label, ...ids });
    eng.setRange(start, end);
    eng.seek(start);
    await eng.play();
    setPlaying(true);
  }
  function playScene(sc: StoryScene, i: number) {
    const r = sceneRange(flat, sc.id);
    if (r) void playSection(r.start, r.end, `Escena ${i + 1}`, { sceneId: sc.id });
  }
  function playShot(sc: StoryScene, shotId: string, si: number, hi: number) {
    const f = flat.find((x) => x.shot.id === shotId);
    if (f) void playSection(f.start, f.start + f.dur, `Escena ${si + 1} · toma ${hi + 1}`, { shotId });
  }
  function closeSection() {
    const eng = engineRef.current!;
    eng.pause();
    eng.clearRange();
    setPlaying(false);
    setSection(null);
  }

  // Coloca una escena en la posición que se escriba, sin subirla clic a clic.
  function applyMove(sc: StoryScene) {
    if (!movingScene) return;
    const n = Number(movingScene.value);
    if (!Number.isFinite(n) || n < 1 || n > project.scenes.length) {
      setStatus(`Escribe una posición entre 1 y ${project.scenes.length}.`);
      return;
    }
    mut((p) => reorderScene(p, sc.id, Math.round(n) - 1));
    setMovingScene(null);
    setStatus(null);
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
  // Actualiza un diálogo por id. La generación tarda, así que no se puede
  // partir de una copia capturada antes: mientras tanto se puede haber editado.
  function patchDialogue(sceneId: string, shotId: string, dId: string, patch: Partial<Dialogue>) {
    mut((p) => ({
      ...p,
      scenes: p.scenes.map((sc) =>
        sc.id !== sceneId ? sc : {
          ...sc,
          shots: sc.shots.map((sh) =>
            sh.id !== shotId ? sh : {
              ...sh,
              dialogues: sh.dialogues.map((x) => (x.id !== dId ? x : { ...x, ...patch })),
            },
          ),
        },
      ),
    }));
  }

  // No espera: encarga la voz al worker y sigue. Se puede seguir editando y
  // encolar más voces mientras tanto.
  function genVoice(sceneId: string, shotId: string, d: Dialogue) {
    if (!d.text.trim()) { setStatus("Escribe el texto del diálogo primero."); return; }
    if (voiceJobs[d.id]) return;
    setStatus(null);
    setVoiceJobs((j) => ({ ...j, [d.id]: { stage: "queued", pct: 0 } }));
    synthesize(d.text, voice, (s) => setVoiceJobs((j) => (j[d.id] ? { ...j, [d.id]: s } : j)))
      .then(async (blob) => {
        const audioId = nanoid(10);
        await putAsset(audioId, blob);
        const secs = await audioDuration(blob);
        patchDialogue(sceneId, shotId, d.id, { audioId, dur: secs });
        setStatus("Voz generada ✓");
      })
      .catch((err: any) => {
        setStatus("Error generando voz: " + (err?.message ?? ""));
      })
      .finally(() => {
        setVoiceJobs((j) => {
          const { [d.id]: _drop, ...rest } = j;
          return rest;
        });
      });
  }
  function genAllVoices() {
    for (const sc of projRef.current.scenes) {
      for (const sh of sc.shots) {
        for (const d of sh.dialogues) {
          if (d.text.trim() && !d.audioId) genVoice(sc.id, sh.id, d);
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
    // La duración hace falta para poder encadenar el siguiente sonido tras su pausa.
    const secs = await audioDuration(f).catch(() => 0);
    mut((p) => ({
      ...p,
      scenes: p.scenes.map((sc) =>
        sc.id !== sceneId ? sc : {
          ...sc,
          shots: sc.shots.map((sh) =>
            sh.id !== shot.id ? sh : { ...sh, sfx: [...sh.sfx, newSfx(audioId, f.name, secs)] },
          ),
        },
      ),
    }));
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
          {/* Se limita la altura para que, al quedarse fija, deje sitio al editor. */}
          <div className="relative mx-auto aspect-video w-full max-w-[calc(42vh*16/9)] overflow-hidden rounded-2xl border border-border bg-black">
            <div ref={previewRef} className="absolute inset-0" />
            {curOverlay && overlayVisible && (
              <>
                <StickerBox
                  overlay={curOverlay} which="a"
                  onChange={updOverlayPos}
                />
                {curOverlay.motion === "free" && (
                  <StickerBox
                    overlay={curOverlay} which="b"
                    onChange={updOverlayPos}
                  />
                )}
              </>
            )}
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
                  <button
                    onClick={() => playScene(sc, si)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-brand/60 text-brand hover:bg-brand/10"
                    title="Ver solo esta escena"
                  >
                    {section?.sceneId === sc.id && playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button onClick={() => addShot(sc)} className="btn-ghost text-xs" title="Añadir sub-escena">
                    <Plus className="h-3.5 w-3.5 text-accent" /> Toma
                  </button>
                  <div className="flex flex-col items-center gap-0.5">
                    <button onClick={() => mut((p) => moveScene(p, sc.id, -1))} title="Subir escena" className="text-muted hover:text-fg"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => mut((p) => moveScene(p, sc.id, 1))} title="Bajar escena" className="text-muted hover:text-fg"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  <button
                    onClick={() => setMovingScene(movingScene?.id === sc.id ? null : { id: sc.id, value: String(si + 1) })}
                    title="Colocar en una posición concreta"
                    className="text-muted hover:text-fg"
                  ><MoveVertical className="h-4 w-4" /></button>
                  <button onClick={() => delScene(sc, si)} title="Borrar escena" className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  <button
                    onClick={() => setOpenScene(openScene === sc.id ? null : sc.id)}
                    className="btn-ghost text-xs"
                  >
                    <Layers className="h-3.5 w-3.5" /> {openScene === sc.id ? "Cerrar" : "Editar"}
                  </button>
                </div>

                {movingScene?.id === sc.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/50 bg-brand/5 p-2 text-sm">
                    <span className="text-xs text-muted">Colocar esta escena en la posición</span>
                    <input
                      type="number" min={1} max={project.scenes.length} autoFocus
                      className="input w-20 py-0.5"
                      value={movingScene.value}
                      onChange={(e) => setMovingScene({ id: sc.id, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") applyMove(sc); if (e.key === "Escape") setMovingScene(null); }}
                    />
                    <span className="text-xs text-muted">de {project.scenes.length}</span>
                    <button onClick={() => applyMove(sc)} className="btn-brand py-1 text-xs">Aceptar</button>
                    <button onClick={() => setMovingScene(null)} className="btn-ghost py-1 text-xs">Cancelar</button>
                  </div>
                )}

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
                        voiceJobs={voiceJobs}
                        selectedOverlay={selShot === sh.id ? selOverlay : null}
                        inherited={inheritedLoops(flat, flat.findIndex((f) => f.shot.id === sh.id))}
                        playing={section?.shotId === sh.id && playing}
                        onChange={(next) => updShot(sc.id, sh.id, next)}
                        onDelete={() => delShot(sc, sh.id, hi)}
                        onMove={(d) => mut((p) => moveShot(p, sc.id, sh.id, d))}
                        onToggle={() => (selShot === sh.id ? setSelShot(null) : focusShot(sh.id))}
                        onPlay={() => playShot(sc, sh.id, si, hi)}
                        onGenVoice={(d) => genVoice(sc.id, sh.id, d)}
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
          {pendientes > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendientes === 1 ? "1 voz generándose" : `${pendientes} voces en cola`} · puedes seguir editando
            </p>
          )}
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

      {/* Miniatura flotante: al ver una escena o una toma sueltas, el video viene
          a donde estás editando en vez de tener que subir al reproductor de arriba.
          Se mueve aquí el mismo lienzo del motor. */}
      {section && (
        <div className="fixed inset-x-0 top-2 z-50 mx-auto w-[min(92vw,460px)] rounded-2xl border border-brand/60 bg-bg/95 p-2 shadow-2xl backdrop-blur">
          {/* En móvil el ancho es justo: la etiqueta se recorta y el botón de
              cerrar nunca se queda fuera del panel. */}
          <div className="flex items-center gap-2 px-1 pb-1">
            <span className="chip min-w-0 max-w-[55%] truncate bg-brand/15 text-brand">{section.label}</span>
            <span className="min-w-0 flex-1 truncate text-right text-[11px] tabular-nums text-muted">
              {fmt(Math.max(0, playhead - section.start))} / {fmt(section.end - section.start)}
            </span>
            <button
              onClick={closeSection}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              title="Cerrar y volver al video completo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={floatRef} className="relative aspect-video overflow-hidden rounded-xl bg-black" />
          <div className="mt-2 flex items-center gap-2 px-1">
            <button onClick={togglePlay} className="btn-brand py-1">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            {/* El recorrido va solo de esta escena/toma, no de todo el video */}
            <input
              type="range"
              min={0}
              max={Math.max(0.1, section.end - section.start)}
              step={0.05}
              value={Math.max(0, Math.min(section.end - section.start, playhead - section.start))}
              onChange={(e) => seek(section.start + Number(e.target.value))}
              className="flex-1"
              aria-label="Avanzar dentro de este tramo"
            />
          </div>
        </div>
      )}
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
// Con movimiento libre se muestran dos: A (dónde empieza) y B (dónde termina).
function StickerBox({
  overlay,
  which,
  onChange,
}: {
  overlay: PngOverlay;
  which: "a" | "b";
  onChange: (t: Partial<PngOverlay>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; rw: number; rh: number }>(null);

  const isB = which === "b";
  const box = isB
    ? { x: overlay.toX, y: overlay.toY, w: overlay.toW, h: overlay.toH }
    : { x: overlay.x, y: overlay.y, w: overlay.w, h: overlay.h };
  const emit = (x: number, y: number, w: number, h: number) =>
    onChange(isB ? { toX: x, toY: y, toW: w, toH: h } : { x, y, w, h });

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    if (!ref.current) return;
    e.preventDefault(); e.stopPropagation();
    const rect = ref.current.getBoundingClientRect();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y, ow: box.w, oh: box.h, rw: rect.width, rh: rect.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / d.rw, dy = (e.clientY - d.sy) / d.rh;
    const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.mode === "move") emit(cl(d.ox + dx, 0, 1 - d.ow), cl(d.oy + dy, 0, 1 - d.oh), d.ow, d.oh);
    else {
      const w = cl(d.ow + dx, 0.03, 1 - d.ox);
      emit(d.ox, d.oy, w, cl(d.oh + dy, 0.03, 1 - d.oy));
    }
  }
  function end(e: React.PointerEvent) { drag.current = null; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {} }

  const color = isB ? "border-gold/80 bg-gold/5" : "border-accent/80 bg-accent/5";
  const handle = isB ? "bg-gold" : "bg-accent";
  const label = overlay.motion === "free" ? (isB ? "B" : "A") : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" ref={ref}>
      <div onPointerDown={(e) => begin("move", e)} onPointerMove={move} onPointerUp={end}
        className={`pointer-events-auto absolute cursor-move rounded border-2 ${color}`}
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
        {label && (
          <span className={`absolute left-1 top-1 rounded px-1 text-[10px] font-bold text-black ${handle}`}>{label}</span>
        )}
        <div onPointerDown={(e) => begin("resize", e)} onPointerMove={move} onPointerUp={end}
          className={`absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-sm border border-black/60 ${handle}`} />
      </div>
    </div>
  );
}
