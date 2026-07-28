import {
  slideDur, slideStarts, totalDuration, locate, TRANSITION_DUR,
  type StoryProject, type StorySlide, type PanDir, type ZoomKind,
} from "./model";
import { getAsset, assetUrl } from "./store";
import { Recorder } from "@/lib/studio/recorder";

const W = 1280;
const H = 720;
const lerp = (a: number, b: number, p: number) => a + (b - a) * Math.max(0, Math.min(1, p));

// Motor de "Historias narradas": anima imágenes (Ken Burns) con transiciones y
// overlays, mezcla el audio (narración + música + SFX) y exporta re-grabando.
export class StoryEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: StoryProject | null = null;

  private audioCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private audioStartCtx = 0;
  private audioStartHead = 0;

  private images = new Map<string, HTMLImageElement>();
  private buffers = new Map<string, AudioBuffer>();

  private raf = 0;
  private running = false;
  private playing = false;
  playhead = 0;
  onTime: ((t: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
  }

  private ensureAudio() {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.dest = this.audioCtx.createMediaStreamDestination();
  }

  async setProject(p: StoryProject) {
    this.project = p;
    await this.ensureAssets(p);
    this.render();
  }
  update(p: StoryProject) {
    this.project = p;
    void this.ensureAssets(p);
    if (!this.playing) this.render();
  }

  private async ensureAssets(p: StoryProject) {
    const imgIds = new Set<string>();
    const audioIds = new Set<string>();
    for (const s of p.slides) {
      imgIds.add(s.imageId);
      if (s.audioId) audioIds.add(s.audioId);
      for (const o of s.overlays) imgIds.add(o.imageId);
    }
    for (const l of p.audioLayers) audioIds.add(l.audioId);

    await Promise.all([
      ...[...imgIds].map(async (id) => {
        if (this.images.has(id)) return;
        const url = await assetUrl(id);
        if (!url) return;
        const img = new Image();
        img.src = url;
        this.images.set(id, img);
      }),
      ...[...audioIds].map(async (id) => {
        if (this.buffers.has(id)) return;
        const blob = await getAsset(id);
        if (!blob) return;
        this.ensureAudio();
        try {
          const buf = await this.audioCtx!.decodeAudioData(await blob.arrayBuffer());
          this.buffers.set(id, buf);
        } catch {}
      }),
    ]);
  }

  duration() {
    return this.project ? totalDuration(this.project) : 0;
  }

  // ---------------- audio ----------------
  private stopSources() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources = [];
  }
  private scheduleAudio(fromT: number) {
    if (!this.project) return;
    this.ensureAudio();
    const ctx = this.audioCtx!;
    const now = ctx.currentTime + 0.06;
    this.audioStartCtx = now;
    this.audioStartHead = fromT;

    const events: { t: number; buf: AudioBuffer; gain: number; loop: boolean }[] = [];
    const starts = slideStarts(this.project);
    this.project.slides.forEach((s, i) => {
      if (s.audioId && this.buffers.has(s.audioId)) {
        events.push({ t: starts[i], buf: this.buffers.get(s.audioId)!, gain: this.project!.narrationVolume, loop: false });
      }
    });
    for (const l of this.project.audioLayers) {
      const buf = this.buffers.get(l.audioId);
      if (buf) events.push({ t: l.startSec, buf, gain: l.volume, loop: l.loop });
    }

    for (const ev of events) {
      const endT = ev.loop ? Infinity : ev.t + ev.buf.duration;
      if (endT <= fromT) continue;
      const src = ctx.createBufferSource();
      src.buffer = ev.buf;
      src.loop = ev.loop;
      const g = ctx.createGain();
      g.gain.value = ev.gain;
      src.connect(g);
      g.connect(this.dest!);
      g.connect(ctx.destination);
      const when = now + Math.max(0, ev.t - fromT);
      const offset = Math.max(0, fromT - ev.t);
      try {
        src.start(when, ev.loop ? offset % ev.buf.duration : offset);
        this.sources.push(src);
      } catch {}
    }
  }

  // ---------------- loop ----------------
  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (this.playing && this.audioCtx) {
        this.playhead = this.audioStartHead + (this.audioCtx.currentTime - this.audioStartCtx);
        if (this.playhead >= this.duration()) {
          this.playhead = this.duration();
          this.pause();
          this.onTime?.(this.playhead);
          this.onEnded?.();
          this.render();
          this.raf = requestAnimationFrame(loop);
          return;
        }
        this.onTime?.(this.playhead);
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  destroy() {
    this.stop();
    this.pause();
    this.audioCtx?.close().catch(() => {});
  }

  async play() {
    if (!this.project || this.playing) return;
    this.ensureAudio();
    await this.audioCtx?.resume().catch(() => {});
    if (this.playhead >= this.duration() - 0.05) this.playhead = 0;
    this.scheduleAudio(this.playhead);
    this.playing = true;
    this.start();
  }
  pause() {
    this.playing = false;
    this.stopSources();
  }
  seek(t: number) {
    const was = this.playing;
    this.pause();
    this.playhead = Math.max(0, Math.min(this.duration(), t));
    this.onTime?.(this.playhead);
    this.render();
    if (was) void this.play();
  }

  // ---------------- render ----------------
  private render() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (!this.project) return;
    const loc = locate(this.project, this.playhead);
    if (!loc) return;
    const i = loc.index;
    const slide = this.project.slides[i];
    if (!slide) return;
    const dur = slideDur(slide);
    const inT = loc.progress * dur;
    const entering = i > 0 && slide.transition !== "cut" && inT < TRANSITION_DUR;

    if (entering) {
      const prev = this.project.slides[i - 1];
      this.drawSlide(prev, 1, 1, 0);
      const a = inT / TRANSITION_DUR;
      if (slide.transition === "fade") this.drawSlide(slide, loc.progress, a, 0);
      else this.drawSlide(slide, loc.progress, 1, (1 - a) * W);
    } else {
      this.drawSlide(slide, loc.progress, 1, 0);
    }
  }

  private drawSlide(slide: StorySlide, p: number, alpha: number, offsetX: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (offsetX) ctx.translate(offsetX, 0);
    const img = this.images.get(slide.imageId);
    if (img && img.complete && img.naturalWidth) this.drawKenBurns(img, p, slide.pan, slide.zoom);
    // overlays PNG
    for (const o of slide.overlays) {
      const oi = this.images.get(o.imageId);
      if (oi && oi.complete && oi.naturalWidth) {
        const x = o.x * W, y = o.y * H, w = o.w * W, h = o.h * H;
        const sc = Math.min(w / oi.naturalWidth, h / oi.naturalHeight);
        const dw = oi.naturalWidth * sc, dh = oi.naturalHeight * sc;
        ctx.drawImage(oi, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
    }
    ctx.restore();
  }

  private drawKenBurns(img: HTMLImageElement, p: number, pan: PanDir, zoom: ZoomKind) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cover = Math.max(W / iw, H / ih);
    const zf = zoom === "in" ? lerp(1.0, 1.18, p) : zoom === "out" ? lerp(1.18, 1.0, p) : 1.1;
    const s = cover * zf;
    const dw = iw * s, dh = ih * s;
    const exX = dw - W, exY = dh - H;
    const travel = 0.6;
    let cx = 0.5, cy = 0.5;
    if (pan === "left") cx = lerp(0.5 - 0.5 * travel, 0.5 + 0.5 * travel, p);
    else if (pan === "right") cx = lerp(0.5 + 0.5 * travel, 0.5 - 0.5 * travel, p);
    else if (pan === "up") cy = lerp(0.5 - 0.5 * travel, 0.5 + 0.5 * travel, p);
    else if (pan === "down") cy = lerp(0.5 + 0.5 * travel, 0.5 - 0.5 * travel, p);
    const tx = -(exX * cx);
    const ty = -(exY * cy);
    this.ctx.drawImage(img, tx, ty, dw, dh);
  }

  // ---------------- export ----------------
  async export(mimeType: string, onProgress?: (p: number) => void): Promise<Blob> {
    if (!this.project) throw new Error("Sin proyecto");
    this.pause();
    this.ensureAudio();
    await this.audioCtx?.resume().catch(() => {});
    const dur = this.duration();
    const stream = (this.canvas as any).captureStream(30) as MediaStream;
    if (this.dest) for (const t of this.dest.stream.getAudioTracks()) stream.addTrack(t);
    const mime = mimeType || Recorder.pickMime();
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 10_000_000 });
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

    return new Promise<Blob>((resolve, reject) => {
      let done = false;
      const prevEnded = this.onEnded;
      const prevTime = this.onTime;
      const finish = () => {
        if (done) return;
        done = true;
        this.onEnded = prevEnded;
        this.onTime = prevTime;
        clearTimeout(watchdog);
        this.pause();
        if (mr.state !== "inactive") mr.stop();
      };
      mr.onstop = () => resolve(new Blob(chunks, { type: mime || "video/webm" }));
      const watchdog = setTimeout(finish, Math.ceil(dur * 1000) + 5000);
      try {
        this.playhead = 0;
        this.scheduleAudio(0);
        this.playing = true;
        this.start();
        mr.start(1000);
        this.onEnded = () => setTimeout(finish, 200);
        this.onTime = (t) => { prevTime?.(t); onProgress?.(dur ? t / dur : 0); };
      } catch (e) {
        clearTimeout(watchdog);
        reject(e);
      }
    });
  }
}
