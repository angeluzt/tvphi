import {
  clipStarts,
  clipDur,
  totalDuration,
  locate,
  type EditorProject,
  type Overlay,
} from "./model";
import { Recorder } from "@/lib/studio/recorder";

const W = 1280;
const H = 720;

// Motor de post-producción: reproduce/renderiza la línea de tiempo (clips + overlays
// + audio base + música) sobre un canvas, y exporta re-grabando la composición.
export class EditorEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private musicEl: HTMLAudioElement;
  private project: EditorProject | null = null;

  private audioCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private gainBase: GainNode | null = null;
  private gainMusic: GainNode | null = null;
  private wired = false;

  private raf = 0;
  private running = false;
  private playing = false;
  private clipIndex = 0;
  playhead = 0;
  onTime: ((t: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  private images = new Map<string, HTMLImageElement>();

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = false;
    this.musicEl = document.createElement("audio");
    this.musicEl.loop = false;
  }

  private ensureAudio() {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.dest = this.audioCtx.createMediaStreamDestination();
    this.gainBase = this.audioCtx.createGain();
    this.gainMusic = this.audioCtx.createGain();
    try {
      const vs = this.audioCtx.createMediaElementSource(this.video);
      vs.connect(this.gainBase);
      const ms = this.audioCtx.createMediaElementSource(this.musicEl);
      ms.connect(this.gainMusic);
      this.gainBase.connect(this.dest);
      this.gainBase.connect(this.audioCtx.destination);
      this.gainMusic.connect(this.dest);
      this.gainMusic.connect(this.audioCtx.destination);
      this.wired = true;
    } catch {
      this.wired = false;
    }
  }

  async setProject(p: EditorProject) {
    const changedSource = this.project?.source.url !== p.source.url;
    this.project = p;
    if (changedSource) {
      this.video.src = p.source.url;
      await new Promise<void>((res) => {
        this.video.onloadeddata = () => res();
        this.video.onerror = () => res();
      });
      // Fuerza el decodificado de un fotograma para que el preview no salga negro
      // (un <video> pausado en t=0 puede no tener frame hasta que se hace seek).
      await this.seekVideo(Math.min(0.1, p.source.duration || 0.1));
      this.video.addEventListener("seeked", () => { if (!this.playing) this.render(); });
    }
    this.applyVolumes();
    this.applyMusicSource();
    this.render();
  }

  update(p: EditorProject) {
    this.project = p;
    this.applyVolumes();
    this.applyMusicSource();
    if (!this.playing) this.render();
  }

  private applyVolumes() {
    if (!this.project) return;
    this.ensureAudio();
    if (this.gainBase) this.gainBase.gain.value = this.project.baseVolume;
    if (this.gainMusic) this.gainMusic.gain.value = this.project.music?.volume ?? 0;
    if (!this.wired) {
      // Fallback si WebAudio no pudo enrutar: usa volúmenes del elemento.
      this.video.volume = this.project.baseVolume;
      this.musicEl.volume = this.project.music?.volume ?? 0;
    }
  }
  private applyMusicSource() {
    const url = this.project?.music?.url ?? "";
    if (this.musicEl.src !== url) this.musicEl.src = url;
  }

  duration() {
    return this.project ? totalDuration(this.project) : 0;
  }

  private getImage(src: string) {
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      this.images.set(src, img);
    }
    return img;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick();
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
    this.video.src = "";
    this.musicEl.src = "";
    this.audioCtx?.close().catch(() => {});
  }

  async play() {
    if (!this.project || this.playing) return;
    this.ensureAudio();
    await this.audioCtx?.resume().catch(() => {});
    if (this.playhead >= this.duration() - 0.05) await this.seek(0);
    else await this.seek(this.playhead);
    this.playing = true;
    await this.video.play().catch(() => {});
    if (this.project.music) this.musicEl.play().catch(() => {});
    this.start();
  }
  pause() {
    this.playing = false;
    this.video.pause();
    this.musicEl.pause();
  }

  async seek(t: number) {
    if (!this.project) return;
    const dur = this.duration();
    this.playhead = Math.max(0, Math.min(dur, t));
    const loc = locate(this.project, this.playhead);
    if (loc) {
      this.clipIndex = loc.clipIndex;
      await this.seekVideo(loc.sourceTime);
    }
    // música según tiempo global
    const m = this.project.music;
    if (m) {
      const mt = this.playhead - m.startSec;
      if (mt >= 0) {
        try { this.musicEl.currentTime = mt; } catch {}
      }
    }
    this.onTime?.(this.playhead);
    this.render();
  }

  private seekVideo(t: number): Promise<void> {
    return new Promise((res) => {
      if (Math.abs(this.video.currentTime - t) < 0.05) return res();
      const done = () => { this.video.removeEventListener("seeked", done); res(); };
      this.video.addEventListener("seeked", done);
      try { this.video.currentTime = t; } catch { res(); }
    });
  }

  private tick() {
    if (!this.project) return;
    if (this.playing) {
      const clip = this.project.clips[this.clipIndex];
      if (clip && (this.video.currentTime >= clip.outSec - 0.03 || this.video.ended)) {
        // avanza al siguiente clip
        if (this.clipIndex < this.project.clips.length - 1) {
          this.clipIndex++;
          const next = this.project.clips[this.clipIndex];
          try { this.video.currentTime = next.inSec; } catch {}
        } else {
          this.pause();
          this.playhead = this.duration();
          this.onTime?.(this.playhead);
          this.onEnded?.();
          this.render();
          return;
        }
      }
      const starts = clipStarts(this.project);
      const cur = this.project.clips[this.clipIndex];
      this.playhead = (starts[this.clipIndex] ?? 0) + Math.max(0, this.video.currentTime - cur.inSec);
      this.onTime?.(this.playhead);
    }
    this.render();
  }

  private render() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (this.video.readyState >= 2) this.drawCover(this.video);
    if (this.project) {
      for (const o of this.project.overlays) {
        if (this.playhead >= o.startSec && this.playhead <= o.endSec) this.drawOverlay(o);
      }
    }
  }

  private drawCover(media: CanvasImageSource) {
    const mw = (media as any).videoWidth || (media as any).naturalWidth || W;
    const mh = (media as any).videoHeight || (media as any).naturalHeight || H;
    const scale = Math.max(W / mw, H / mh);
    const sw = W / scale;
    const sh = H / scale;
    this.ctx.drawImage(media, (mw - sw) / 2, (mh - sh) / 2, sw, sh, 0, 0, W, H);
  }

  private drawOverlay(o: Overlay) {
    const x = o.x * W, y = o.y * H, w = o.w * W, h = o.h * H;
    const ctx = this.ctx;
    if (o.kind === "image") {
      const img = this.getImage(o.src);
      if (img.complete && img.naturalWidth) {
        const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
    } else {
      ctx.font = `700 ${o.fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = o.color;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      const words = o.text.split(/\s+/);
      let line = "", yy = y;
      for (const wd of words) {
        const test = line ? `${line} ${wd}` : wd;
        if (ctx.measureText(test).width > w && line) { ctx.fillText(line, x, yy); line = wd; yy += o.fontSize * 1.2; }
        else line = test;
      }
      if (line) ctx.fillText(line, x, yy);
    }
  }

  // Exporta la composición completa re-grabando en tiempo real.
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

    return new Promise<Blob>(async (resolve, reject) => {
      let done = false;
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
      const prevEnded = this.onEnded;
      const prevTime = this.onTime;
      // Watchdog: garantiza que la exportación termina aunque el fin no se detecte.
      const watchdog = setTimeout(finish, Math.ceil(dur * 1000) + 4000);
      try {
        await this.seek(0);
        mr.start(1000);
        this.playing = true;
        await this.video.play().catch(() => {});
        if (this.project!.music) this.musicEl.play().catch(() => {});
        this.start();
        this.onEnded = () => setTimeout(finish, 200);
        this.onTime = (t) => { prevTime?.(t); onProgress?.(dur ? t / dur : 0); };
      } catch (e) {
        clearTimeout(watchdog);
        reject(e);
      }
    });
  }
}
