// Grabadora sobre un MediaStream (la salida del compositor). Produce WebM.

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private mimeType = "";

  // Elige el mejor contenedor/códec soportado (VP9 → VP8 → por defecto).
  static pickMime(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  // MP4/H.264 si el navegador lo soporta al grabar (Chrome reciente, Safari).
  static pickMp4(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/mp4;codecs=avc1.640028,mp4a.40.2",
      "video/mp4;codecs=avc1,mp4a",
      "video/mp4",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  start(stream: MediaStream, opts?: { videoBitsPerSecond?: number }) {
    this.chunks = [];
    this.mimeType = Recorder.pickMime();
    this.mr = new MediaRecorder(stream, {
      mimeType: this.mimeType || undefined,
      videoBitsPerSecond: opts?.videoBitsPerSecond ?? 10_000_000,
    });
    this.mr.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.mr.start(1000); // chunks cada 1s
    this.startedAt = performance.now();
    this.pausedTotal = 0;
    this.pausedAt = 0;
  }

  pause() {
    if (this.mr?.state === "recording") {
      this.mr.pause();
      this.pausedAt = performance.now();
    }
  }
  resume() {
    if (this.mr?.state === "paused") {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = 0;
      this.mr.resume();
    }
  }

  get state(): "inactive" | "recording" | "paused" {
    return (this.mr?.state as any) ?? "inactive";
  }

  // Milisegundos grabados (sin contar el tiempo en pausa).
  elapsedMs(): number {
    if (!this.mr) return 0;
    const now = this.mr.state === "paused" && this.pausedAt ? this.pausedAt : performance.now();
    return now - this.startedAt - this.pausedTotal;
  }

  stop(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      const mr = this.mr;
      if (!mr) return reject(new Error("No hay grabación activa"));
      const durationMs = this.elapsedMs();
      mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
        this.mr = null;
        resolve({ blob, mimeType: this.mimeType || "video/webm", durationMs });
      };
      mr.stop();
    });
  }
}
