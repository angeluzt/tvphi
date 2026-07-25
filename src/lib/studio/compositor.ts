import type { Layer, Scene, TransitionKind } from "@/lib/scene";

// Motor de composición: dibuja escenas (capas) sobre un canvas y produce un
// MediaStream (video del canvas + audio mezclado) listo para publicar por WHIP.
// Es el núcleo del "OBS en el navegador".

const W = 1280;
const H = 720;
const FPS = 30;

interface AlertView {
  title: string;
  subtitle?: string;
  accent: string;
  until: number;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;

  private scenes: Scene[] = [];
  private activeId: string | null = null;

  // Fuentes de media compartidas
  private webcamStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private webcamDeviceId: string | null = null;
  private videoEls = new Map<string, HTMLVideoElement>(); // 'webcam' | 'screen'
  private imageEls = new Map<string, HTMLImageElement>(); // por src

  // Audio
  private audioCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private audioSources = new Map<string, MediaStreamAudioSourceNode>();

  // Transición y alertas
  private transition: { from: Scene | null; to: Scene; kind: TransitionKind; start: number; dur: number } | null = null;
  private alert: AlertView | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No se pudo crear el contexto 2D");
    this.ctx = ctx;
  }

  setScenes(scenes: Scene[]) {
    this.scenes = scenes;
    if (!this.activeId && scenes[0]) this.activeId = scenes[0].id;
  }

  getActiveId() {
    return this.activeId;
  }

  private ensureAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.dest = this.audioCtx.createMediaStreamDestination();
    }
  }

  hasWebcam() {
    return !!this.webcamStream;
  }
  hasScreen() {
    return !!this.screenStream;
  }
  getWebcamDeviceId() {
    return this.webcamDeviceId;
  }

  // Lista de cámaras disponibles (requiere permiso ya concedido para ver labels).
  async listCameras(): Promise<{ deviceId: string; label: string }[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${i + 1}` }));
    } catch {
      return [];
    }
  }

  // Enciende (o cambia) la cámara. Si ya está activa con el mismo dispositivo, no hace nada.
  async enableWebcam(deviceId?: string) {
    if (this.webcamStream && (!deviceId || deviceId === this.webcamDeviceId)) return;
    if (this.webcamStream) this.disableWebcam(); // cambio de dispositivo
    const video: MediaTrackConstraints = { width: 1280, height: 720 };
    if (deviceId) video.deviceId = { exact: deviceId };
    this.webcamStream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
    this.webcamDeviceId =
      this.webcamStream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
    const v = document.createElement("video");
    v.srcObject = this.webcamStream;
    v.muted = true;
    v.playsInline = true;
    await v.play().catch(() => {});
    this.videoEls.set("webcam", v);
    this.connectAudio("webcam", this.webcamStream);
  }

  disableWebcam() {
    this.webcamStream?.getTracks().forEach((t) => t.stop());
    this.webcamStream = null;
    this.videoEls.delete("webcam");
    this.disconnectAudio("webcam");
    // Conserva webcamDeviceId como memoria para volver a encender la misma cámara.
  }

  async enableScreen() {
    if (this.screenStream) return;
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const v = document.createElement("video");
    v.srcObject = this.screenStream;
    v.muted = true;
    v.playsInline = true;
    await v.play().catch(() => {});
    this.videoEls.set("screen", v);
    this.connectAudio("screen", this.screenStream);
    // Si el usuario detiene la compartición desde el navegador
    this.screenStream.getVideoTracks()[0]?.addEventListener("ended", () => this.disableScreen());
  }

  disableScreen() {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.videoEls.delete("screen");
    this.disconnectAudio("screen");
  }

  private connectAudio(key: string, stream: MediaStream) {
    if (stream.getAudioTracks().length === 0) return;
    this.ensureAudio();
    if (!this.audioCtx || !this.dest) return;
    const src = this.audioCtx.createMediaStreamSource(stream);
    src.connect(this.dest);
    this.audioSources.set(key, src);
  }
  private disconnectAudio(key: string) {
    this.audioSources.get(key)?.disconnect();
    this.audioSources.delete(key);
  }

  private getImage(src: string): HTMLImageElement {
    let img = this.imageEls.get(src);
    if (!img) {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      this.imageEls.set(src, img);
    }
    return img;
  }

  switchScene(id: string, kind: TransitionKind = "fade", durMs = 500) {
    if (id === this.activeId) return;
    const to = this.scenes.find((s) => s.id === id);
    if (!to) return;
    const from = this.scenes.find((s) => s.id === this.activeId) ?? null;
    if (kind === "cut") {
      this.activeId = id;
      return;
    }
    this.transition = { from, to, kind, start: performance.now(), dur: durMs };
    this.activeId = id;
  }

  pushAlert(a: { title: string; subtitle?: string; accent?: string; durationMs?: number }) {
    this.alert = {
      title: a.title,
      subtitle: a.subtitle,
      accent: a.accent ?? "#8b5cf6",
      until: performance.now() + (a.durationMs ?? 6000),
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
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
    this.disableWebcam();
    this.disableScreen();
    this.audioCtx?.close().catch(() => {});
  }

  captureStream(): MediaStream {
    const stream = (this.canvas as any).captureStream(FPS) as MediaStream;
    this.ensureAudio();
    // Reanuda el contexto (autoplay policies)
    this.audioCtx?.resume().catch(() => {});
    if (this.dest) {
      for (const t of this.dest.stream.getAudioTracks()) stream.addTrack(t);
    }
    return stream;
  }

  // ---------------- render ----------------

  private render() {
    const now = performance.now();
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, W, H);

    const active = this.scenes.find((s) => s.id === this.activeId);

    if (this.transition) {
      const p = Math.min(1, (now - this.transition.start) / this.transition.dur);
      const { from, to, kind } = this.transition;
      if (kind === "fade") {
        if (from) this.renderScene(from, 1);
        this.renderScene(to, p);
      } else if (kind === "slide") {
        const dx = W * (1 - p);
        if (from) this.renderScene(from, 1, -W * p);
        this.renderScene(to, 1, dx);
      }
      if (p >= 1) this.transition = null;
    } else if (active) {
      this.renderScene(active, 1);
    }

    this.renderAlert(now, active);
  }

  private renderScene(scene: Scene, alpha: number, offsetX = 0) {
    const layers = [...scene.layers].sort(
      (a, b) => (a.transform.z ?? 0) - (b.transform.z ?? 0),
    );
    for (const layer of layers) {
      if (!layer.visible) continue;
      this.ctx.save();
      this.ctx.globalAlpha = alpha * (layer.transform.opacity ?? 1);
      this.drawLayer(layer, offsetX);
      this.ctx.restore();
    }
  }

  private rect(layer: Layer, offsetX: number) {
    const t = layer.transform;
    return { x: t.x * W + offsetX, y: t.y * H, w: t.w * W, h: t.h * H };
  }

  private drawLayer(layer: Layer, offsetX: number) {
    const { x, y, w, h } = this.rect(layer, offsetX);
    const ctx = this.ctx;

    switch (layer.type) {
      case "background": {
        if (layer.props.gradientTo) {
          const g = ctx.createLinearGradient(x, y, x + w, y + h);
          g.addColorStop(0, layer.props.color);
          g.addColorStop(1, layer.props.gradientTo);
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = layer.props.color;
        }
        ctx.fillRect(x, y, w, h);
        break;
      }
      case "webcam":
      case "screen": {
        const v = this.videoEls.get(layer.type);
        if (v && v.readyState >= 2) this.drawMediaCover(v, x, y, w, h);
        else this.drawPlaceholder(x, y, w, h, layer.type === "webcam" ? "Cámara" : "Pantalla");
        break;
      }
      case "image": {
        const img = this.getImage(layer.props.src);
        if (img.complete && img.naturalWidth) {
          if (layer.props.fit === "contain") this.drawMediaContain(img, x, y, w, h);
          else this.drawMediaCover(img, x, y, w, h);
        }
        break;
      }
      case "video": {
        let v = this.videoEls.get(layer.id);
        if (!v) {
          v = document.createElement("video");
          v.src = layer.props.src;
          v.loop = layer.props.loop;
          v.muted = layer.props.muted;
          v.playsInline = true;
          v.play().catch(() => {});
          this.videoEls.set(layer.id, v);
        }
        if (v.readyState >= 2) this.drawMediaCover(v, x, y, w, h);
        break;
      }
      case "text": {
        const p = layer.props;
        ctx.font = `${p.fontWeight} ${p.fontSize}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "top";
        ctx.textAlign = p.align as CanvasTextAlign;
        if (p.background && p.background !== "transparent") {
          ctx.fillStyle = p.background;
          ctx.fillRect(x, y, w, h);
        }
        ctx.fillStyle = p.color;
        const tx = p.align === "center" ? x + w / 2 : p.align === "right" ? x + w : x;
        this.wrapText(p.text, tx, y + 4, w, p.fontSize * 1.2);
        break;
      }
      case "alerts":
        // Se dibuja en renderAlert (por encima de todo).
        break;
    }
  }

  private drawMediaCover(media: CanvasImageSource, x: number, y: number, w: number, h: number) {
    const mw = (media as any).videoWidth || (media as any).naturalWidth || w;
    const mh = (media as any).videoHeight || (media as any).naturalHeight || h;
    const scale = Math.max(w / mw, h / mh);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (mw - sw) / 2;
    const sy = (mh - sh) / 2;
    this.ctx.drawImage(media, sx, sy, sw, sh, x, y, w, h);
  }
  private drawMediaContain(media: CanvasImageSource, x: number, y: number, w: number, h: number) {
    const mw = (media as any).naturalWidth || w;
    const mh = (media as any).naturalHeight || h;
    const scale = Math.min(w / mw, h / mh);
    const dw = mw * scale;
    const dh = mh * scale;
    this.ctx.drawImage(media, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  private drawPlaceholder(x: number, y: number, w: number, h: number, label: string) {
    this.ctx.fillStyle = "#14141f";
    this.ctx.fillRect(x, y, w, h);
    this.ctx.fillStyle = "#5a5a72";
    this.ctx.font = "600 24px Inter, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(`${label} sin señal`, x + w / 2, y + h / 2);
  }
  private wrapText(text: string, x: number, y: number, maxW: number, lineH: number) {
    const words = text.split(/\s+/);
    let line = "";
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(test).width > maxW && line) {
        this.ctx.fillText(line, x, yy);
        line = word;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) this.ctx.fillText(line, x, yy);
  }

  private renderAlert(now: number, scene?: Scene) {
    if (!this.alert) return;
    if (now > this.alert.until) {
      this.alert = null;
      return;
    }
    const ctx = this.ctx;
    // La capa "Alertas" define dónde aparecen las notificaciones.
    const alertsLayer = scene?.layers.find((l) => l.type === "alerts" && l.visible);
    let w = 620;
    let x = (W - w) / 2;
    let y = 40;
    if (alertsLayer) {
      const t = alertsLayer.transform;
      w = Math.max(320, Math.min(W, t.w * W));
      x = Math.max(0, Math.min(W - w, t.x * W));
      y = Math.max(0, Math.min(H - 120, t.y * H));
    }
    const h = 96;
    ctx.save();
    ctx.globalAlpha = 0.95;
    this.roundRect(x, y, w, h, 18);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, this.alert.accent + "cc");
    g.addColorStop(1, "#0a0a10ee");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "800 30px Inter, sans-serif";
    ctx.fillText(this.trunc(this.alert.title, 34), x + 28, y + 20);
    if (this.alert.subtitle) {
      ctx.font = "500 20px Inter, sans-serif";
      ctx.fillStyle = "#ffffffcc";
      ctx.fillText(this.trunc(this.alert.subtitle, 46), x + 28, y + 56);
    }
    ctx.restore();
  }
  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  private trunc(s: string, n: number) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
}
