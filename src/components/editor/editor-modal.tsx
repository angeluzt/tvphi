"use client";

import { useEffect, useRef, useState } from "react";
import { EditorEngine } from "@/lib/editor/engine";
import { Recorder } from "@/lib/studio/recorder";
import { convert } from "@/lib/editor/ffmpeg";
import {
  newProject, splitAt, removeClip, moveClip, clipDur, clipStarts, totalDuration,
  createTextOverlay, createImageOverlay,
  type EditorProject, type Overlay,
} from "@/lib/editor/model";
import {
  X, Play, Pause, Scissors, Trash2, ChevronUp, ChevronDown, Type, Image as ImageIcon,
  Music, Download, Film,
} from "lucide-react";

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

export function EditorModal({
  take,
  onClose,
}: {
  take: { blob: Blob; durationSec: number };
  onClose: () => void;
}) {
  const [project, setProject] = useState<EditorProject | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selOverlay, setSelOverlay] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4" | "gif" | "mp3">("webm");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const engineRef = useRef<EditorEngine | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const srcUrlRef = useRef<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(take.blob);
    srcUrlRef.current = url;
    const source = { id: "src", url, duration: take.durationSec || 0 };
    const p = newProject(source);
    const eng = new EditorEngine();
    engineRef.current = eng;
    eng.onTime = (t) => setPlayhead(t);
    eng.onEnded = () => setPlaying(false);
    eng.setProject(p).then(() => {
      if (previewRef.current) {
        eng.canvas.className = "h-full w-full object-contain";
        previewRef.current.appendChild(eng.canvas);
      }
      eng.start();
      setProject(p);
    });
    return () => {
      eng.destroy();
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (project) engineRef.current?.update(project);
  }, [project]);

  if (!project) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 text-muted">Cargando editor…</div>
    );
  }
  const dur = totalDuration(project);
  const starts = clipStarts(project);
  const sel = project.overlays.find((o) => o.id === selOverlay) ?? null;

  function mut(fn: (p: EditorProject) => EditorProject) {
    setProject((prev) => (prev ? fn(prev) : prev));
  }

  async function togglePlay() {
    const eng = engineRef.current!;
    if (playing) { eng.pause(); setPlaying(false); }
    else { await eng.play(); setPlaying(true); }
  }
  function seek(t: number) {
    engineRef.current?.seek(t);
    setPlaying(false);
  }

  // ---- clips ----
  function splitHere() { mut((p) => splitAt(p, playhead)); }
  function delClip(id: string) { mut((p) => removeClip(p, id)); }
  function mvClip(id: string, d: -1 | 1) { mut((p) => moveClip(p, id, d)); }

  // ---- overlays ----
  function addText() {
    const o = createTextOverlay(playhead, Math.min(dur, playhead + 3));
    mut((p) => ({ ...p, overlays: [...p.overlays, o] }));
    setSelOverlay(o.id);
  }
  function addImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const o = createImageOverlay(String(r.result), playhead, Math.min(dur, playhead + 3));
      mut((p) => ({ ...p, overlays: [...p.overlays, o] }));
      setSelOverlay(o.id);
    };
    r.readAsDataURL(f);
  }
  function updOverlay(id: string, patch: Partial<Overlay>) {
    mut((p) => ({ ...p, overlays: p.overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)) }));
  }
  function delOverlay(id: string) {
    mut((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== id) }));
    if (selOverlay === id) setSelOverlay(null);
  }

  // ---- audio ----
  function addMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    mut((p) => ({ ...p, music: { url, name: f.name, volume: 0.7, startSec: 0 } }));
  }

  // ---- export ----
  async function doExport() {
    const eng = engineRef.current!;
    setExporting(true);
    setProgress(0);
    setStatus(null);
    try {
      const webmMime = Recorder.pickMime();
      if (format === "webm") {
        const b = await eng.export(webmMime, setProgress);
        download(b, `tvphi-${Date.now()}.webm`);
      } else if (format === "mp4") {
        const mp4 = Recorder.pickMp4();
        if (mp4) {
          const b = await eng.export(mp4, setProgress);
          download(b, `tvphi-${Date.now()}.mp4`);
        } else {
          setStatus("Convirtiendo a MP4 (puede tardar)…");
          const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
          const c = await convert(b, "mp4", (p) => setProgress(0.5 + p * 0.5));
          download(c, `tvphi-${Date.now()}.mp4`);
        }
      } else {
        setStatus(`Convirtiendo a ${format.toUpperCase()} (puede tardar)…`);
        const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
        const c = await convert(b, format, (p) => setProgress(0.5 + p * 0.5));
        download(c, `tvphi-${Date.now()}.${format}`);
      }
      setStatus("Descarga lista ✓");
    } catch (err: any) {
      setStatus("Error al exportar: " + (err?.message ?? ""));
    }
    setExporting(false);
    setPlaying(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Cabecera */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Film className="h-5 w-5 text-brand" />
        <h2 className="font-bold">Editor de video</h2>
        <div className="ml-auto flex items-center gap-2">
          <select value={format} onChange={(e) => setFormat(e.target.value as any)} disabled={exporting} className="input max-w-[8rem]">
            <option value="webm">WebM</option>
            <option value="mp4">MP4</option>
            <option value="gif">GIF</option>
            <option value="mp3">MP3 (audio)</option>
          </select>
          <button className="btn-brand" onClick={doExport} disabled={exporting}>
            <Download className="h-4 w-4" /> {exporting ? `Exportando ${Math.round(progress * 100)}%` : "Exportar"}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={exporting}><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Preview + timeline */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            <div ref={previewRef} className="absolute inset-0" />
            {sel && (
              <OverlayBox
                overlay={sel}
                onChange={(t) => updOverlay(sel.id, t)}
                visible={playhead >= sel.startSec && playhead <= sel.endSec}
              />
            )}
          </div>

          {/* Controles de reproducción */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="btn-brand">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="text-sm tabular-nums text-muted">{fmt(playhead)} / {fmt(dur)}</span>
            <input
              type="range" min={0} max={dur || 0} step={0.05} value={Math.min(playhead, dur)}
              onChange={(e) => seek(Number(e.target.value))}
              className="flex-1"
            />
            <button onClick={splitHere} className="btn-ghost" title="Cortar aquí">
              <Scissors className="h-4 w-4" /> Cortar
            </button>
          </div>

          {/* Timeline de clips */}
          <div className="card p-3">
            <span className="label">Línea de tiempo</span>
            <div className="relative mt-2 h-14 w-full overflow-hidden rounded-lg bg-surface-2">
              <div className="flex h-full w-full gap-0.5">
                {project.clips.map((c, i) => {
                  const pct = dur ? (clipDur(c) / dur) * 100 : 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => seek(starts[i] + 0.01)}
                      className="group relative h-full min-w-[24px] rounded bg-brand/25 hover:bg-brand/40"
                      style={{ width: `${pct}%` }}
                      title={`Clip ${i + 1} · ${fmt(clipDur(c))}`}
                    >
                      <span className="absolute left-1 top-1 text-[10px] text-fg/70">{i + 1}</span>
                      {project.clips.length > 1 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); delClip(c.id); }}
                          className="absolute right-0.5 top-0.5 hidden rounded bg-danger/80 p-0.5 group-hover:block"
                        >
                          <Trash2 className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* playhead */}
              <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-accent" style={{ left: `${dur ? (playhead / dur) * 100 : 0}%` }} />
            </div>
            {/* overlays como barras */}
            {project.overlays.length > 0 && (
              <div className="relative mt-1 h-4 w-full rounded bg-surface-2">
                {project.overlays.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setSelOverlay(o.id); seek(o.startSec + 0.01); }}
                    className={`absolute top-0 h-full rounded ${selOverlay === o.id ? "bg-accent" : "bg-accent/50"}`}
                    style={{ left: `${dur ? (o.startSec / dur) * 100 : 0}%`, width: `${dur ? ((o.endSec - o.startSec) / dur) * 100 : 0}%` }}
                    title={o.kind === "text" ? o.text : "Imagen"}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Herramientas */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {/* Overlays */}
          <div className="card p-3">
            <span className="label">Capas (overlays)</span>
            <div className="mt-2 flex gap-2">
              <button onClick={addText} className="btn-ghost"><Type className="h-4 w-4 text-accent" /> Texto</button>
              <label className="btn-ghost cursor-pointer"><ImageIcon className="h-4 w-4 text-accent" /> Imagen
                <input type="file" accept="image/*" className="hidden" onChange={addImage} />
              </label>
            </div>
            <div className="mt-2 space-y-1">
              {project.overlays.map((o) => (
                <div key={o.id} onClick={() => setSelOverlay(o.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-sm ${selOverlay === o.id ? "border-brand bg-brand/10" : "border-transparent hover:bg-surface-2"}`}>
                  {o.kind === "text" ? <Type className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  <span className="flex-1 truncate">{o.kind === "text" ? o.text : "Imagen"}</span>
                  <button onClick={(e) => { e.stopPropagation(); delOverlay(o.id); }} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            {sel && (
              <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                {sel.kind === "text" && (
                  <>
                    <textarea className="input" rows={2} value={sel.text} onChange={(e) => updOverlay(sel.id, { text: e.target.value } as any)} />
                    <div className="flex items-center gap-2">
                      <input type="color" value={sel.color} onChange={(e) => updOverlay(sel.id, { color: e.target.value } as any)} className="h-8 w-10 rounded" />
                      <input type="number" className="input" value={sel.fontSize} onChange={(e) => updOverlay(sel.id, { fontSize: Number(e.target.value) } as any)} />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-xs text-muted">Aparece (s)</span>
                    <input type="number" step={0.1} min={0} max={dur} className="input" value={sel.startSec.toFixed(1)} onChange={(e) => updOverlay(sel.id, { startSec: Math.min(Number(e.target.value), sel.endSec - 0.2) } as any)} />
                  </label>
                  <label className="space-y-1"><span className="text-xs text-muted">Hasta (s)</span>
                    <input type="number" step={0.1} min={0} max={dur} className="input" value={sel.endSec.toFixed(1)} onChange={(e) => updOverlay(sel.id, { endSec: Math.max(Number(e.target.value), sel.startSec + 0.2) } as any)} />
                  </label>
                </div>
                <p className="text-[11px] text-muted">Arrastra el recuadro en la previsualización para mover/redimensionar.</p>
              </div>
            )}
          </div>

          {/* Audio */}
          <div className="card p-3">
            <span className="label">Audio</span>
            <label className="mt-2 block space-y-1 text-sm">
              <span className="text-xs text-muted">Volumen de la cámara/mic</span>
              <input type="range" min={0} max={1} step={0.05} value={project.baseVolume} onChange={(e) => mut((p) => ({ ...p, baseVolume: Number(e.target.value) }))} className="w-full" />
            </label>
            <div className="mt-2">
              <label className="btn-ghost cursor-pointer"><Music className="h-4 w-4 text-accent" /> {project.music ? "Cambiar música" : "Añadir música"}
                <input type="file" accept="audio/*" className="hidden" onChange={addMusic} />
              </label>
            </div>
            {project.music && (
              <div className="mt-2 space-y-2 text-sm">
                <p className="truncate text-xs text-muted">🎵 {project.music.name}</p>
                <label className="block space-y-1"><span className="text-xs text-muted">Volumen música</span>
                  <input type="range" min={0} max={1} step={0.05} value={project.music.volume} onChange={(e) => mut((p) => ({ ...p, music: p.music ? { ...p.music, volume: Number(e.target.value) } : null }))} className="w-full" />
                </label>
                <button className="text-xs text-danger hover:underline" onClick={() => mut((p) => ({ ...p, music: null }))}>Quitar música</button>
              </div>
            )}
          </div>

          {/* Clips */}
          <div className="card p-3">
            <span className="label">Clips</span>
            <div className="mt-2 space-y-1">
              {project.clips.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1 text-sm">
                  <span className="flex-1 truncate">Clip {i + 1} · {fmt(clipDur(c))}</span>
                  <button onClick={() => mvClip(c.id, -1)} className="text-muted hover:text-fg"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => mvClip(c.id, 1)} className="text-muted hover:text-fg"><ChevronDown className="h-3.5 w-3.5" /></button>
                  {project.clips.length > 1 && (
                    <button onClick={() => delClip(c.id)} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Usa <strong>Cortar</strong> en el punto del reproductor para dividir, y borra los trozos que no quieras.</p>
          </div>

          {status && <p className="text-sm text-accent">{status}</p>}
        </aside>
      </div>
    </div>
  );
}

// Recuadro para mover/redimensionar el overlay seleccionado sobre la previsualización.
function OverlayBox({ overlay, onChange, visible }: { overlay: Overlay; onChange: (t: Partial<Overlay>) => void; visible: boolean }) {
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
    if (d.mode === "move") onChange({ x: cl(d.ox + dx, 0, 1 - d.ow), y: cl(d.oy + dy, 0, 1 - d.oh) } as any);
    else onChange({ w: cl(d.ow + dx, 0.05, 1 - d.ox), h: cl(d.oh + dy, 0.05, 1 - d.oy) } as any);
  }
  function end(e: React.PointerEvent) { drag.current = null; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {} }

  if (!visible) return null;
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
