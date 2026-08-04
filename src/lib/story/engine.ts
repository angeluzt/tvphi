import {
  flatten, locate, lerpFrame, framePx, frameH, moveProgress, overlayBox,
  dialogueStarts, sfxStarts, loopSpan, dialogueDur, VOICE_RATE, ASPECTS, aspectInfo, setProjectAspect,
  overlayWindows, overlaySoundStart, vfxWindow, capasVfxActivas, esVfxDeEscena,
  type StoryProject, type FlatShot, type PngOverlay, type Frame, type VoiceEffect,
  type ClipVideo, type VfxLayer,
} from "./model";
import { VfxScene, type VfxInput } from "./vfx";
import { stretchBuffer } from "./stretch";
import { getAsset, assetUrl } from "./store";
import { Recorder } from "@/lib/studio/recorder";


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
  private extras: (() => void)[] = []; // apagar osciladores de los efectos
  // Ganancias vivas por clip, para que mover un volumen se oiga al momento.
  private gains = new Map<string, GainNode>();
  private audioStartCtx = 0;
  private audioStartHead = 0;

  private images = new Map<string, HTMLImageElement>();
  private buffers = new Map<string, AudioBuffer>();
  // Voces ya estiradas para una velocidad/tono concretos. Estirar cuesta unos
  // milisegundos, así que se guarda el resultado: mientras no se toquen las
  // barras, no se vuelve a calcular.
  private estirados = new Map<string, AudioBuffer>();
  // Stickers animados (GIF) ya descompuestos en fotogramas: el lienzo solo sabe
  // dibujar imágenes quietas, así que hay que elegir el fotograma a mano.
  private anims = new Map<string, { frames: ImageBitmap[]; ends: number[]; total: number }>();
  // Partículas: UNA ESCENA POR TOMA, no una sola compartida.
  //
  // Durante un fundido se dibujan dos tomas a la vez. Con una escena única, las
  // dos se pisaban: cada una veía la clave de la otra, se reiniciaba y volvía a
  // simular desde su segundo cero, dos veces por fotograma.
  //
  // Aviso honesto: se midió y esto NO era la causa del tirón al cambiar de
  // escena (105.7 ms por fotograma antes, 103.2 ms después: lo mismo). El tirón
  // era otra cosa — los efectos continuos arrancaban vacíos, y eso se arregla
  // en vfx.ts. Esto se queda porque el trabajo por fotograma pasa a estar
  // acotado en vez de depender de lo larga que sea la toma que sale, pero no
  // hay que atribuirle una mejora que no se ha visto.
  private vfxScenes = new Map<string, VfxScene>();

  // La de esa toma, creándola si hace falta. Se guardan unas pocas: las que
  // están a la vista y alguna más para ir y venir sin recalcular.
  private escenaVfx(shotId: string) {
    let e = this.vfxScenes.get(shotId);
    if (e) {
      // Se reinserta para que la más usada sea la última en caer.
      this.vfxScenes.delete(shotId);
      this.vfxScenes.set(shotId, e);
      return e;
    }
    e = new VfxScene();
    this.vfxScenes.set(shotId, e);
    if (this.vfxScenes.size > 4) {
      const vieja = this.vfxScenes.keys().next().value;
      if (vieja !== undefined) this.vfxScenes.delete(vieja);
    }
    return e;
  }

  private raf = 0;
  private running = false;
  private playing = false;
  // Tramo acotado: al reproducir una escena o una toma sueltas, solo suena eso.
  private rangeStart = 0;
  private rangeEnd = Infinity;
  // Repetir el tramo sin parar: sirve de vista previa mientras se colocan los
  // stickers, para ver el efecto sin tener que dar al play cada vez.
  private looping = false;
  // En pausa: los VFX siguen animándose (sin audio ni avanzar el playhead) para
  // poder colocar sitios viendo lluvia/fuego/portal en vivo.
  private vfxLive = true;
  private vfxExtra = 0;
  private lastVfxFrame = 0;
  playhead = 0;
  onTime: ((t: number) => void) | null = null;
  onEnded: (() => void) | null = null;
  // El motor es quien manda sobre si suena o no; la interfaz solo lo refleja.
  onPlaying: ((v: boolean) => void) | null = null;
  private starting = false; // evita programar el audio dos veces a la vez

  // Tamaño del lienzo: lo marca el formato del proyecto (horizontal, vertical
  // o cuadrado). Todo lo que se dibuja se mide sobre estos dos números.
  private w = ASPECTS[0].w;
  private h = ASPECTS[0].h;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.w;
    this.canvas.height = this.h;
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

  // Cambia el tamaño del lienzo si el formato del proyecto es otro. Se hace
  // antes de calcular nada: los encuadres dependen de la forma del video.
  private applyAspect(p: StoryProject) {
    setProjectAspect(p.aspect);
    const a = aspectInfo(p.aspect);
    if (this.w === a.w && this.h === a.h) return false;
    this.w = a.w;
    this.h = a.h;
    this.canvas.width = a.w;
    this.canvas.height = a.h;
    return true;
  }

  async setProject(p: StoryProject) {
    this.applyAspect(p);
    this.project = p;
    this.flat = flatten(p);
    await this.ensureAssets(p);
    this.render();
  }
  update(p: StoryProject) {
    this.applyAspect(p);
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
        for (const o of sh.overlays) {
          imgIds.add(o.imageId);
          if (o.soundId) audioIds.add(o.soundId);
        }
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
        void this.loadAnim(id);
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

  // Si el sticker es un GIF con varios fotogramas, se descompone para poder
  // animarlo. Un GIF de un solo fotograma se deja como imagen normal.
  private async loadAnim(id: string) {
    const Decoder = (globalThis as any).ImageDecoder;
    if (!Decoder || this.anims.has(id)) return;
    const blob = await getAsset(id);
    if (!blob) return;
    const datos = await blob.arrayBuffer();
    // Por la firma del archivo, no por el tipo declarado (que a veces falta).
    const firma = new Uint8Array(datos.slice(0, 3));
    if (!(firma[0] === 0x47 && firma[1] === 0x49 && firma[2] === 0x46)) return; // "GIF"
    try {
      const dec = new Decoder({ data: datos, type: "image/gif" });
      // Hay que esperar a las dos: una dice cuántos fotogramas hay y la otra
      // que ya están todos disponibles.
      await dec.tracks.ready;
      await dec.completed;
      const total = dec.tracks?.selectedTrack?.frameCount ?? 1;
      if (total <= 1) { dec.close?.(); return; }
      const frames: ImageBitmap[] = [];
      const ends: number[] = [];
      let t = 0;
      const tope = Math.min(total, 300); // un GIF disparatado no se come la memoria
      for (let i = 0; i < tope; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        // La duración viene en microsegundos; algunos GIF no la traen.
        t += Math.max(0.02, (image.duration ?? 100000) / 1e6);
        frames.push(await createImageBitmap(image));
        ends.push(t);
        image.close?.();
      }
      dec.close?.();
      this.anims.set(id, { frames, ends, total: t });
      if (!this.playing) this.render();
    } catch {}
  }

  // Fotograma que toca contando desde que el sticker apareció, para que una
  // explosión empiece siempre por su primer fotograma. Luego se repite en bucle.
  private animFrame(a: { frames: ImageBitmap[]; ends: number[]; total: number }, desde: number) {
    const t = a.total > 0 ? Math.max(0, desde) % a.total : 0;
    for (let i = 0; i < a.ends.length; i++) if (t < a.ends[i]) return a.frames[i];
    return a.frames[a.frames.length - 1];
  }

  duration() {
    return this.flat.reduce((a, f) => a + f.dur, 0);
  }

  // ---------------- audio ----------------
  private stopSources() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    for (const fn of this.extras) { try { fn(); } catch {} }
    this.sources = [];
    this.extras = [];
    this.gains.clear();
  }

  // Cadena de efecto para la voz. Devuelve por dónde entra y por dónde sale.
  private voiceChain(effect: VoiceEffect): { input: AudioNode; output: AudioNode } {
    const ctx = this.audioCtx!;
    const input = ctx.createGain();
    let node: AudioNode = input;

    const filtro = (type: BiquadFilterType, freq: number, q?: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q !== undefined) f.Q.value = q;
      return f;
    };
    // Saturación suave. La curva se normaliza para que a tope valga 1: así el
    // efecto ensucia la voz sin dispararle el volumen.
    const distorsion = (cantidad: number, salida = 1) => {
      const ws = ctx.createWaveShaper();
      const n = 1024;
      const grado = Math.PI / 180;
      const norm = (Math.PI + cantidad) / ((3 + cantidad) * 20 * grado);
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = (((3 + cantidad) * x * 20 * grado) / (Math.PI + cantidad * Math.abs(x))) * norm;
      }
      ws.curve = curve;
      ws.oversample = "2x";
      const g = ctx.createGain();
      g.gain.value = salida;
      ws.connect(g);
      return { entrada: ws as AudioNode, salida: g as AudioNode };
    };
    type Tramo = AudioNode | { entrada: AudioNode; salida: AudioNode };
    const encadenar = (...nodos: Tramo[]) => {
      for (const t of nodos) {
        const entrada = "entrada" in t ? t.entrada : t;
        node.connect(entrada);
        node = "salida" in t ? t.salida : t;
      }
    };

    switch (effect) {
      case "deep": // grave: la velocidad ya baja el tono; el filtro le quita brillo
        encadenar(filtro("lowpass", 2600));
        break;
      case "demon": // muy grave y con distorsión
        encadenar(distorsion(16, 0.55), filtro("lowpass", 1700));
        break;
      case "whisper": // sin graves y flojito
        encadenar(filtro("highpass", 1300), filtro("peaking", 4000, 0.8));
        { const g = ctx.createGain(); g.gain.value = 1.5; encadenar(g); }
        break;
      case "robot": { // modulación en anillo
        const ring = ctx.createGain();
        ring.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 42;
        const depth = ctx.createGain();
        depth.gain.value = 1;
        osc.connect(depth);
        depth.connect(ring.gain);
        osc.start();
        this.extras.push(() => { try { osc.stop(); } catch {} });
        encadenar(ring);
        break;
      }
      case "cave": { // eco con realimentación, mezclado con el sonido seco
        const mix = ctx.createGain();
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.15;
        const fb = ctx.createGain();
        fb.gain.value = 0.36;
        const wet = ctx.createGain();
        wet.gain.value = 0.55;
        node.connect(mix);
        node.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(mix);
        node = mix;
        break;
      }
      case "radio": // banda estrecha y saturada
        encadenar(filtro("bandpass", 1700, 1.1), distorsion(6, 0.8));
        break;
      default:
        break;
    }
    return { input, output: node };
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

    const total = this.duration();
    interface Ev {
      key: string; t: number; audioId: string; gain: number; loop: boolean;
      until: number; // cuándo deja de sonar (los bucles se cortan a mano)
      changes?: { at: number; volume: number }[];
      effect?: VoiceEffect; // solo la narración lleva efecto
      rate?: number;
      // Cuánto se estira el audio antes de sonar (1 = tal cual).
      alpha?: number;
      // Es una voz: no puede sonar encima de la voz siguiente.
      narracion?: boolean;
      // Si se corta antes de acabar, se baja el volumen en vez de segarlo.
      desvanecer?: boolean;
    }
    const events: Ev[] = [];

    this.flat.forEach((f, i) => {
      const dStarts = dialogueStarts(f.shot);
      f.shot.dialogues.forEach((d, k) => {
        if (!d.audioId) return;
        // Velocidad y tono van por separado, y para eso hay que combinar dos
        // cosas: estirar el audio (que cambia la duración sin tocar el tono) y
        // reproducirlo más rápido o más lento (que cambia las dos). Estirando
        // por tono/velocidad y reproduciendo a "tono", cada barra acaba
        // mandando solo sobre lo suyo. Ver stretch.ts.
        const efecto = d.effect ?? "none";
        const vel = d.speed || 1;
        const tono = d.pitch || 1;
        const rate = (VOICE_RATE[efecto] ?? 1) * tono;
        events.push({
          key: `dlg:${d.id}`, t: f.start + dStarts[k], audioId: d.audioId,
          gain: this.project!.narrationVolume, loop: false, until: Infinity,
          effect: efecto, rate, alpha: tono / vel, narracion: true,
        });
      });
      const sStarts = sfxStarts(f.shot);
      f.shot.sfx.forEach((s, k) => {
        if (s.loop) {
          // Sigue sonando en las tomas siguientes hasta que alguna lo corte,
          // aplicando por el camino los cambios de volumen que le pongan.
          const span = loopSpan(this.flat, i, s.id, total);
          events.push({
            key: `sfx:${s.id}`, t: f.start + sStarts[k], audioId: s.audioId,
            gain: s.volume, loop: true, until: span.end, changes: span.changes,
          });
        } else {
          events.push({
            key: `sfx:${s.id}`, t: f.start + sStarts[k], audioId: s.audioId,
            gain: s.volume, loop: false, until: Infinity,
          });
        }
      });
      // El sonido de cada sticker va con él: empieza cuando el sticker aparece
      // (más su retraso) y, si va en bucle, se corta cuando el sticker se va.
      const ventanas = overlayWindows(f.shot.overlays, f.dur);
      f.shot.overlays.forEach((o, k) => {
        if (!o.soundId) return;
        const v = ventanas[k];
        events.push({
          key: `ovl:${o.id}`, t: f.start + overlaySoundStart(o, v), audioId: o.soundId,
          gain: o.soundVolume ?? 0.9, loop: !!o.soundLoop,
          until: o.soundLoop ? f.start + v.end : Infinity,
        });
      });
    });

    for (const l of this.project.audioLayers) {
      events.push({ key: `lay:${l.id}`, t: l.startSec, audioId: l.audioId, gain: l.volume, loop: l.loop, until: Infinity });
    }

    // Dos voces a la vez no es una mezcla, es ruido: no se entiende ninguna de
    // las dos. Pasa cuando una toma tiene duración fija más corta que su
    // narración, y entonces la voz sigue sonando cuando ya arrancó la
    // siguiente. Que la toma quepa es cosa del proyecto (hay aviso y botón de
    // arreglarlo en el editor); aquí solo se garantiza que NUNCA se oigan dos
    // encima, ni en un proyecto viejo ni en uno escrito a mano.
    //
    // Se corta con un desvanecido corto en vez de a hachazo: un corte seco a
    // mitad de palabra hace "clac".
    const voces = events.filter((e) => e.narracion).sort((a, b) => a.t - b.t);
    for (let i = 0; i < voces.length - 1; i++) {
      voces[i].until = Math.min(voces[i].until, voces[i + 1].t);
      voces[i].desvanecer = true;
    }

    for (const ev of events) {
      const buf = this.estirar(ev.audioId, ev.alpha ?? 1);
      if (!buf) continue;
      const rate = ev.rate ?? 1;
      // Con efecto de tono el audio suena más lento o más rápido, así que ocupa
      // más o menos tiempo del que dura el archivo.
      const dur = buf.duration / rate;
      const endT = Math.min(ev.until, ev.loop ? Infinity : ev.t + dur);
      if (endT <= fromT) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = ev.loop;
      if (rate !== 1) src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = ev.gain;
      if (ev.effect && ev.effect !== "none") {
        const chain = this.voiceChain(ev.effect);
        src.connect(chain.input);
        chain.output.connect(g);
      } else {
        src.connect(g);
      }
      g.connect(this.dest!);
      g.connect(ctx.destination);
      const when = now + Math.max(0, ev.t - fromT);
      // El desfase se mide sobre el archivo, que va a otra velocidad.
      const offset = Math.max(0, (fromT - ev.t) * rate);
      try {
        src.start(when, ev.loop ? offset % buf.duration : offset);
        // Cambios de volumen al entrar en tomas que lo pidan.
        for (const c of ev.changes ?? []) {
          if (c.at <= fromT) g.gain.value = c.volume;
          else g.gain.setValueAtTime(c.volume, now + (c.at - fromT));
        }
        // Solo hay que desvanecer si de verdad se le corta la cola.
        if (ev.desvanecer && isFinite(endT) && ev.t + dur > endT + 0.01) {
          const fin = now + Math.max(0, endT - fromT);
          const rampa = Math.min(0.12, Math.max(0.02, (endT - Math.max(ev.t, fromT)) / 4));
          g.gain.setValueAtTime(g.gain.value, Math.max(now, fin - rampa));
          g.gain.linearRampToValueAtTime(0.0001, fin);
        }
        if (isFinite(endT)) src.stop(now + Math.max(0, endT - fromT));
        this.sources.push(src);
        this.gains.set(ev.key, g);
      } catch {}
    }
  }

  // Devuelve el audio ya estirado para esa velocidad/tono, guardándolo para no
  // repetir la cuenta. Con factor 1 se usa el original tal cual.
  private estirar(audioId: string, alpha: number): AudioBuffer | undefined {
    const buf = this.buffers.get(audioId);
    if (!buf || Math.abs(alpha - 1) < 0.005) return buf;
    const clave = `${audioId}:${alpha.toFixed(3)}`;
    const ya = this.estirados.get(clave);
    if (ya) return ya;
    this.ensureAudio();
    try {
      const out = stretchBuffer(this.audioCtx!, buf, alpha);
      // No se guardan mil versiones mientras se arrastra una barra.
      if (this.estirados.size > 60) this.estirados.clear();
      this.estirados.set(clave, out);
      return out;
    } catch {
      return buf;
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
        const limit = Math.min(this.duration(), this.rangeEnd);
        if (this.playhead >= limit) {
          if (this.looping) {
            // Vuelta a empezar sin cortar: se reprograma el sonido desde el inicio.
            this.playhead = this.rangeStart;
            this.stopSources();
            this.scheduleAudio(this.playhead);
            this.onTime?.(this.playhead);
            this.render();
            this.raf = requestAnimationFrame(loop);
            return;
          }
          this.playhead = limit;
          this.pause(); // avisa por onPlaying
          this.onTime?.(this.playhead);
          this.onEnded?.();
          this.render();
          this.raf = requestAnimationFrame(loop);
          return;
        }
        this.onTime?.(this.playhead);
        this.render();
      } else if (this.vfxLive && this.project && this.flat.length) {
        // ~30 fps: bastante para ver el efecto al colocar; no satura como a 60.
        const now = performance.now();
        if (!this.lastVfxFrame) this.lastVfxFrame = now;
        if (now - this.lastVfxFrame >= 33) {
          this.vfxExtra += (now - this.lastVfxFrame) / 1000;
          this.lastVfxFrame = now;
          // Antes de MAX_PASOS (15 s): reinicio suave para que no “desaparezcan”
          // ni salten al ponerse al día de golpe.
          if (this.vfxExtra > 12) {
            this.vfxScenes.clear();
            this.vfxExtra = 0.8;
          }
          this.render();
        }
      }
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
    for (const a of this.anims.values()) for (const f of a.frames) f.close?.();
    this.anims.clear();
    this.audioCtx?.close().catch(() => {});
  }

  // Acota la reproducción a un tramo (una escena o una toma). Sin argumentos,
  // vuelve al video completo.
  setRange(start: number, end: number, loop = false) {
    this.rangeStart = Math.max(0, start);
    this.rangeEnd = Math.max(this.rangeStart + 0.05, end);
    this.looping = loop;
  }
  clearRange() {
    this.rangeStart = 0;
    this.rangeEnd = Infinity;
    this.looping = false;
  }
  setLooping(v: boolean) {
    this.looping = v;
  }

  async play() {
    // `starting` es síncrono: sin él, dos llamadas seguidas (por ejemplo un seek
    // y un play) programaban el audio dos veces y la voz se oía duplicada.
    if (!this.project || this.playing || this.starting) return;
    this.starting = true;
    try {
      this.ensureAudio();
      await this.audioCtx?.resume().catch(() => {});
      const limit = Math.min(this.duration(), this.rangeEnd);
      // Fuera del tramo (o al final) se vuelve al principio de lo que toque sonar.
      if (this.playhead >= limit - 0.05 || this.playhead < this.rangeStart) {
        this.playhead = this.rangeStart;
      }
      this.stopSources(); // por si algo quedó sonando
      this.scheduleAudio(this.playhead);
      this.vfxExtra = 0;
      this.playing = true;
      this.onPlaying?.(true);
      this.start();
    } finally {
      this.starting = false;
    }
  }
  pause() {
    const era = this.playing;
    this.playing = false;
    this.stopSources();
    if (era) this.onPlaying?.(false);
    // Al pausar, el reloj de vista previa de VFX arranca limpio en este instante.
    this.lastVfxFrame = performance.now();
  }
  /** En pausa, animar efectos sin audio (para colocar sitios en vivo). */
  setVfxLive(v: boolean) {
    this.vfxLive = v;
    if (!v) this.vfxExtra = 0;
    else this.lastVfxFrame = performance.now();
    if (!this.playing) this.render();
  }
  /** Reinicia las partículas (p. ej. al soltar un sitio arrastrado). */
  resetVfx() {
    this.vfxScenes.clear();
    this.vfxExtra = 0;
    this.lastVfxFrame = performance.now();
    if (!this.playing) this.render();
  }
  // Mover el punto de reproducción siempre para el sonido: así el botón nunca
  // dice "pausa" mientras se sigue oyendo.
  seek(t: number) {
    this.pause();
    this.vfxExtra = 0;
    const lo = this.rangeStart;
    const hi = Math.min(this.duration(), this.rangeEnd);
    this.playhead = Math.max(lo, Math.min(hi, t));
    this.onTime?.(this.playhead);
    this.render();
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
    ctx.fillRect(0, 0, this.w, this.h);
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
      else this.drawShot(cur, lt, 1, (1 - a) * this.w);
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
    const frames = f.frames;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (offsetX) ctx.translate(offsetX, 0);
    if (img && img.complete && img.naturalWidth) {
      const fr = lerpFrame(frames.from, frames.to, p);
      const { sx, sy, sw, sh } = framePx(fr, iw, ih);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.w, this.h);
    }
    ctx.restore();

    // Stickers: heredan la transición de entrada de la toma o llevan la suya,
    // y se mueven según su propio modo (quieto, pegado a la imagen o libre).
    const ventanas = overlayWindows(f.shot.overlays, f.dur);
    f.shot.overlays.forEach((o, idx) => {
      const oi = this.images.get(o.imageId);
      if (!oi || !oi.complete || !oi.naturalWidth) return;
      // Fuera de su rato, el sticker no existe.
      const v = ventanas[idx];
      if (lt < v.start || lt > v.end) return;
      const desde = lt - v.start; // tiempo desde que apareció ESTE sticker

      let oa = alpha;
      let ox = offsetX;
      if (o.transition !== "inherit") {
        const td = Math.max(0.01, f.shot.transitionDur);
        const a = Math.max(0, Math.min(1, desde / td));
        oa = o.transition === "fade" ? a : 1;
        ox = o.transition === "slide" ? (1 - a) * this.w : 0;
      }
      // Los que salen solo un rato se van con un fundido corto, para que no
      // desaparezcan de golpe.
      if (o.timing !== "all") {
        const cola = Math.min(0.25, (v.end - v.start) / 4);
        if (cola > 0 && v.end - lt < cola) oa *= (v.end - lt) / cola;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, oa));
      if (ox) ctx.translate(ox, 0);
      this.drawOverlay(o, oi, p, frames, iw, ih, desde);
      ctx.restore();
    });

    this.drawVfx(f, lt, alpha);
  }

  // Partículas. Anclas de la foto escalan con el zoom; lluvia/atmósfera no.
  private drawVfx(f: FlatShot, lt: number, alpha: number) {
    const capas = capasVfxActivas(f.scene, f.shot);
    if (!capas.length) return;

    const p = moveProgress(f.shot, lt);
    const fr = f.frames;
    const fa = lerpFrame(fr.from, fr.to, p);
    // w=1 → imagen entera; w=0.5 → ×2. Atmósfera se queda en 1.
    const zoomAnclas = fa.w > 0.01 ? 1 / fa.w : 1;

    const anclas = capas.filter(esVfxDeEscena);
    const cuadro = capas.filter((v) => !esVfxDeEscena(v));
    this.pintarGrupoVfx(f, lt, alpha, anclas, zoomAnclas, ":a");
    this.pintarGrupoVfx(f, lt, alpha, cuadro, 1, ":c");
  }

  private pintarGrupoVfx(
    f: FlatShot,
    lt: number,
    alpha: number,
    capas: VfxLayer[],
    zoomScale: number,
    sufijo: string,
  ) {
    if (!capas.length) return;
    const p = moveProgress(f.shot, lt);
    const fr = f.frames;
    // MISMO tamaño que drawShot al recortar la foto. Si se usa scene.imgW/H y
    // la imagen natural tiene otra proporción, el fuego “salta” fuera del
    // encuadre en cuanto carga el PNG (parece que la imagen se lo come).
    const img = this.images.get(f.scene.imageId);
    const iw = img?.naturalWidth || f.scene.imgW || 16;
    const ih = img?.naturalHeight || f.scene.imgH || 9;
    const seguir = (n: { x: number; y: number; x2: number; y2: number }, imagen: boolean) => {
      const f0 = fr.from;
      const fa = lerpFrame(fr.from, fr.to, p);
      const h0 = frameH(f0.w, iw, ih);
      const hp = frameH(fa.w, iw, ih);
      const mapa = (x: number, y: number) => {
        const ix = imagen ? x : f0.cx - f0.w / 2 + x * f0.w;
        const iy = imagen ? y : f0.cy - h0 / 2 + y * h0;
        return {
          x: (ix - (fa.cx - fa.w / 2)) / (fa.w || 1),
          y: (iy - (fa.cy - hp / 2)) / (hp || 1),
        };
      };
      const a = mapa(n.x, n.y), b = mapa(n.x2, n.y2);
      return { x: a.x, y: a.y, x2: b.x, y2: b.y };
    };
    const preview = !this.playing;
    const entradas: VfxInput[] = capas.map((v) => {
      const w = vfxWindow(v, f.dur);
      const nodes = v.nodes ?? [];
      return {
        id: v.id, kind: v.kind, shape: v.shape,
        nodes: (v.follow || v.espacio === "imagen")
          ? nodes.map((n) => seguir(n, v.espacio === "imagen"))
          : nodes,
        colorHex: v.colorHex, params: v.params,
        // En pausa la simulación sigue adelante del final de la toma: si se
        // respeta w.end, a los pocos segundos se dan de baja TODOS los efectos.
        start: preview ? 0 : w.start,
        end: preview ? 1e9 : w.end,
      };
    });
    const escena = this.escenaVfx(f.shot.id + sufijo);
    escena.setSize(this.w, this.h);
    // El zoom ya no va en la clave: si iba, cada ~10 % borraba partículas y el
    // humo brincaba. setZoomScale reescala lo vivo para que siga la cámara.
    escena.setZoomScale(zoomScale);
    let clave = f.shot.id + sufijo;
    for (const v of capas) {
      clave += `|${v.id},${v.kind},${v.shape},${v.nodes.length},${v.timing},${v.startSec},${v.endSec}`;
    }
    // En pausa el reloj extra no debe “salirse” del final de la toma (si no,
    // montar da de baja todo). Y se recicla antes de MAX_PASOS para no hacer
    // un salto brusco a los 15 s.
    const tSim = preview ? lt + this.vfxExtra : lt;
    escena.seek(clave, entradas, tSim);
    escena.draw(this.ctx, alpha);
  }

  private drawOverlay(
    o: PngOverlay,
    img: HTMLImageElement,
    p: number,
    frames: { from: Frame; to: Frame },
    iw: number,
    ih: number,
    desde: number, // segundos desde que este sticker apareció
  ) {
    const b = overlayBox(o, p, frames, iw, ih);
    const x = b.x * this.w, y = b.y * this.h, w = b.w * this.w, h = b.h * this.h;
    if (w <= 0 || h <= 0) return;
    // Si es un GIF animado se dibuja el fotograma que toca; si no, la imagen.
    const anim = this.anims.get(o.imageId);
    const src: CanvasImageSource = anim ? this.animFrame(anim, desde) : img;
    const sw = anim ? (src as ImageBitmap).width : img.naturalWidth;
    const sh = anim ? (src as ImageBitmap).height : img.naturalHeight;
    if (!sw || !sh) return;
    const sc = Math.min(w / sw, h / sh);
    const dw = sw * sc, dh = sh * sc;
    this.ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // ---------------- export ----------------

  // Pinta un fotograma de un video sobre el lienzo, entero y centrado (con
  // franjas negras si no es 16:9), para que no se deforme.
  private drawVideoFrame(v: HTMLVideoElement) {
    const c = this.ctx;
    c.fillStyle = "#000";
    c.fillRect(0, 0, this.w, this.h);
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    const sc = Math.min(this.w / vw, this.h / vh);
    const dw = vw * sc, dh = vh * sc;
    c.drawImage(v, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
  }

  // Reproduce de principio a fin un video que se une a la historia, pintándolo
  // en el lienzo y metiendo su sonido en la mezcla: así entra en la grabación
  // como una parte más y sale un único archivo.
  private async loadClip(clip: ClipVideo): Promise<HTMLVideoElement | null> {
    const url = await assetUrl(clip.assetId);
    if (!url) return null;
    const v = document.createElement("video");
    v.src = url;
    v.playsInline = true;
    v.preload = "auto";
    let ok = true;
    await new Promise<void>((res) => {
      const listo = () => res();
      v.onloadeddata = listo;
      v.onerror = () => { ok = false; res(); };
      setTimeout(listo, 15000);
    });
    return ok ? v : null;
  }

  private async playClip(v: HTMLVideoElement, onTime?: (t: number) => void): Promise<void> {
    let fuente: MediaElementAudioSourceNode | null = null;
    try {
      fuente = this.audioCtx!.createMediaElementSource(v);
      fuente.connect(this.dest!);
      fuente.connect(this.audioCtx!.destination);
    } catch {}
    try {
      await v.play();
    } catch {
      // Sin permiso para reproducir no se puede grabar el clip; se deja pasar.
      fuente?.disconnect();
      return;
    }
    await new Promise<void>((res) => {
      let fin = false;
      const acabar = () => { if (!fin) { fin = true; clearInterval(vigía); res(); } };
      v.onended = acabar;
      // Red de seguridad por atasco, no por duración: hay videos que no dicen
      // cuánto duran, así que se corta solo si el tiempo deja de avanzar.
      let visto = -1;
      const vigía = setInterval(() => {
        if (v.currentTime === visto && !v.paused) acabar();
        visto = v.currentTime;
      }, 5000);
      const pintar = () => {
        if (fin) return;
        this.drawVideoFrame(v);
        onTime?.(v.currentTime);
        if (v.ended) { acabar(); return; }
        requestAnimationFrame(pintar);
      };
      pintar();
    });
    try { v.pause(); } catch {}
    fuente?.disconnect();
    v.removeAttribute("src");
    v.load();
  }

  // Reproduce la historia entera una vez (lo que ya se grababa antes).
  private playStory(onTime?: (t: number) => void): Promise<void> {
    const dur = this.duration();
    return new Promise<void>((resolve, reject) => {
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
        resolve();
      };
      const watchdog = setTimeout(finish, Math.ceil(dur * 1000) + 5000);
      try {
        this.playhead = 0;
        this.scheduleAudio(0);
        this.playing = true;
        this.onPlaying?.(true);
        this.start();
        this.onEnded = () => setTimeout(finish, 200);
        this.onTime = (t) => { prevTime?.(t); onTime?.(t); };
      } catch (e) {
        clearTimeout(watchdog);
        this.onEnded = prevEnded;
        this.onTime = prevTime;
        reject(e);
      }
    });
  }

  async export(mimeType: string, onProgress?: (p: number) => void): Promise<Blob> {
    if (!this.project) throw new Error("Sin proyecto");
    this.pause();
    this.clearRange(); // se exporta siempre el video entero
    this.ensureAudio();
    await this.audioCtx?.resume().catch(() => {});

    const { intro, outro } = this.project;
    const dur = this.duration();
    // Se cargan antes de empezar a grabar: si no, el principio del archivo se
    // llevaría los segundos de espera con la imagen congelada.
    const vIntro = intro ? await this.loadClip(intro) : null;
    const vOutro = outro ? await this.loadClip(outro) : null;
    const total = (vIntro ? intro!.dur : 0) + dur + (vOutro ? outro!.dur : 0);
    if (vIntro) this.drawVideoFrame(vIntro); else this.render();
    const stream = (this.canvas as any).captureStream(30) as MediaStream;
    if (this.dest) for (const t of this.dest.stream.getAudioTracks()) stream.addTrack(t);
    const mime = mimeType || Recorder.pickMime();
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 10_000_000 });
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const cerrado = new Promise<Blob>((res) => {
      mr.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" }));
    });

    // Se graba de un tirón: careta + historia + cierre, en ese orden.
    let hecho = 0;
    const avisar = (t: number) => onProgress?.(total ? Math.min(1, (hecho + t) / total) : 0);
    mr.start(1000);
    try {
      if (vIntro) { await this.playClip(vIntro, avisar); hecho += intro!.dur; avisar(0); }
      if (dur > 0) { await this.playStory(avisar); hecho += dur; avisar(0); }
      if (vOutro) { await this.playClip(vOutro, avisar); hecho += outro!.dur; }
    } finally {
      this.pause();
      if (mr.state !== "inactive") mr.stop();
    }
    return cerrado;
  }
}
