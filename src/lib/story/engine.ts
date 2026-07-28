import {
  flatten, locate, lerpFrame, framePx, resolveFrames, moveProgress, overlayBox,
  type StoryProject, type FlatShot, type PngOverlay, type Frame,
} from "./model";
import { getAsset, assetUrl } from "./store";
import { Recorder } from "@/lib/studio/recorder";

const W = 1280;
const H = 720;

// Motor de "Historias narradas": anima el encuadre de cada toma sobre su imagen,
// encadena transiciones, dibuja los stickers, mezcla el audio (diálogos + efectos
// por toma + música global) y exporta re-grabando la composición.
export class StoryEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: StoryProject | null = null;
  private flat: FlatShot[] = [];

  private audioCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private keepAlive: ConstantSourceNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  // Ganancias vivas por clip, para que mover un volumen se oiga al momento.
  private gains = new Map<string, GainNode>();
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
    // Fuente muda permanente: si al destino no hay nada conectado, la pista de
    // audio no emite muestras y el grabador acaba produciendo un archivo vacío.
    // Con esto la mezcla siempre fluye, aunque la historia aún no tenga voz ni
    // música (suena a silencio: la ganancia es 0).
    try {
      const keep = this.audioCtx.createConstantSource();
      const g = this.audioCtx.createGain();
      g.gain.value = 0;
      keep.connect(g);
      g.connect(this.dest);
      keep.start();
      this.keepAlive = keep;
    } catch {}
  }

  async setProject(p: StoryProject) {
    this.project = p;
    this.flat = flatten(p);
    await this.ensureAssets(p);
    this.render();
  }
  update(p: StoryProject) {
    this.project = p;
    this.flat = flatten(p);
    void this.ensureAssets(p);
    this.applyVolumes();
    if (!this.playing) this.render();
  }

  private async ensureAssets(p: StoryProject) {
    const imgIds = new Set<string>();
    const audioIds = new Set<string>();
    for (const sc of p.scenes) {
      imgIds.add(sc.imageId);
      for (const sh of sc.shots) {
        for (const d of sh.dialogues) if (d.audioId) audioIds.add(d.audioId);
        for (const s of sh.sfx) audioIds.add(s.audioId);
        for (const o of sh.overlays) imgIds.add(o.imageId);
      }
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
        // Repinta en cuanto la imagen esté lista (si no se está reproduciendo).
        img.decode?.().then(() => { if (!this.playing) this.render(); }).catch(() => {});
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
    return this.flat.reduce((a, f) => a + f.dur, 0);
  }

  // ---------------- audio ----------------
  private stopSources() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources = [];
    this.gains.clear();
  }

  // Vuelca los volúmenes actuales del proyecto sobre las ganancias ya sonando,
  // para que mover un deslizador se oiga sin reiniciar la reproducción.
  private applyVolumes() {
    const p = this.project;
    if (!p || !this.gains.size || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    for (const f of this.flat) {
      for (const d of f.shot.dialogues) this.gains.get(`dlg:${d.id}`)?.gain.setTargetAtTime(p.narrationVolume, now, 0.02);
      for (const s of f.shot.sfx) this.gains.get(`sfx:${s.id}`)?.gain.setTargetAtTime(s.volume, now, 0.02);
    }
    for (const l of p.audioLayers) this.gains.get(`lay:${l.id}`)?.gain.setTargetAtTime(l.volume, now, 0.02);
  }

  private scheduleAudio(fromT: number) {
    if (!this.project) return;
    this.ensureAudio();
    const ctx = this.audioCtx!;
    const now = ctx.currentTime + 0.06;
    this.audioStartCtx = now;
    this.audioStartHead = fromT;
    this.gains.clear();

    const events: { key: string; t: number; audioId: string; gain: number; loop: boolean }[] = [];
    for (const f of this.flat) {
      for (const d of f.shot.dialogues) {
        if (d.audioId) {
          events.push({ key: `dlg:${d.id}`, t: f.start + d.startSec, audioId: d.audioId, gain: this.project.narrationVolume, loop: false });
        }
      }
      for (const s of f.shot.sfx) {
        events.push({ key: `sfx:${s.id}`, t: f.start + s.startSec, audioId: s.audioId, gain: s.volume, loop: false });
      }
    }
    for (const l of this.project.audioLayers) {
      events.push({ key: `lay:${l.id}`, t: l.startSec, audioId: l.audioId, gain: l.volume, loop: l.loop });
    }

    for (const ev of events) {
      const buf = this.buffers.get(ev.audioId);
      if (!buf) continue;
      const endT = ev.loop ? Infinity : ev.t + buf.duration;
      if (endT <= fromT) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = ev.loop;
      const g = ctx.createGain();
      g.gain.value = ev.gain;
      src.connect(g);
      g.connect(this.dest!);
      g.connect(ctx.destination);
      const when = now + Math.max(0, ev.t - fromT);
      const offset = Math.max(0, fromT - ev.t);
      try {
        src.start(when, ev.loop ? offset % buf.duration : offset);
        this.sources.push(src);
        this.gains.set(ev.key, g);
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

  // Coloca el reproductor al principio de una toma concreta.
  seekToShot(shotId: string) {
    const f = this.flat.find((x) => x.shot.id === shotId);
    if (f) this.seek(f.start + 0.01);
  }

  // ---------------- render ----------------
  private render() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (!this.project || !this.flat.length) return;

    const i = locate(this.flat, this.playhead);
    if (i < 0) return;
    const cur = this.flat[i];
    const lt = Math.max(0, Math.min(cur.dur, this.playhead - cur.start));
    const tDur = Math.max(0, Math.min(cur.dur, cur.shot.transitionDur));
    const entering = i > 0 && cur.shot.transition !== "cut" && tDur > 0 && lt < tDur;

    if (entering) {
      const prev = this.flat[i - 1];
      this.drawShot(prev, prev.dur, 1, 0); // la anterior, en su estado final
      const a = lt / tDur;
      if (cur.shot.transition === "fade") this.drawShot(cur, lt, a, 0);
      else this.drawShot(cur, lt, 1, (1 - a) * W);
    } else {
      this.drawShot(cur, lt, 1, 0);
    }
  }

  private drawShot(f: FlatShot, lt: number, alpha: number, offsetX: number) {
    const ctx = this.ctx;
    // La velocidad la marca la duración de la toma; la pausa final deja la
    // imagen quieta en el punto 2.
    const p = moveProgress(f.shot, lt);
    const img = this.images.get(f.scene.imageId);
    const iw = img?.naturalWidth || f.scene.imgW || 16;
    const ih = img?.naturalHeight || f.scene.imgH || 9;
    const frames = resolveFrames(f.shot, iw, ih);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (offsetX) ctx.translate(offsetX, 0);
    if (img && img.complete && img.naturalWidth) {
      const fr = lerpFrame(frames.from, frames.to, p);
      const { sx, sy, sw, sh } = framePx(fr, iw, ih);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    }
    ctx.restore();

    // Stickers: heredan la transición de entrada de la toma o llevan la suya,
    // y se mueven según su propio modo (quieto, pegado a la imagen o libre).
    for (const o of f.shot.overlays) {
      const oi = this.images.get(o.imageId);
      if (!oi || !oi.complete || !oi.naturalWidth) continue;
      let oa = alpha;
      let ox = offsetX;
      if (o.transition !== "inherit") {
        const td = Math.max(0.01, f.shot.transitionDur);
        const a = Math.max(0, Math.min(1, lt / td));
        oa = o.transition === "fade" ? a : 1;
        ox = o.transition === "slide" ? (1 - a) * W : 0;
      }
      ctx.save();
      ctx.globalAlpha = oa;
      if (ox) ctx.translate(ox, 0);
      this.drawOverlay(o, oi, p, frames, iw, ih);
      ctx.restore();
    }
  }

  private drawOverlay(
    o: PngOverlay,
    img: HTMLImageElement,
    p: number,
    frames: { from: Frame; to: Frame },
    iw: number,
    ih: number,
  ) {
    const b = overlayBox(o, p, frames, iw, ih);
    const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
    if (w <= 0 || h <= 0) return;
    const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    this.ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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
