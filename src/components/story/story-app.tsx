"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Play, Pause, Download, Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Mic, Music, Volume2, Save, FolderOpen, Film, Layers, Loader2, X, MoveVertical, FileJson, Repeat,
  Settings2, AlertTriangle, Sparkles, Check, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import { ModelosIa } from "./modelos-ia";
import { BibliotecaMusica } from "./biblioteca-musica";
import { refPista, esDeBiblioteca, esDeBibliotecaSonido, type Pista } from "@/lib/story/musica";
import { VOCES_INFO } from "@/lib/story/modelos";
import { MissingAssets } from "./missing-assets";
import { StoryHome, StoryBreadcrumb } from "./story-home";
import { faltantes, referencias, type Falta } from "@/lib/story/missing";
import { crearReferenciaVfx } from "@/lib/story/vfx-image-reference";
import { crearZip, leerZip, nombreArchivo, idDeNombre } from "@/lib/story/zip";
import { getAsset } from "@/lib/story/store";
import { StoryEngine } from "@/lib/story/engine";
import { synthesize, audioDuration, VOICES, type VoiceStatus } from "@/lib/story/tts";
import { putAsset, assetUrl, cachedUrl, deleteAsset } from "@/lib/story/store";
import { ShotEditor } from "./shot-editor";
import { VfxEditor } from "./vfx-editor";
import { VfxCanvas, VfxTools } from "./vfx-canvas";
import { Slider } from "./slider";
import { LockToggle } from "./lock-toggle";
import { NumberInput } from "./number-input";
import { loadLocks, saveLocks, type Locks } from "@/lib/story/locks";
import {
  emptyProject, newScene, newShot, newOverlay, newSfx, moveScene, reorderScene, moveShot, migrateProject,
  flatten, shotDur, totalDuration, sceneRange, inheritedLoops, projectAssets, duplicateShot,
  ASPECTS, aspectInfo, setProjectAspect, switchAspect, overlayWindow, vozDe, quienesHablan, NARRADOR, type Aspect,
  type StoryProject, type StoryScene, type Shot, type Dialogue, type AudioLayer, type PngOverlay, type Frame,
  type VfxNode, type VfxLayer,
} from "@/lib/story/model";
import { Recorder } from "@/lib/studio/recorder";
import { convert, remux } from "@/lib/editor/ffmpeg";
import { exportDialogues, applyDialogues } from "@/lib/story/dialogues";

interface ProjMeta { id: string; name: string; updatedAt: string; seriesId?: string | null }

export type CupoHistorias = {
  exento: boolean;
  usadas: number;
  limite: number;
  quedan: number;
  retryAt: string | null;
};

// Cuánto se espera desde el último cambio para guardar solo. Bastante corto
// para no perder trabajo, y bastante largo para no guardar en cada tecla.
const AUTOGUARDADO = 8000;

// La vista (inicio / serie / capítulo) vive en la URL para que un reload no
// te mande siempre al principio. replaceState: sin recargar la app.
function storyPath(opts: { id?: string | null; serie?: string | null } = {}) {
  const q = new URLSearchParams();
  if (opts.id) q.set("id", opts.id);
  else if (opts.serie) q.set("serie", opts.serie);
  const s = q.toString();
  return s ? `/story?${s}` : "/story";
}
function syncStoryUrl(opts: { id?: string | null; serie?: string | null } = {}) {
  if (typeof window === "undefined") return;
  const next = storyPath(opts);
  const cur = window.location.pathname + window.location.search;
  if (cur !== next) window.history.replaceState(window.history.state, "", next);
}

// Rectángulo con la forma real del video, para reconocerlo de un vistazo.
function FormaVideo({ ratio }: { ratio: number }) {
  return (
    <span
      className="block shrink-0 rounded-[3px] border-2 border-current"
      style={{ width: ratio >= 1 ? 24 : 24 * ratio, height: ratio >= 1 ? 24 / ratio : 24 }}
    />
  );
}

// Alto y ancho reales de una imagen recién elegida. Hace falta al reponerla:
// los encuadres van en tanto por uno y es la proporción la que manda.
// Vale igual para un archivo elegido a mano que para una imagen recién dibujada:
// lo único que hace falta es poder abrirla.
function medirImagen(file: Blob): Promise<{ w: number; h: number } | null> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { res(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

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

export function StoryApp({
  initialProjects,
  initialCupo,
  initialOpenId = null,
  initialSerie = null,
}: {
  initialProjects: ProjMeta[];
  initialCupo: CupoHistorias;
  /** Capítulo a abrir al montar (viene de ?id= en la URL). */
  initialOpenId?: string | null;
  /** Carpeta de serie a mostrar en el inicio (?serie=). */
  initialSerie?: string | null;
}) {
  const [project, setProject] = useState<StoryProject>(emptyProject());
  const [projects, setProjects] = useState<ProjMeta[]>(initialProjects);
  const [cupo, setCupo] = useState<CupoHistorias>(initialCupo);
  const [projectId, setProjectId] = useState<string | null>(initialOpenId);
  // Series: agrupan capítulos y personajes. Todo opcional — un video suelto no
  // necesita ninguna, y lo que ya existe se queda "sin serie".
  const [series, setSeries] = useState<{ id: string; name: string; capitulos: number; personajes: number }[]>([]);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  // Si hay clave y modelo de voz puestos, la narración la hace OpenAI.
  const [vozOpenAi, setVozOpenAi] = useState(false);
  // Motivo por el que la IA del servidor está cerrada hoy. Se enseña una vez;
  // el editor sigue entero y la voz del navegador sigue funcionando.
  const [sinCupoIa, setSinCupoIa] = useState<string | null>(null);

  // ¿La respuesta es un "se te acabó la IA de hoy"? Si lo es, se apunta el
  // motivo para enseñarlo una vez y se corta lo que estuviera en marcha: seguir
  // intentándolo son llamadas que ya se sabe que van a fallar.
  function esSinCupo(r: Response, j: any): boolean {
    if (r.status !== 429 || !j?.sinCupo) return false;
    setSinCupoIa(j.error || "Se acabaron tus historias con IA de hoy.");
    return true;
  }
  // Cuando la narración falla POR EL MODELO, se guarda el motivo para poder
  // ofrecer cambiarlo sin salir del editor.
  const [vozRota, setVozRota] = useState<string | null>(null);
  const [verModelosVoz, setVerModelosVoz] = useState(false);
  // Con clave y modelo de imagen se pueden dibujar las escenas que falten.
  const [iaImagen, setIaImagen] = useState(false);
  // Con clave puesta se puede pedir otra versión de una frase.
  const [iaTexto, setIaTexto] = useState(false);
  // Solo admin ve/elige modelos de IA.
  const [esAdminIa, setEsAdminIa] = useState(false);
  // La escena que se está describiendo para dibujarla.
  // ancla: dónde mostrar el formulario (lista de faltantes o id de escena).
  const [dibujo, setDibujo] = useState<{
    falta: Falta; texto: string; ancla: "faltas" | string;
  } | null>(null);
  // Por dónde va el montaje automático, para poder enseñarlo.
  const [montaje, setMontaje] = useState<
    { fase: "dibujando" | "narrando" | "listo" | "parado"; hechas: number; total: number; detalle: string } | null
  >(null);
  const [montarAlEntrar, setMontarAlEntrar] = useState(false);
  // Tras montar un borrador de IA, bajar el ZIP con imágenes y audios.
  const zipTrasMontajeRef = useRef(false);
  // Qué pieza se está rehaciendo ahora mismo.
  const [rehaciendo, setRehaciendo] = useState<string | null>(null);
  const [verBiblioteca, setVerBiblioteca] = useState(false);
  // Primero se elige dónde trabajar (serie → capítulo) y solo después se abre el
  // editor. La URL (?id= / ?serie=) recuerda el sitio para que un reload no
  // te tire al inicio.
  const [vista, setVista] = useState<"inicio" | "editor">(initialOpenId ? "editor" : "inicio");
  const abrioInicialRef = useRef(false);

  // La clave/modelos se guardan en otro panel; si solo se leían al montar,
  // el editor se quedaba sin «Dibujar» aunque la DB ya tuviera gpt-image-2.
  function aplicarCapacidadesIa(j: { configurada?: boolean; admin?: boolean; models?: { imagen?: string; voz?: string; texto?: string } } | null) {
    setEsAdminIa(!!j?.admin);
    const ok = !!j?.configurada;
    setVozOpenAi(ok);
    setIaImagen(ok);
    setIaTexto(ok);
  }
  async function refrescarCapacidadesIa() {
    try {
      const j = await fetch("/api/story/ia/clave").then((r) => r.json());
      aplicarCapacidadesIa(j);
      return j as { configurada?: boolean; models?: { imagen?: string; voz?: string } };
    } catch {
      return null;
    }
  }
  useEffect(() => { void refrescarCapacidadesIa(); }, []);
  useEffect(() => {
    if (vista === "editor") void refrescarCapacidadesIa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);
  const [name, setName] = useState("Mi historia");
  const [voice, setVoice] = useState("es");

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [openScene, setOpenScene] = useState<string | null>(null);
  const [selShot, setSelShot] = useState<string | null>(null);
  const [selOverlay, setSelOverlay] = useState<string | null>(null);
  const [selVfx, setSelVfx] = useState<string | null>(null);
  // Colocar sitios se enciende y se apaga: apagado, la previsualización se ve
  // limpia y se puede tocar por debajo; encendido, el dedo va a los puntos.
  const [colocando, setColocando] = useState(true);
  const [borrandoVfx, setBorrandoVfx] = useState(false);
  const [dragScene, setDragScene] = useState<string | null>(null);
  // Qué escena se ha agarrado POR EL ASA. La tarjeta entera no puede ser
  // arrastrable: tocando cualquier hueco (o mientras se mueve una barra) se
  // acababa arrastrando la escena sin querer.
  const [agarre, setAgarre] = useState<string | null>(null);
  // Tramo que se está viendo suelto (una escena o una toma) + su miniatura flotante.
  const [section, setSection] = useState<{ start: number; end: number; label: string; shotId?: string; sceneId?: string } | null>(null);
  // Escena cuya posición se está cambiando escribiendo el número.
  const [movingScene, setMovingScene] = useState<{ id: string; value: string } | null>(null);
  // Al crear un proyecto se elige primero la forma del video.
  const [creando, setCreando] = useState(false);
  // El tramo que se está viendo se repite sin parar (vista previa).
  const [loopSection, setLoopSection] = useState(false);

  // Escenas y tomas bloqueadas para no cambiarlas por accidente. Viven en el
  // navegador, así que se recuerdan aunque no se guarde el proyecto.
  const [locks, setLocks] = useState<Locks>({});
  useEffect(() => { setLocks(loadLocks()); }, []);
  function setLock(id: string, v: boolean) {
    setLocks((prev) => {
      const next = { ...prev, [id]: v };
      if (!v) delete next[id];
      saveLocks(next);
      return next;
    });
  }

  // Encargos de voz en marcha, por id de diálogo (la generación no bloquea la página).
  const [voiceJobs, setVoiceJobs] = useState<Record<string, VoiceStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4" | "gif" | "mp3">("webm");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dirty, setDirty] = useState(false);

  // Archivos que el proyecto usa pero que no están en este navegador.
  const [faltas, setFaltas] = useState<Falta[]>([]);
  const [reponiendo, setReponiendo] = useState<string | null>(null);

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
    // El botón refleja el estado real del motor, nunca una suposición.
    eng.onPlaying = (v) => setPlaying(v);
    if (previewRef.current) {
      eng.canvas.className = "h-full w-full object-contain";
      previewRef.current.appendChild(eng.canvas);
    }
    eng.start();
    return () => eng.destroy();
  }, []);

  useEffect(() => { engineRef.current?.update(project); }, [project]);

  // El lienzo se cuelga del editor en cuanto el editor existe. Al arrancar en la
  // pantalla de inicio ese hueco todavía no está, y si solo se hiciera al montar
  // el motor, al entrar a un capítulo no habría video.
  useEffect(() => {
    const eng = engineRef.current;
    // Si se edita una toma suelta, el canvas está en la ventana flotante.
    // No recolocarlo aquí o se queda negra al dibujar/mover efectos.
    if (!eng || vista !== "editor" || section) return;
    const host = previewRef.current;
    if (host && eng.canvas.parentElement !== host) {
      eng.canvas.className = "h-full w-full object-contain";
      host.appendChild(eng.canvas);
      eng.update(projRef.current);
    }
  }, [vista, project, section]);

  const cargarSeries = () =>
    fetch("/api/story/series").then((r) => r.json()).then((j) => setSeries(j.series ?? [])).catch(() => {});
  useEffect(() => { void cargarSeries(); }, []);

  // Reload con ?id=: reabrir el mismo capítulo en el editor.
  useEffect(() => {
    if (!initialOpenId || abrioInicialRef.current) return;
    abrioInicialRef.current = true;
    void load(initialOpenId, { silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId]);

  // Qué archivos le faltan a este proyecto en este navegador. Se recalcula solo
  // cuando cambia la LISTA de archivos usados, no en cada retoque, que si no
  // sería una consulta al almacén por cada movimiento de una barra.
  const idsUsados = projectAssets(project).join("|");
  useEffect(() => {
    let vivo = true;
    faltantes(projRef.current).then((f) => { if (vivo) setFaltas(f); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsUsados]);

  // El lienzo es uno solo: se muda a la miniatura flotante mientras se ve un
  // tramo suelto, y vuelve a su sitio al cerrarla.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const host = section ? floatRef.current : previewRef.current;
    if (host && eng.canvas.parentElement !== host) host.appendChild(eng.canvas);
  }, [section]);

  // ---------- guardado automático ----------
  // Se guarda solo unos segundos después del último cambio. Antes había que
  // acordarse de darle a Guardar, y una recarga sin querer se llevaba el
  // trabajo por delante.
  //
  // Con condiciones, para no molestar: solo si hay algo que guardar, solo si el
  // proyecto tiene escenas (si no, se llenaría la lista de proyectos vacíos), y
  // nunca mientras se está exportando o guardando a mano.
  const guardarRef = useRef<() => Promise<void>>();
  useEffect(() => {
    if (!dirty || exporting || busy || !project.scenes.length) return;
    const t = setTimeout(() => { void guardarRef.current?.(); }, AUTOGUARDADO);
    return () => clearTimeout(t);
  }, [dirty, exporting, busy, project]);

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

  // El formato manda sobre todos los encuadres; se pone al día en cada render
  // para que el editor y el motor dibujen siempre con la misma forma.
  const forma = aspectInfo(project.aspect);
  setProjectAspect(project.aspect);

  const pendientes = Object.keys(voiceJobs).length;
  // Diálogos cuyo texto cambió después de generar la voz.
  const marcados = project.scenes.reduce(
    (a, sc) => a + sc.shots.reduce((b, sh) => b + sh.dialogues.filter((d) => d.stale && d.text.trim()).length, 0), 0);
  const dur = totalDuration(project);
  // Lo que durará el archivo final, contando los videos que se le unen.
  const durFinal = dur + (project.intro?.dur ?? 0) + (project.outro?.dur ?? 0);
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
  function updSceneVfx(sceneId: string, vfx: VfxLayer[]) {
    mut((p) => ({
      ...p,
      scenes: p.scenes.map((sc) => (sc.id === sceneId ? { ...sc, vfx } : sc)),
    }));
  }

  // ---------- reproducción ----------
  async function togglePlay() {
    const eng = engineRef.current!;
    if (playing) eng.pause();
    else await eng.play();
  }
  function seek(t: number) {
    engineRef.current?.seek(t);
  }
  function focusShot(shotId: string) {
    setSelShot(shotId);
    setSelOverlay(null);
    const eng = engineRef.current;
    if (!eng) return;
    // Si hay un tramo abierto (se está viendo una escena o una toma sueltas), el
    // reproductor se muda a ESTA toma: parado y justo en su primer fotograma.
    // Así al dar al play empieza por aquí, que es lo que se espera al abrir una
    // toma para trabajarla; antes se quedaba en el tramo anterior.
    if (section) {
      const f = flat.find((x) => x.shot.id === shotId);
      const sc = project.scenes.find((x) => x.shots.some((h) => h.id === shotId));
      if (f && sc) {
        const si = project.scenes.indexOf(sc);
        const hi = sc.shots.findIndex((h) => h.id === shotId);
        const fin = f.start + f.dur;
        eng.pause();
        setSection({ start: f.start, end: fin, label: `Escena ${si + 1} · toma ${hi + 1}`, shotId, sceneId: sc.id });
        eng.setRange(f.start, fin, loopSection);
        eng.seek(f.start);
        return;
      }
    }
    eng.seekToShot(shotId);
  }

  // Ver solo un tramo (una escena o una toma) en la miniatura flotante, sin
  // tener que subir hasta el reproductor de arriba.
  async function playSection(
    start: number, end: number, label: string,
    ids: { shotId?: string; sceneId?: string },
    repetir = false,
  ) {
    const eng = engineRef.current!;
    if (!repetir && section && section.start === start && section.end === end && playing) {
      eng.pause();
      return;
    }
    // Cambiar de tramo con otro sonando: se corta el anterior antes de arrancar,
    // si no se solapaban las dos mezclas y la voz salía deformada.
    eng.pause();
    setSection({ start, end, label, ...ids });
    setLoopSection(repetir);
    eng.setRange(start, end, repetir);
    eng.seek(start);
    await eng.play();
  }

  // Vista previa: la toma se repite sin parar mientras se ajustan los stickers,
  // así se ve el efecto al momento en vez de tener que dar al play cada vez.
  function previewShot(shotId: string) {
    const f = flat.find((x) => x.shot.id === shotId);
    if (!f) return;
    setSelShot(shotId);
    const sc = project.scenes.find((x) => x.shots.some((h) => h.id === shotId));
    const si = sc ? project.scenes.indexOf(sc) : 0;
    const hi = sc ? sc.shots.findIndex((h) => h.id === shotId) : 0;
    void playSection(f.start, f.start + f.dur, `Escena ${si + 1} · toma ${hi + 1}`, { shotId }, true);
  }
  // Dónde acabó la toma de antes: es el punto de partida de las que "siguen a
  // la anterior". La primera de todas no tiene ninguna.
  function frameAnterior(shotId: string): Frame | null {
    const i = flat.findIndex((x) => x.shot.id === shotId);
    return i > 0 ? flat[i - 1].frames.to : null;
  }

  // Coloca el reproductor donde ese sticker se ve, para poder situarlo aunque
  // solo salga un rato de la toma.
  function irAlSticker(sh: Shot, overlayId: string) {
    const f = flat.find((x) => x.shot.id === sh.id);
    const o = sh.overlays.find((x) => x.id === overlayId);
    if (!f) return;
    if (!o || o.timing !== "range") { engineRef.current?.seekToShot(sh.id); return; }
    const v = overlayWindow(o, sh.overlays, f.dur);
    engineRef.current?.seek(f.start + (v.start + v.end) / 2);
  }
  function toggleLoop() {
    const v = !loopSection;
    setLoopSection(v);
    engineRef.current?.setLooping(v);
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
    setSection(null);
    setLoopSection(false);
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
    if (locks[sc.id]) return;
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
    if (locks[sc.id] || locks[shotId]) return;
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
  // Devuelve si salió bien, para que el lote pueda pararse al primer fallo en
  // vez de repetir el mismo error una vez por diálogo.
  function genVoice(sceneId: string, shotId: string, d: Dialogue): Promise<boolean> {
    if (!d.text.trim()) { setStatus("Escribe el texto del diálogo primero."); return Promise.resolve(false); }
    if (voiceJobs[d.id]) return Promise.resolve(true);
    setStatus(null);
    setVoiceJobs((j) => ({ ...j, [d.id]: { stage: "queued", pct: 0 } }));
    // Con OpenAI configurado, la voz la pone él; si no, el modelo del navegador,
    // que suena robótico pero es gratis y no necesita conexión.
    const hacerVoz = vozOpenAi
      ? fetch("/api/story/ia/voz", {
          method: "POST", headers: { "Content-Type": "application/json" },
          // Cada quien con su voz: el narrador y cada personaje pueden sonar
          // distinto. Sin esto, un diálogo entre dos personas no se distingue
          // de la narración.
          body: JSON.stringify({ texto: d.text, voz: vozDe(projRef.current, d, "") || undefined }),
        }).then(async (r) => {
          const j = await r.json();
          // Sin cupo NO es un error: es que se acabaron las historias con IA de
          // hoy. La voz del navegador es gratis y no toca el servidor, así que
          // se sigue por ahí en vez de dejar al usuario sin narración.
          if (r.status === 429 && j?.sinCupo) {
            setSinCupoIa(j.error || "Se acabaron tus historias con IA de hoy.");
            setStatus("Sin IA por hoy · narrando con la voz del navegador");
            return synthesize(d.text, voice, (st) =>
              setVoiceJobs((jo) => (jo[d.id] ? { ...jo, [d.id]: st } : jo)));
          }
          if (!r.ok) {
            const e: any = new Error(j.error || "Error");
            // Si el problema es el modelo elegido, se marca para poder ofrecer
            // cambiarlo sin salir del editor.
            e.modeloMal = !!j.modeloMal;
            throw e;
          }
          const bin = atob(j.audio);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type: "audio/wav" });
        })
      : synthesize(d.text, voice, (s) => setVoiceJobs((j) => (j[d.id] ? { ...j, [d.id]: s } : j)));
    return hacerVoz
      .then(async (blob) => {
        const audioId = nanoid(10);
        await putAsset(audioId, blob);
        const secs = await audioDuration(blob);
        patchDialogue(sceneId, shotId, d.id, { audioId, dur: secs, stale: false });
        // Al regenerar, la voz anterior ya no la usa nadie: se quita para no ir
        // llenando el navegador de audios sueltos.
        if (d.audioId && d.audioId !== audioId) await deleteAsset(d.audioId).catch(() => {});
        setStatus("Voz generada ✓");
        return true;
      })
      .catch((err: any) => {
        setStatus("Error generando voz: " + (err?.message ?? ""));
        // Si el modelo es el que falla, se abre el selector aquí mismo: salir
        // del editor a cambiarlo dejaba al usuario encerrado.
        if (err?.modeloMal) setVozRota(err?.message ?? "Ese modelo no sirve para narrar.");
        return false;
      })
      .finally(() => {
        setVoiceJobs((j) => {
          const { [d.id]: _drop, ...rest } = j;
          return rest;
        });
      });
  }

  // Narrar en fila y PARAR al primer fallo.
  //
  // Antes se lanzaban todas de golpe: si el modelo no servía, se repetía el
  // mismo error una vez por diálogo. Cada una de esas es una llamada a OpenAI.
  async function narrarTodas(pendientes: [string, string, Dialogue][], queEran: string) {
    if (!pendientes.length) { setStatus(`No hay ${queEran} que narrar.`); return; }
    let hechas = 0;
    for (const [sceneId, shotId, d] of pendientes) {
      const bien = await genVoice(sceneId, shotId, d);
      if (!bien) {
        setStatus(
          `Se paró en ${hechas} de ${pendientes.length} para no seguir gastando. ` +
          `Arregla lo de arriba y dale otra vez.`,
        );
        return;
      }
      hechas++;
    }
    setStatus(`${hechas} ${hechas === 1 ? "voz generada" : "voces generadas"} ✓`);
  }

  function pendientesDe(filtro: (d: Dialogue) => boolean): [string, string, Dialogue][] {
    const fuera: [string, string, Dialogue][] = [];
    for (const sc of projRef.current.scenes)
      for (const sh of sc.shots)
        for (const d of sh.dialogues) if (filtro(d)) fuera.push([sc.id, sh.id, d]);
    return fuera;
  }

  function genAllVoices() {
    void narrarTodas(pendientesDe((d) => !!d.text.trim() && !d.audioId), "diálogos");
  }
  // Solo los que quedaron marcados porque les cambió el texto.
  function genStaleVoices() {
    void narrarTodas(pendientesDe((d) => !!d.stale && !!d.text.trim()), "cambios");
  }

  // ---------- textos de la narración (exportar / importar) ----------
  function exportTexts() {
    const datos = exportDialogues(projRef.current, name || "historia");
    if (!datos.dialogos.length) { setStatus("Todavía no hay diálogos que exportar."); return; }
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    download(blob, `${(name || "historia").replace(/[^\w\-]+/g, "-")}-textos.json`);
    setStatus(`${datos.dialogos.length} diálogos exportados ✓`);
  }
  async function importTexts(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = applyDialogues(projRef.current, JSON.parse(await f.text()));
      if (r.error) { setStatus(r.error); return; }
      if (!r.cambiados) {
        setStatus(r.desconocidos ? `Nada que cambiar (${r.desconocidos} id no est${r.desconocidos === 1 ? "á" : "án"} en este proyecto).` : "Los textos ya eran los mismos.");
        return;
      }
      mut(() => r.project);
      const partes = [`${r.cambiados} diálogo${r.cambiados === 1 ? "" : "s"} actualizado${r.cambiados === 1 ? "" : "s"}`];
      if (r.marcados) partes.push(`${r.marcados} pendiente${r.marcados === 1 ? "" : "s"} de regenerar la voz`);
      if (r.desconocidos) partes.push(`${r.desconocidos} id del archivo no est${r.desconocidos === 1 ? "á" : "án"} en este proyecto`);
      setStatus(partes.join(" · ") + " ✓");
    } catch (err: any) {
      setStatus("No se pudo leer el archivo: " + (err?.message ?? ""));
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
  // El sonido propio de un sticker: se guarda el archivo y se cuelga de él.
  async function addOverlaySound(sceneId: string, shot: Shot, overlayId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const soundId = nanoid(10);
    await putAsset(soundId, f);
    updShot(sceneId, shot.id, {
      ...shot,
      overlays: shot.overlays.map((o) => (o.id === overlayId ? { ...o, soundId, soundName: f.name } : o)),
    });
  }
  // El efecto que se está colocando (de la escena o de la toma).
  const curVfx =
    curFlat?.scene.vfx?.find((v) => v.id === selVfx)
    ?? curFlat?.shot.vfx?.find((v) => v.id === selVfx)
    ?? null;
  function updVfxNodes(id: string, nodes: VfxNode[]) {
    if (!curFlat) return;
    if ((curFlat.scene.vfx ?? []).some((v) => v.id === id)) {
      updSceneVfx(
        curFlat.scene.id,
        (curFlat.scene.vfx ?? []).map((v) => (v.id === id ? { ...v, nodes, auto: false } : v)),
      );
      return;
    }
    updShot(curFlat.scene.id, curFlat.shot.id, {
      ...curFlat.shot,
      vfx: curFlat.shot.vfx.map((v) => (v.id === id ? { ...v, nodes, auto: false } : v)),
    });
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
  // Añadir una pista de la biblioteca de la app. No se copia nada al navegador:
  // se guarda solo la referencia "lib:<id>", y el archivo lo sirve la propia
  // aplicación desde /musica.
  function addPistaBiblioteca(pista: Pista) {
    const layer: AudioLayer = {
      id: nanoid(6), kind: "music", audioId: refPista(pista), name: pista.titulo,
      volume: 0.35, startSec: 0, loop: true,
    };
    mut((p) => ({ ...p, audioLayers: [...p.audioLayers, layer] }));
    setVerBiblioteca(false);
    setStatus(`«${pista.titulo}» añadida ✓`);
  }

  function updLayer(id: string, patch: Partial<AudioLayer>) {
    mut((p) => ({ ...p, audioLayers: p.audioLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  // ---------- videos que se unen (careta / cierre) ----------

  // Cuánto dura un video. Muchos archivos grabados en el navegador (incluidos
  // los que exportaba TVPHI hasta ahora) no llevan la duración escrita y el
  // reproductor dice "infinito"; el truco es saltar al final y volver a mirar.
  async function videoDuration(url: string): Promise<number> {
    return new Promise<number>((res) => {
      const v = document.createElement("video");
      let acabado = false;
      const fin = (d: number) => { if (!acabado) { acabado = true; res(d > 0 && isFinite(d) ? d : 0); } };
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration > 0) return fin(v.duration);
        v.onseeked = () => { v.onseeked = null; fin(v.duration); };
        try { v.currentTime = 1e101; } catch { fin(0); }
      };
      v.onerror = () => fin(0);
      v.src = url;
      setTimeout(() => fin(0), 15000);
    });
  }
  async function addClip(donde: "intro" | "outro", e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setStatus(null);
    const assetId = nanoid(10);
    await putAsset(assetId, f);
    // La duración se lee del propio archivo para poder anunciar cuánto durará
    // el video final antes de exportarlo.
    const url = URL.createObjectURL(f);
    const dur = await videoDuration(url);
    URL.revokeObjectURL(url);
    if (!dur) setStatus("No se pudo leer ese video. Prueba con un MP4 o WebM normal.");
    mut((p) => ({ ...p, [donde]: { assetId, name: f.name, dur } }));
  }

  // ---------- persistencia ----------

  // Guarda (o crea, si no lleva id) y deja la lista al día. Devuelve el proyecto.
  async function guardar(id: string | null, nombre: string, data: StoryProject) {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id ?? undefined, name: nombre, data }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.cupo) setCupo(j.cupo);
    if (!res.ok) throw new Error(j.error || "Error");
    setProjects((prev) => [
      { id: j.project.id, name: j.project.name, updatedAt: j.project.updatedAt },
      ...prev.filter((p) => p.id !== j.project.id),
    ]);
    return j.project as ProjMeta;
  }

  // Igual que Guardar, pero sin tomar el mando: no bloquea la interfaz ni pisa
  // un mensaje que el usuario esté leyendo.
  async function autoguardar() {
    if (!projRef.current.scenes.length) return;
    try {
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId ?? undefined, name, data: projRef.current, seriesId }),
      });
      const j = await res.json();
      if (j.cupo) setCupo(j.cupo);
      if (!res.ok) return;
      setProjectId(j.project.id);
      setProjects((prev) => [
        { id: j.project.id, name: j.project.name, seriesId: j.project.seriesId ?? null, updatedAt: j.project.updatedAt },
        ...prev.filter((p) => p.id !== j.project.id),
      ]);
      setDirty(false);
      syncStoryUrl({ id: j.project.id });
      setStatus(`Guardado automático ✓ · ${new Date().toLocaleTimeString()}`);
    } catch {
      // Sin red o sin sesión: se calla y lo intentará al siguiente cambio. El
      // aviso al cerrar la pestaña sigue estando por si acaso.
    }
  }
  guardarRef.current = autoguardar;

  async function save() {
    setBusy("save");
    setStatus(null);
    try {
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId ?? undefined, name, data: project, seriesId }),
      });
      const j = await res.json();
      if (j.cupo) setCupo(j.cupo);
      if (!res.ok) throw new Error(j.error || "Error");
      setProjectId(j.project.id);
      void cargarSeries();
      setProjects((prev) => [
        { id: j.project.id, name: j.project.name, seriesId: j.project.seriesId ?? null, updatedAt: j.project.updatedAt },
        ...prev.filter((p) => p.id !== j.project.id),
      ]);
      setDirty(false);
      syncStoryUrl({ id: j.project.id });
      setStatus("Proyecto guardado ✓");
    } catch (err: any) {
      setStatus("Error al guardar: " + (err?.message ?? ""));
    }
    setBusy(null);
  }
  // ---------- reconectar archivos perdidos ----------
  // Se guarda con el MISMO identificador que tenía: así todo lo que apuntaba a
  // ese archivo (una escena, un sticker, varias tomas) queda arreglado de una
  // vez, sin tocar el proyecto.
  async function reponer(falta: Falta, file: File) {
    setReponiendo(falta.id);
    try {
      await putAsset(falta.id, file);
      // Una imagen de escena manda en la proporción: los encuadres se guardan en
      // tanto por uno, así que si la nueva imagen no mide igual hay que rehacer
      // las medidas o el encuadre sale torcido.
      if (falta.tipo === "escena" && falta.sceneIds.length) {
        const medidas = await medirImagen(file);
        if (medidas) {
          mut((p) => ({
            ...p,
            scenes: p.scenes.map((sc) =>
              falta.sceneIds.includes(sc.id) ? { ...sc, imgW: medidas.w, imgH: medidas.h } : sc,
            ),
          }));
        }
      }
      setFaltas(await faltantes(projRef.current));
      engineRef.current?.update(projRef.current);
      setStatus(`Archivo repuesto ✓ · ${falta.donde.join(" · ")}`);
    } catch (err: any) {
      setStatus("No se pudo reponer: " + (err?.message ?? ""));
    }
    setReponiendo(null);
  }

  // ---------- dibujar las escenas que faltan ----------
  //
  // La IA ya escribía el montaje entero, pero las imágenes había que ponerlas a
  // mano una por una. Cada escena lleva su descripción («prompt»), así que se
  // puede dibujar sin volver a escribir nada — y se puede corregir antes.

  function descripcionDe(falta: Falta): string {
    const sc = projRef.current.scenes.find((s) => falta.sceneIds.includes(s.id));
    return sc?.prompt ?? "";
  }

  // Devuelve si salió bien, para poder parar el lote al primer fallo.
  async function dibujarUna(falta: Falta, texto: string): Promise<boolean> {
    const descripcion = texto.trim();
    if (descripcion.length < 4) {
      setStatus("Describe la imagen antes de dibujarla.");
      return false;
    }
    setReponiendo(falta.id);
    try {
      // Si la escena ya trae efectos del JSON, se pintan sobre negro y se mandan
      // como referencia (imagen + máscara) para que el fondo encaje con ellos.
      let referenciaVfx: Awaited<ReturnType<typeof crearReferenciaVfx>> = null;
      const sceneId = falta.sceneIds[0];
      if (sceneId) {
        try {
          referenciaVfx = await crearReferenciaVfx(projRef.current, sceneId);
        } catch (e) {
          console.warn("No se pudo preparar la referencia VFX", e);
        }
      }
      if (referenciaVfx) setStatus(`Dibujando con ${referenciaVfx.resumen.split("\n").length} anclas VFX…`);

      const r = await fetch("/api/story/ia/imagen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // El formato del video manda: una escena apaisada pedida cuadrada se ve mal.
        body: JSON.stringify({
          prompt: descripcion,
          formato: projRef.current.aspect,
          ...(referenciaVfx ? { referenciaVfx } : {}),
        }),
      });
      const j = await r.json();
      if (esSinCupo(r, j)) { setStatus(j.error); return false; }
      if (!r.ok) throw new Error(j.error || "Error");
      const bin = atob(j.imagen);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: "image/png" });
      // Se guarda con el MISMO identificador, igual que al reponerla a mano: si
      // esa imagen se usaba en varios sitios, todos quedan arreglados de una vez.
      await putAsset(falta.id, blob);
      const medidas = await medirImagen(blob);
      mut((p) => ({
        ...p,
        scenes: p.scenes.map((sc) =>
          falta.sceneIds.includes(sc.id)
            ? { ...sc, ...(medidas ? { imgW: medidas.w, imgH: medidas.h } : {}), prompt: descripcion }
            : sc,
        ),
      }));
      setFaltas(await faltantes(projRef.current));
      engineRef.current?.update(projRef.current);
      const conRef = j.referenciaVfxUsada ? " (con VFX)" : "";
      setStatus(`Imagen dibujada ✓${conRef} · ${falta.donde.join(" · ")}`);
      return true;
    } catch (err: any) {
      setStatus("No se pudo dibujar: " + (err?.message ?? ""));
      return false;
    } finally {
      setReponiendo(null);
    }
  }

  // ---------- rehacer un trozo que no convence ----------
  //
  // Regenerar el capítulo entero porque una frase no gusta es tirar el resto
  // del trabajo y volver a pagarlo. Aquí se rehace solo la pieza, mandándole el
  // contexto de alrededor para que lo nuevo encaje con lo que ya hay.

  // Lo que se dice justo antes y justo después, en todo el capítulo. Sin esto
  // la frase nueva puede repetir lo anterior o contradecir lo siguiente.
  function vecinos(dId: string): { antes?: string; despues?: string } {
    const todos: Dialogue[] = [];
    for (const sc of projRef.current.scenes)
      for (const sh of sc.shots) todos.push(...sh.dialogues);
    const i = todos.findIndex((x) => x.id === dId);
    if (i < 0) return {};
    return { antes: todos[i - 1]?.text, despues: todos[i + 1]?.text };
  }

  async function rehacerTexto(sceneId: string, shotId: string, d: Dialogue) {
    if (!d.text.trim()) { setStatus("No hay nada que rehacer."); return; }
    setRehaciendo(d.id);
    try {
      const sc = projRef.current.scenes.find((x) => x.id === sceneId);
      const r = await fetch("/api/story/ia/rehacer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          que: "texto", actual: d.text,
          contexto: { titulo: name, escena: sc?.prompt, quien: d.quien, ...vecinos(d.id) },
        }),
      });
      const j = await r.json();
      if (esSinCupo(r, j)) { setStatus(j.error); return; }
      if (!r.ok) throw new Error(j.error || "Error");
      if (j.igual) { setStatus("Ha devuelto lo mismo. Prueba otra vez o cámbialo a mano."); return; }
      // La voz que había ya no corresponde al texto: se marca para regenerarla.
      patchDialogue(sceneId, shotId, d.id, { text: j.texto, ...(d.audioId ? { stale: true } : {}) });
      setStatus(d.audioId ? "Otra versión ✓ · vuelve a generar su voz" : "Otra versión ✓");
    } catch (e: any) {
      setStatus("No se pudo rehacer: " + (e?.message ?? ""));
    } finally { setRehaciendo(null); }
  }

  // Otra descripción para la misma escena: mismo sitio y mismos personajes,
  // otro encuadre o otra luz.
  async function rehacerDescripcion(falta: Falta, texto: string) {
    setRehaciendo(falta.id);
    try {
      const r = await fetch("/api/story/ia/rehacer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que: "imagen", actual: texto, contexto: { titulo: name } }),
      });
      const j = await r.json();
      if (esSinCupo(r, j)) { setStatus(j.error); return; }
      if (!r.ok) throw new Error(j.error || "Error");
      setDibujo((v) => (v ? { ...v, texto: j.texto } : v));
      setStatus(j.igual ? "Ha devuelto lo mismo." : "Otra descripción ✓ · revísala y dibújala");
    } catch (e: any) {
      setStatus("No se pudo rehacer: " + (e?.message ?? ""));
    } finally { setRehaciendo(null); }
  }

  // ---------- montar el capítulo entero, a la vista ----------
  //
  // Antes, al escribir un capítulo con IA, salía un borrador con todas las
  // escenas vacías y te tocaba ir pieza a pieza. Ahora se dibuja y se narra
  // solo, y se ve por dónde va: es la diferencia entre esperar mirando una
  // barra y ver cómo se construye tu historia.
  async function montarTodo() {
    // Por si la clave/modelo se guardaron después de montar esta pantalla.
    const cap = await refrescarCapacidadesIa();
    const dibujos = !!(cap?.configurada && cap?.models?.imagen);
    let fs = await faltantes(projRef.current);
    setFaltas(fs);

    if (dibujos) {
      const pend = fs.filter((f) => f.tipo === "escena" && descripcionDe(f).trim().length >= 4);
      for (let i = 0; i < pend.length; i++) {
        setMontaje({ fase: "dibujando", hechas: i, total: pend.length, detalle: pend[i].donde.join(" · ") });
        if (!(await dibujarUna(pend[i], descripcionDe(pend[i])))) {
          zipTrasMontajeRef.current = false;
          setMontaje({ fase: "parado", hechas: i, total: pend.length, detalle: "dibujando las imágenes" });
          return;
        }
      }
    }

    const voces = pendientesDe((d) => !!d.text.trim() && !d.audioId);
    for (let i = 0; i < voces.length; i++) {
      const [sceneId, shotId, d] = voces[i];
      setMontaje({
        fase: "narrando", hechas: i, total: voces.length,
        detalle: (d.quien || "narrador") + ": " + d.text.slice(0, 40),
      });
      if (!(await genVoice(sceneId, shotId, d))) {
        zipTrasMontajeRef.current = false;
        setMontaje({ fase: "parado", hechas: i, total: voces.length, detalle: "generando las voces" });
        return;
      }
    }

    setFaltas(await faltantes(projRef.current));
    setMontaje({ fase: "listo", hechas: voces.length, total: voces.length, detalle: "" });
    setStatus("Capítulo montado ✓ · revísalo y guarda");
    // Historia con IA: al terminar el montaje se descarga el paquete solo.
    if (zipTrasMontajeRef.current) {
      zipTrasMontajeRef.current = false;
      setStatus("Capítulo montado ✓ · descargando el ZIP…");
      await exportPaquete();
    }
  }

  // Arranca en cuanto la IA entrega el borrador, no antes: hace falta que el
  // proyecto nuevo ya esté puesto para poder recorrerlo.
  useEffect(() => {
    if (!montarAlEntrar) return;
    setMontarAlEntrar(false);
    void montarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montarAlEntrar]);

  // ---------- el proyecto entero en un JSON ----------
  // Viaja el montaje, no los archivos: por eso al abrirlo en otro equipo salen
  // como faltantes y se reponen con "Buscar". Meter las imágenes dentro haría un
  // archivo de cientos de megas.
  async function exportProject() {
    // Con la referencia dentro: qué efectos hay, cómo se comporta cada uno y las
    // reglas del montaje. Así el archivo se explica solo y se le puede dar a una
    // IA tal cual. Al importar se ignora entero.
    let referencia: unknown = undefined;
    try { referencia = await (await fetch("/api/story/efectos")).json(); } catch {}
    const datos = { tvphi: "historia", version: 1, name, project: projRef.current, referencia };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    download(blob, `${(name || "historia").replace(/[^\w\-]+/g, "-")}-capitulo.json`);
    setStatus("Capítulo exportado ✓ · lleva dentro el catálogo de efectos; las imágenes no viajan");
  }

  // ── el capítulo entero, con sus archivos ──
  // El JSON solo lleva el montaje; las imágenes y los audios se quedaban fuera y
  // había que reponerlos a mano uno a uno. Aquí van dentro del mismo archivo,
  // con su identificador en el nombre, y al importarlo se colocan solos.
  async function exportPaquete() {
    setBusy("zip");
    try {
      const p = projRef.current;
      const refs = referencias(p);
      const vistos = new Set<string>();
      const entradas: { nombre: string; datos: Uint8Array }[] = [];
      let sinArchivo = 0;
      for (const r of refs) {
        if (vistos.has(r.id)) continue;
        vistos.add(r.id);
        // Las pistas de la biblioteca no se meten: ya viajan dentro de la app,
        // así que copiarlas engordaría el paquete para nada.
        if (esDeBiblioteca(r.id) || esDeBibliotecaSonido(r.id)) continue;
        const blob = await getAsset(r.id);
        if (!blob) { sinArchivo++; continue; }
        const ext = (blob.type.split("/")[1] || "bin").replace(/[^\w]/g, "").slice(0, 5);
        entradas.push({
          nombre: nombreArchivo(r.id, `${r.tipo}-${r.donde}`, "." + ext),
          datos: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      let referencia: unknown = undefined;
      try { referencia = await (await fetch("/api/story/efectos")).json(); } catch {}
      const meta = { tvphi: "historia", version: 1, name, project: p, referencia };
      entradas.unshift({
        nombre: "proyecto.json",
        datos: new TextEncoder().encode(JSON.stringify(meta, null, 2)),
      });
      const zip = crearZip(entradas);
      download(zip, `${(name || "historia").replace(/[^\w\-]+/g, "-")}-completo.zip`);
      setStatus(`Paquete descargado ✓ · ${entradas.length - 1} archivos${sinArchivo ? ` (faltaban ${sinArchivo})` : ""}`);
    } catch (e: any) { setStatus("No se pudo empaquetar: " + (e?.message ?? "")); }
    setBusy(null);
  }

  async function importPaquete(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Importar igualmente?")) return;
    setBusy("zip");
    try {
      const entradas = await leerZip(f);
      const meta = entradas.find((x) => x.nombre === "proyecto.json");
      if (!meta) throw new Error("ese ZIP no lleva un proyecto dentro");
      // Los archivos se guardan CON SU IDENTIFICADOR de siempre: por eso el
      // montaje los encuentra sin que haya que reponer nada a mano.
      let puestos = 0;
      for (const x of entradas) {
        const id = idDeNombre(x.nombre);
        if (!id) continue;
        // Se copia a un búfer propio: la porción del ZIP apunta al original.
        await putAsset(id, new Blob([new Uint8Array(x.datos)]));
        puestos++;
      }
      const crudo = JSON.parse(new TextDecoder().decode(meta.datos));
      const data = migrateProject(crudo?.project ?? crudo);
      if (!data.scenes.length) throw new Error("ese proyecto no tiene escenas");
      setProject(data);
      setProjectId(null);
      if (crudo?.name) setName(String(crudo.name));
      const primera = data.scenes[0];
      setOpenScene(primera?.id ?? null);
      setSelShot(primera?.shots[0]?.id ?? null);
      setSelOverlay(null);
      setSection(null);
      setDirty(true);
      setVista("editor");
      syncStoryUrl({});
      seek(0);
      const f2 = await faltantes(data);
      setFaltas(f2);
      setStatus(f2.length
        ? `Paquete importado ✓ · ${puestos} archivos puestos, faltan ${f2.length}`
        : `Paquete importado ✓ · ${puestos} archivos puestos, no falta nada`);
    } catch (e: any) { setStatus("No se pudo importar: " + (e?.message ?? "")); }
    setBusy(null);
  }

  // ── la saga entera ──
  async function exportSaga() {
    setBusy("saga");
    try {
      const r = await fetch(`/api/story/saga${seriesId ? `?id=${seriesId}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      const nom = (j.serie?.name || "saga").replace(/[^\w\-]+/g, "-");
      download(new Blob([JSON.stringify(j, null, 2)], { type: "application/json" }), `${nom}-saga.json`);
      setStatus(`Saga exportada ✓ · ${j.capitulos.length} capítulos y ${j.personajes.length} personajes`);
    } catch (e: any) { setStatus("No se pudo exportar la saga: " + (e?.message ?? "")); }
    setBusy(null);
  }
  async function importSaga(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("saga");
    try {
      const crudo = JSON.parse(await f.text());
      if (!Array.isArray(crudo?.capitulos)) throw new Error("ese JSON no es una saga");
      // La serie primero, para colgarle luego capítulos y personajes.
      const rs = await fetch("/api/story/series", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(crudo.serie?.name || "Saga importada"),
          data: { description: "", style: "", model: "", seed: "", notes: "", ...(crudo.serie?.data ?? {}) } }),
      });
      const js = await rs.json();
      if (!rs.ok) throw new Error(js.error || "Error");
      const sid = js.serie.id;
      for (const cap of crudo.capitulos) {
        await fetch("/api/story", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: String(cap.name || "Capítulo"), data: migrateProject(cap.project), seriesId: sid }),
        });
      }
      for (const per of crudo.personajes ?? []) {
        await fetch("/api/story/characters", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: String(per.name || "Personaje"), data: per.data, seriesId: sid }),
        });
      }
      await cargarSeries();
      setSeriesId(sid);
      const l = await (await fetch("/api/story")).json();
      setProjects(l.projects ?? []);
      if (l.cupo) setCupo(l.cupo);
      setStatus(`Saga importada ✓ · ${crudo.capitulos.length} capítulos. Ábrelos y repón sus imágenes.`);
    } catch (e: any) { setStatus("No se pudo importar la saga: " + (e?.message ?? "")); }
    setBusy(null);
  }
  async function importProject(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Importar igualmente?")) return;
    try {
      const crudo = JSON.parse(await f.text());
      // Vale tanto el archivo que saca este botón como el proyecto a pelo.
      const data = migrateProject(crudo?.project ?? crudo);
      if (!data.scenes.length) throw new Error("ese JSON no tiene escenas");
      setProject(data);
      // Es una copia nueva: si se guarda, no pisa el proyecto de donde salió.
      setProjectId(null);
      if (crudo?.name) setName(String(crudo.name));
      const primera = data.scenes[0];
      const abrible = primera && !loadLocks()[primera.id] ? primera : null;
      setOpenScene(abrible?.id ?? null);
      setSelShot(abrible?.shots[0]?.id ?? null);
      setDirty(true);
      seek(0);
      const f2 = await faltantes(data);
      setFaltas(f2);
      setStatus(f2.length
        ? `Proyecto importado ✓ · faltan ${f2.length} archivos, búscalos abajo`
        : "Proyecto importado ✓");
    } catch (err: any) {
      setStatus("No se pudo importar: " + (err?.message ?? ""));
    }
  }

  async function load(id: string, opts?: { silencioso?: boolean }) {
    if (!opts?.silencioso && dirty && !confirm("Tienes cambios sin guardar. ¿Cargar otro proyecto igualmente?")) return;
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
      setSeriesId(j.project.seriesId ?? null);
      setVista("editor");
      syncStoryUrl({ id: j.project.id });
      // Si la primera escena está bloqueada, se respeta y no se abre sola.
      const primera = data.scenes[0];
      const abrible = primera && !loadLocks()[primera.id] ? primera : null;
      setOpenScene(abrible?.id ?? null);
      setSelShot(abrible?.shots[0]?.id ?? null);
      setDirty(false);
      seek(0);
      setStatus(opts?.silencioso ? null : "Proyecto cargado ✓");
    } catch (err: any) {
      setStatus("Error al cargar: " + (err?.message ?? ""));
      // Si venía de la URL y falló, vuelve al inicio limpio.
      if (opts?.silencioso) {
        setVista("inicio");
        setProjectId(null);
        syncStoryUrl({});
      }
    }
    setBusy(null);
  }
  async function pedirProyecto(id: string): Promise<StoryProject> {
    const r = await fetch(`/api/story?id=${id}`);
    if (!r.ok) throw new Error("No se pudo leer el proyecto");
    return migrateProject((await r.json()).project.data);
  }

  // Borra el proyecto y, de paso, sus imágenes/audios/videos de este navegador:
  // son los archivos pesados y no sirven para nada sin el proyecto.
  async function deleteProject(p: ProjMeta) {
    if (!confirm(`¿Borrar "${p.name}"? También se borrarán del navegador sus imágenes y audios. No se puede deshacer.`)) return;
    setBusy("delete");
    setStatus(null);
    try {
      // Se miran los archivos ANTES de borrarlo, y también los de los demás
      // proyectos: una copia en otro formato usa las mismas imágenes, así que
      // solo se borran las que no le sirvan ya a nadie. Si algo falla al
      // consultarlos no se borra ninguna: mejor que sobre a que falte.
      let assets: string[] = [];
      try {
        const mios = projectAssets(await pedirProyecto(p.id));
        const enUso = new Set<string>();
        for (const otro of projects) {
          if (otro.id === p.id) continue;
          for (const a of projectAssets(await pedirProyecto(otro.id))) enUso.add(a);
        }
        assets = mios.filter((a) => !enUso.has(a));
      } catch {
        assets = [];
      }

      const res = await fetch(`/api/story?id=${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error");
      await Promise.all(assets.map((id) => deleteAsset(id).catch(() => {})));

      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      if (projectId === p.id) {
        setProject(emptyProject());
        setProjectId(null);
        setName("Mi historia");
        setOpenScene(null);
        setSelShot(null);
        setSelOverlay(null);
        setSection(null);
        setDirty(false);
        seek(0);
        setVista("inicio");
        syncStoryUrl({});
      }
      setStatus(`"${p.name}" borrado ✓`);
    } catch (err: any) {
      setStatus("No se pudo borrar: " + (err?.message ?? ""));
    }
    setBusy(null);
  }

  // Un proyecto nuevo empieza eligiendo la forma del video: cada historia se
  // hace para un sitio (YouTube, Shorts…) y se trabaja con esa forma desde el
  // primer encuadre, que es lo que evita rehacerlos después.
  function newProject() {
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Empezar un proyecto nuevo?")) return;
    setCreando(true);
  }
  function crearProyecto(a: Aspect) {
    setProjectAspect(a);
    setProject({ ...emptyProject(), aspect: a });
    setProjectId(null);
    setName("Mi historia");
    setOpenScene(null);
    setSelShot(null);
    setSelOverlay(null);
    setSection(null);
    setDirty(false);
    setCreando(false);
    setVista("editor");
    syncStoryUrl({});
    seek(0);
    setStatus(`Proyecto nuevo en ${aspectInfo(a).label} (${aspectInfo(a).w}×${aspectInfo(a).h})`);
  }

  // ---------- formato del video ----------

  // Al pasar de horizontal a vertical (o al revés) la ventana que recorre cada
  // imagen cambia de forma, así que los encuadres guardados se reajustan para
  // que sigan cabiendo. Se conserva el centro de cada uno.
  // El formato de un proyecto NO se cambia: al cambiar de forma, la ventana que
  // recorre cada imagen cambia y hay que reencuadrar todas las tomas, así que
  // hacerlo encima del trabajo hecho lo estropea. En su lugar se saca una copia
  // aparte y el proyecto original se queda intacto.
  async function copiarEnFormato(a: Aspect) {
    if (a === project.aspect) return;
    const info = aspectInfo(a);
    const nombre = `${name} (${info.label})`;
    if (!confirm(
      `Se creará una copia aparte llamada «${nombre}» en ${info.label} (${info.w}×${info.h}).\n\n` +
      `«${name}» no se toca: se queda como está.\n\n` +
      `En la copia habrá que revisar los encuadres, porque la imagen se ve de otra forma.`,
    )) return;

    setBusy("copy");
    setStatus(null);
    try {
      // Lo que haya sin guardar se guarda ANTES en el original, para que la copia
      // salga de lo que se ve y el original no pierda nada.
      let baseId = projectId;
      if (dirty || !baseId) {
        const guardado = await guardar(projectId, name, projRef.current);
        baseId = guardado.id;
        setProjectId(guardado.id);
        setDirty(false);
      }
      const copia = switchAspect(projRef.current, a);
      const creado = await guardar(null, nombre, copia);
      setProject(copia);
      setProjectId(creado.id);
      setName(nombre);
      setSection(null);
      setDirty(false);
      seek(0);
      setStatus(`Copia «${nombre}» creada ✓ · «${name}» quedó intacto · revisa los encuadres`);
    } catch (err: any) {
      setStatus("No se pudo copiar: " + (err?.message ?? ""));
    }
    setBusy(null);
  }

  // ---------- exportar ----------
  async function doExport() {
    if (!project.scenes.length && !project.intro && !project.outro) {
      setStatus("Añade al menos una imagen (o un video para unir).");
      return;
    }
    const eng = engineRef.current!;
    setExporting(true);
    setProgress(0);
    setStatus(null);
    const nombre = `tvphi-historia-${Date.now()}`;
    try {
      const webmMime = Recorder.pickMime();
      if (format === "webm" || format === "mp4") {
        const nativo = format === "mp4" ? Recorder.pickMp4() : webmMime;
        if (format === "mp4" && !nativo) {
          // El navegador no sabe grabar MP4: hay que recodificar.
          setStatus("Convirtiendo a MP4 (puede tardar)…");
          const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
          download(await convert(b, "mp4", (p) => setProgress(0.5 + p * 0.5)), `${nombre}.mp4`);
        } else {
          const bruto = await eng.export(nativo, (p) => setProgress(p * 0.85));
          // Lo que sale del grabador no lleva escrita su duración (el móvil marca
          // 0:00) y el MP4 sale fragmentado, que es lo que rechaza YouTube. Se
          // vuelve a empaquetar sin recodificar, que es rápido.
          setStatus("Cerrando el archivo…");
          let final = bruto;
          try {
            final = await remux(bruto, format, (p) => setProgress(0.85 + p * 0.15));
          } catch {
            setStatus("El video se descargó, pero no se pudo escribir su duración.");
          }
          download(final, `${nombre}.${format}`);
        }
      } else {
        setStatus(`Convirtiendo a ${format.toUpperCase()} (puede tardar)…`);
        const b = await eng.export(webmMime, (p) => setProgress(p * 0.5));
        download(await convert(b, format, (p) => setProgress(0.5 + p * 0.5)), `${nombre}.${format}`);
      }
      setStatus((s) => (s?.startsWith("El video se descargó") ? s : "Descarga lista ✓"));
    } catch (err: any) {
      setStatus("Error al exportar: " + (err?.message ?? ""));
    }
    setExporting(false);
  }

  if (vista === "inicio") {
    return (
      <StoryHome
        series={series}
        proyectos={projects}
        cupo={cupo}
        busy={busy === "load" || busy === "delete"}
        serieInicial={initialSerie}
        onSerieVista={(sid) => syncStoryUrl({ serie: sid })}
        onAbrir={(id) => void load(id)}
        // Se entra al editor y ahí se pregunta la forma del video.
        onNuevoCapitulo={(sid) => {
          setSeriesId(sid);
          setVista("editor");
          syncStoryUrl({});
          newProject();
        }}
        onNuevaSerie={async () => {
          const nom = prompt("Nombre de la serie nueva");
          if (!nom?.trim()) return;
          const r = await fetch("/api/story/series", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: nom.trim(), data: { description: "", style: "", model: "", seed: "", notes: "" } }),
          });
          if (r.ok) await cargarSeries();
        }}
        onBorrar={(id, nom) => deleteProject({ id, name: nom, updatedAt: "" })}
        onImportarZip={importPaquete}
        onCupo={setCupo}
        onMoverSerie={async (capId, nuevaSerieId) => {
          setBusy("load");
          try {
            const res = await fetch(`/api/story?id=${capId}`);
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || "No se pudo leer el capítulo");
            const r = await fetch("/api/story", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: capId,
                name: j.project.name,
                data: j.project.data,
                seriesId: nuevaSerieId,
              }),
            });
            if (!r.ok) {
              const e = await r.json().catch(() => ({}));
              throw new Error(e.error || "No se pudo mover");
            }
            await Promise.all([
              fetch("/api/story").then((r) => r.json()).then((l) => {
                setProjects(l.projects ?? []);
                if (l.cupo) setCupo(l.cupo);
              }),
              cargarSeries(),
            ]);
            setStatus(
              nuevaSerieId == null
                ? "Capítulo suelto (sin serie)"
                : "Capítulo movido a la serie",
            );
          } catch (err: any) {
            setStatus("No se pudo cambiar la serie: " + (err?.message ?? ""));
          }
          setBusy(null);
        }}
        // Lo que escribe la IA se abre en el editor SIN guardar: es un borrador
        // hasta que el usuario decida. Sus imágenes saldrán como faltantes.
        onGenerado={(nom, p) => {
          const data = migrateProject(p);
          setProject(data);
          setProjectId(null);
          setName(nom);
          const primera = data.scenes[0];
          setOpenScene(primera?.id ?? null);
          setSelShot(primera?.shots[0]?.id ?? null);
          setSelOverlay(null);
          setSection(null);
          setDirty(true);
          setVista("editor");
          syncStoryUrl({});
          seek(0);
          setStatus(`Borrador de la IA: ${data.scenes.length} escenas. Montando…`);
          // Sin esperar a que el usuario pida nada: se dibuja y se narra solo,
          // y él lo va viendo aparecer. Al acabar, el ZIP se descarga solo.
          zipTrasMontajeRef.current = true;
          setMontarAlEntrar(true);
        }}
      />
    );
  }

  return (
    <div className="tool-ui grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {/* Dónde estás y cómo salir: sin esto, entrar al editor era un viaje sin
            vuelta y no se sabía de qué serie era el capítulo. */}
        <StoryBreadcrumb
          serie={series.find((x) => x.id === seriesId)?.name ?? null}
          capitulo={name}
          onVolver={() => {
            void cargarSeries();
            setVista("inicio");
            // Si el capítulo era de una serie, vuelve a esa carpeta.
            syncStoryUrl({ serie: seriesId });
          }}
        />

        {/* Previsualización del video entero. Va en el flujo de la página y se
            desplaza con ella: es grande, y clavada arriba estorbaba más de lo que
            ayudaba, porque se comía media pantalla mientras editabas la toma.
            Para editar de cerca está la ventana de la escena o la toma, que sí se
            queda arriba pero es pequeña y lleva sus propias herramientas. */}
        <div className="card p-3">
          {/* Los botones van FUERA del cuadro: encima de la imagen tapaban justo
              la parte donde hace falta poner sitios. */}
          {curVfx && !section && (
            <VfxTools
              layer={curVfx} activo={colocando} borrando={borrandoVfx}
              onToggle={setColocando} onBorrando={setBorrandoVfx}
              onChange={(nodes) => updVfxNodes(curVfx.id, nodes)}
            />
          )}
          {/* Se limita la altura para que, al quedarse fija, deje sitio al editor. */}
          <div
            className="relative mx-auto w-full overflow-hidden rounded-2xl border border-border bg-black"
            style={{ aspectRatio: `${forma.w} / ${forma.h}`, maxWidth: `calc(42vh * ${forma.ratio})` }}
          >
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
            {/* Colocar el efecto dibujando encima: tocar puntos, trazar líneas
                o pintar a mano alzada, que es como se acierta de verdad. */}
            {curVfx && colocando && (
              <VfxCanvas
                layer={curVfx} borrando={borrandoVfx}
                onChange={(nodes) => updVfxNodes(curVfx.id, nodes)}
                onSettled={() => engineRef.current?.resetVfx()}
              />
            )}
            {!project.scenes.length && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
                Sube imágenes para empezar tu historia.
              </div>
            )}
            {/* El lienzo está prestado a la miniatura flotante: se explica en vez
                de dejar un recuadro negro. */}
            {section && (
              <div className="absolute inset-0 grid place-items-center gap-2 p-4 text-center">
                <div>
                  <p className="text-sm text-fg/80">Viendo <strong>{section.label}</strong> en la ventana de arriba</p>
                  <button onClick={closeSection} className="btn-ghost mx-auto mt-2 text-xs">
                    <X className="h-3.5 w-3.5" /> Volver al video completo
                  </button>
                </div>
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

        {/* Lo que falta, en cuanto falta: va justo debajo del reproductor porque
            es lo primero que hay que resolver al abrir un proyecto de otro sitio. */}
        {/* Ver cómo se construye, en vez de esperar mirando una barra. */}
        {/* Se acabó la IA de hoy. Se dice UNA vez y en claro, con lo que sí
            se puede seguir haciendo: si no, el usuario ve botones que no
            responden y cree que la app está rota. */}
        {sinCupoIa && (
          <div className="card border-gold/60 bg-gold/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gold">{sinCupoIa}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Mientras tanto puedes seguir montando el capítulo entero a mano: encuadres,
                  tiempos, efectos, música y stickers. La voz sigue funcionando con el modelo
                  del navegador, que es gratis.
                </p>
              </div>
              <button onClick={() => setSinCupoIa(null)} className="shrink-0 text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {montaje && (
          <div className={`card p-3 ${montaje.fase === "parado" ? "border-danger/50" : "border-accent/50"}`}>
            <div className="flex items-center gap-2">
              {montaje.fase === "listo" ? <Check className="h-4 w-4 shrink-0 text-accent" />
                : montaje.fase === "parado" ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />}
              <span className="label">
                {montaje.fase === "dibujando" && `Dibujando las escenas · ${montaje.hechas + 1} de ${montaje.total}`}
                {montaje.fase === "narrando" && `Grabando las voces · ${montaje.hechas + 1} de ${montaje.total}`}
                {montaje.fase === "listo" && "Capítulo montado"}
                {montaje.fase === "parado" && `Se paró ${montaje.detalle}`}
              </span>
              <button onClick={() => setMontaje(null)} className="ml-auto text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
            {montaje.fase !== "listo" && montaje.fase !== "parado" && (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-accent transition-all"
                    style={{ width: `${Math.round((montaje.hechas / Math.max(1, montaje.total)) * 100)}%` }} />
                </div>
                <p className="mt-1 truncate text-[11px] text-muted">{montaje.detalle}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Puedes seguir tocando el capítulo mientras tanto. Se para solo si algo falla,
                  para no gastar de más.
                </p>
              </>
            )}
            {montaje.fase === "parado" && (
              <button onClick={() => void montarTodo()} className="btn-ghost mt-2 w-full text-xs">
                <Sparkles className="h-4 w-4 text-accent" /> Seguir desde donde se quedó
              </button>
            )}
          </div>
        )}

        {/* Quién habla con qué voz OpenAI. Siempre visible si hay TTS de OpenAI. */}
        {vozOpenAi && (
          <div className="card p-3">
            <span className="label">Voces del capítulo</span>
            <p className="mt-1 text-[11px] text-muted">
              Cada quien usa una voz distinta de OpenAI al generar el audio. Si cambias una,
              las frases ya grabadas se marcan para regenerarlas.
            </p>
            <div className="mt-2 space-y-2">
              {quienesHablan(project).map((quien) => (
                <label key={quien || "narrador"} className="block">
                  <span className="text-[11px] text-muted">{quien || "Narrador"}</span>
                  <select
                    className="input mt-0.5 w-full text-sm"
                    aria-label={`Voz de ${quien || "narrador"}`}
                    value={project.voices?.[quien] ?? ""}
                    onChange={(e) => {
                      const next = e.target.value;
                      mut((p) => ({
                        ...p,
                        voices: { ...(p.voices ?? {}), [quien]: next },
                        scenes: p.scenes.map((sc) => ({
                          ...sc,
                          shots: sc.shots.map((sh) => ({
                            ...sh,
                            dialogues: sh.dialogues.map((d) =>
                              (d.quien ?? "") === quien && d.audioId
                                ? { ...d, stale: true }
                                : d,
                            ),
                          })),
                        })),
                      }));
                    }}
                  >
                    <option value="">La de siempre (ajuste global)</option>
                    {VOCES_INFO.map((v) => (
                      <option key={v.id} value={v.id}>{v.id} · {v.que}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <MissingAssets
          faltas={faltas}
          reponiendo={reponiendo}
          onReponer={reponer}
          forzarAbierto={dibujo?.ancla === "faltas"}
          onDibujar={iaImagen ? (f) => setDibujo({ falta: f, texto: descripcionDe(f), ancla: "faltas" }) : undefined}
          onGenerarTodoIa={iaImagen || vozOpenAi ? () => void montarTodo() : undefined}
          generandoTodo={!!montaje && montaje.fase !== "listo" && montaje.fase !== "parado"}
          dibujoId={dibujo?.ancla === "faltas" ? dibujo.falta.id : null}
          panelDibujo={dibujo?.ancla === "faltas" ? (
            <div className="rounded-lg border border-accent/40 bg-surface p-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                <span className="label text-xs">Dibujar {dibujo.falta.donde.join(" · ")}</span>
                <button type="button" onClick={() => setDibujo(null)} className="ml-auto text-muted hover:text-fg">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <textarea
                className="input mt-2 h-24 w-full text-sm"
                value={dibujo.texto}
                onChange={(e) => setDibujo((d) => (d ? { ...d, texto: e.target.value } : d))}
                aria-label="Cómo es esta imagen"
                placeholder="Qué se ve, encuadre, luz y ambiente. Sin letras dentro de la imagen."
              />
              <p className="mt-1 text-[11px] text-muted">
                Se dibuja en {project.aspect}, el formato del video. Repite la descripción de los
                personajes tal cual en cada escena: es lo único que hace que se parezcan entre sí.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void rehacerDescripcion(dibujo.falta, dibujo.texto)}
                  disabled={rehaciendo === dibujo.falta.id || dibujo.texto.trim().length < 4}
                  className="btn-ghost flex-1 text-xs disabled:opacity-40"
                  title="Otra forma de describir la misma escena"
                >
                  {rehaciendo === dibujo.falta.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4 text-accent" />}
                  Otra descripción
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const d = dibujo;
                    setDibujo(null);
                    await dibujarUna(d.falta, d.texto);
                  }}
                  disabled={reponiendo === dibujo.falta.id || dibujo.texto.trim().length < 4}
                  className="btn-brand flex-1 text-sm disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" /> Dibujarla
                </button>
              </div>
            </div>
          ) : null}
        />

        {/* Escenas */}
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className="label">Escenas</span>
            <label className="btn-brand ml-auto cursor-pointer">
              <Plus className="h-4 w-4" /> Añadir imágenes
              <input type="file" accept="image/*" multiple className="hidden" onChange={addImages} />
            </label>
          </div>

          {/* Soltar en cualquier sitio suelta también el asa: si no, un clic en
              el asa que no acaba en arrastre dejaría la escena "agarrada". */}
          <div className="mt-3 space-y-3" onPointerUp={() => setAgarre(null)}>
            {project.scenes.map((sc, si) => (
              <div
                key={sc.id}
                draggable={agarre === sc.id && !locks[sc.id]}
                onDragStart={() => setDragScene(sc.id)}
                onDragEnd={() => { setDragScene(null); setAgarre(null); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragScene && dragScene !== sc.id && !locks[dragScene]) mut((p) => reorderScene(p, dragScene, si));
                  setDragScene(null);
                }}
                className={`rounded-xl border p-3 ${openScene === sc.id ? "border-brand bg-brand/5" : "border-border"} ${dragScene === sc.id ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {/* Único sitio desde el que se arrastra la escena. */}
                  <span
                    onPointerDown={() => { if (!locks[sc.id]) setAgarre(sc.id); }}
                    onPointerUp={() => setAgarre(null)}
                    title="Arrastra desde aquí para cambiar el orden"
                    className="shrink-0 cursor-grab text-muted"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
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
                  {/* En móvil los controles bajan a su propia línea: en una sola
                      no caben y se salían de la tarjeta. */}
                  <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-3">
                    <button
                      onClick={() => playScene(sc, si)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/60 text-brand hover:bg-brand/10"
                      title="Ver solo esta escena"
                    >
                      {section?.sceneId === sc.id && playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button onClick={() => addShot(sc)} disabled={locks[sc.id]} className="btn-ghost shrink-0 text-xs disabled:opacity-40" title="Añadir sub-escena">
                      <Plus className="h-3.5 w-3.5 text-accent" /> Toma
                    </button>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <button onClick={() => mut((p) => moveScene(p, sc.id, -1))} disabled={locks[sc.id]} title="Subir escena" className="text-muted hover:text-fg disabled:opacity-40"><ChevronUp className="h-4 w-4" /></button>
                      <button onClick={() => mut((p) => moveScene(p, sc.id, 1))} disabled={locks[sc.id]} title="Bajar escena" className="text-muted hover:text-fg disabled:opacity-40"><ChevronDown className="h-4 w-4" /></button>
                    </div>
                    <button
                      onClick={() => setMovingScene(movingScene?.id === sc.id ? null : { id: sc.id, value: String(si + 1) })}
                      disabled={locks[sc.id]}
                      title="Colocar en una posición concreta"
                      className="shrink-0 text-muted hover:text-fg disabled:opacity-40"
                    ><MoveVertical className="h-4 w-4" /></button>
                    <button onClick={() => delScene(sc, si)} disabled={locks[sc.id]} title="Borrar escena" className="shrink-0 text-muted hover:text-danger disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                    <LockToggle
                      checked={!!locks[sc.id]}
                      onChange={(v) => { setLock(sc.id, v); if (v && openScene === sc.id) setOpenScene(null); }}
                      title={locks[sc.id] ? "Escena bloqueada: desactiva para poder abrirla" : "Bloquear esta escena entera"}
                    />
                    <button
                      onClick={() => setOpenScene(openScene === sc.id ? null : sc.id)}
                      disabled={locks[sc.id]}
                      className="btn-ghost ml-auto shrink-0 text-xs disabled:opacity-40"
                    >
                      <Layers className="h-3.5 w-3.5" /> {openScene === sc.id ? "Cerrar" : "Editar"}
                    </button>
                  </div>
                </div>

                {locks[sc.id] && (
                  <p className="mt-2 rounded-lg border border-gold/50 bg-gold/10 px-2 py-1.5 text-xs text-gold">
                    Escena bloqueada para no cambiarla sin querer. Quita el candado para poder
                    abrirla y editarla.
                  </p>
                )}

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
                    {/* Imagen: se puede cambiar siempre (IA o archivo), no solo si falta. */}
                    <div className="rounded-lg border border-border p-2">
                      <span className="text-[11px] font-medium text-muted">Imagen de la escena</span>
                      <textarea
                        className="input mt-1.5 h-20 w-full text-sm"
                        value={sc.prompt ?? ""}
                        placeholder="Cómo es esta imagen: qué se ve, luz, ambiente. Sin letras en la foto."
                        aria-label={`Descripción de la escena ${si + 1}`}
                        onChange={(e) => mut((p) => ({
                          ...p,
                          scenes: p.scenes.map((s) =>
                            s.id === sc.id ? { ...s, prompt: e.target.value } : s,
                          ),
                        }))}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {iaImagen && (
                          <>
                            <button
                              type="button"
                              className="btn-brand text-xs"
                              disabled={!!reponiendo || (sc.prompt ?? "").trim().length < 4}
                              onClick={() => setDibujo({
                                falta: {
                                  id: sc.imageId,
                                  tipo: "escena",
                                  donde: [`Escena ${si + 1}`],
                                  sceneIds: [sc.id],
                                },
                                texto: sc.prompt ?? "",
                                ancla: sc.id,
                              })}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {sc.imageId ? "Redibujar con IA" : "Dibujar con IA"}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-xs disabled:opacity-40"
                              disabled={rehaciendo === sc.imageId || (sc.prompt ?? "").trim().length < 4}
                              onClick={async () => {
                                const texto = sc.prompt ?? "";
                                setRehaciendo(sc.imageId);
                                try {
                                  const r = await fetch("/api/story/ia/rehacer", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      que: "imagen",
                                      actual: texto,
                                      contexto: { titulo: name },
                                    }),
                                  });
                                  const j = await r.json();
                                  if (!r.ok) throw new Error(j.error || "Error");
                                  mut((p) => ({
                                    ...p,
                                    scenes: p.scenes.map((s) =>
                                      s.id === sc.id ? { ...s, prompt: j.texto } : s,
                                    ),
                                  }));
                                  setStatus(j.igual ? "Ha devuelto lo mismo." : "Otra descripción ✓ · revísala y redibuja");
                                } catch (e: any) {
                                  setStatus("No se pudo rehacer: " + (e?.message ?? ""));
                                } finally {
                                  setRehaciendo(null);
                                }
                              }}
                            >
                              {rehaciendo === sc.imageId
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5 text-accent" />}
                              Otra descripción
                            </button>
                          </>
                        )}
                        <label className="btn-ghost cursor-pointer text-xs">
                          <ImageIcon className="h-3.5 w-3.5 text-accent" /> Elegir archivo
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              await reponer(
                                {
                                  id: sc.imageId,
                                  tipo: "escena",
                                  donde: [`Escena ${si + 1}`],
                                  sceneIds: [sc.id],
                                },
                                f,
                              );
                            }}
                          />
                        </label>
                      </div>
                      {dibujo?.ancla === sc.id && (
                        <div className="mt-2 rounded-lg border border-accent/40 bg-surface p-2.5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                            <span className="label text-xs">Dibujar {dibujo.falta.donde.join(" · ")}</span>
                            <button type="button" onClick={() => setDibujo(null)} className="ml-auto text-muted hover:text-fg">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <textarea
                            className="input mt-2 h-24 w-full text-sm"
                            value={dibujo.texto}
                            onChange={(e) => setDibujo((d) => (d ? { ...d, texto: e.target.value } : d))}
                            aria-label="Cómo es esta imagen"
                            placeholder="Qué se ve, encuadre, luz y ambiente. Sin letras dentro de la imagen."
                          />
                          <p className="mt-1 text-[11px] text-muted">
                            Se dibuja en {project.aspect}, el formato del video. Repite la descripción de los
                            personajes tal cual en cada escena: es lo único que hace que se parezcan entre sí.
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void rehacerDescripcion(dibujo.falta, dibujo.texto)}
                              disabled={rehaciendo === dibujo.falta.id || dibujo.texto.trim().length < 4}
                              className="btn-ghost flex-1 text-xs disabled:opacity-40"
                            >
                              {rehaciendo === dibujo.falta.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <RefreshCw className="h-4 w-4 text-accent" />}
                              Otra descripción
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const d = dibujo;
                                setDibujo(null);
                                await dibujarUna(d.falta, d.texto);
                              }}
                              disabled={reponiendo === dibujo.falta.id || dibujo.texto.trim().length < 4}
                              className="btn-brand flex-1 text-sm disabled:opacity-40"
                            >
                              <Sparkles className="h-4 w-4" /> Dibujarla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Efectos de la FOTO: una vez, encima de las tomas. */}
                    <div className="rounded-lg border border-accent/30 bg-accent/5 p-2">
                      <VfxEditor
                        titulo="Efectos de la escena"
                        pista="Portal, fuego, humo… compartidos por todas las tomas de esta foto. Si los cambias aquí, el cambio se ve en todas; en cada toma puedes apagarlos si no hacen falta."
                        vfx={sc.vfx ?? []}
                        dur={Math.max(2, ...sc.shots.map((s) => shotDur(s)))}
                        seleccionado={selVfx}
                        onChange={(v) => updSceneVfx(sc.id, v)}
                        onSelect={(id) => {
                          setSelVfx(id);
                          setBorrandoVfx(false);
                          // Hace falta una toma activa para colocar sobre la previsualización.
                          // No se busca el inicio ni se pausa: al ajustar se ve en vivo.
                          const toma = sc.shots.find((s) => s.id === selShot) ?? sc.shots[0];
                          if (toma) setSelShot(toma.id);
                        }}
                      />
                    </div>

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
                        locked={!!locks[sh.id] || !!locks[sc.id]}
                        lockedByScene={!!locks[sc.id]}
                        onToggleLock={(v) => setLock(sh.id, v)}
                        onChange={(next) => updShot(sc.id, sh.id, next)}
                        onDelete={() => delShot(sc, sh.id, hi)}
                        onDuplicate={() => {
                          mut((p) => duplicateShot(p, sc.id, sh.id));
                          setStatus("Toma duplicada ✓ · la copia va justo detrás");
                        }}
                        onMove={(d) => mut((p) => moveShot(p, sc.id, sh.id, d))}
                        onToggle={() => (selShot === sh.id ? setSelShot(null) : focusShot(sh.id))}
                        prevTo={frameAnterior(sh.id)}
                        onPlay={() => playShot(sc, sh.id, si, hi)}
                        onPreview={() => previewShot(sh.id)}
                        onGenVoice={(d) => genVoice(sc.id, sh.id, d)}
                        onRehacerTexto={iaTexto ? (d) => void rehacerTexto(sc.id, sh.id, d) : undefined}
                        rehaciendo={rehaciendo}
                        onAddSfx={(e) => addSfx(sc.id, sh, e)}
                        onAddSticker={(e) => addSticker(sc.id, sh, e)}
                        onAddOverlaySound={(id, e) => addOverlaySound(sc.id, sh, id, e)}
                        selectedVfx={selVfx}
                        sceneVfx={sc.vfx ?? []}
                        onOmitirEfectoEscena={(vfxId, modo) => {
                          mut((p) => ({
                            ...p,
                            scenes: p.scenes.map((s) => {
                              if (s.id !== sc.id) return s;
                              const i = s.shots.findIndex((x) => x.id === sh.id);
                              if (i < 0) return s;
                              return {
                                ...s,
                                shots: s.shots.map((toma, ti) => {
                                  if (modo === "esta" && ti !== i) return toma;
                                  if (modo === "adelante" && ti < i) return toma;
                                  const omit = new Set(toma.omitirVfxEscena ?? []);
                                  if (modo === "esta") {
                                    if (omit.has(vfxId)) omit.delete(vfxId);
                                    else omit.add(vfxId);
                                  } else {
                                    omit.add(vfxId);
                                  }
                                  return { ...toma, omitirVfxEscena: [...omit] };
                                }),
                              };
                            }),
                          }));
                        }}
                        onSoloEnEstaToma={(vfxId) => {
                          mut((p) => ({
                            ...p,
                            scenes: p.scenes.map((s) => {
                              if (s.id !== sc.id) return s;
                              const capa = (s.vfx ?? []).find((v) => v.id === vfxId);
                              if (!capa) return s;
                              const copia = {
                                ...capa,
                                id: nanoid(6),
                                params: { ...capa.params },
                                nodes: capa.nodes.map((n) => ({ ...n })),
                              };
                              return {
                                ...s,
                                vfx: (s.vfx ?? []).filter((v) => v.id !== vfxId),
                                shots: s.shots.map((toma) =>
                                  toma.id !== sh.id
                                    ? {
                                        ...toma,
                                        omitirVfxEscena: (toma.omitirVfxEscena ?? []).filter((id) => id !== vfxId),
                                      }
                                    : {
                                        ...toma,
                                        vfx: [...(toma.vfx ?? []), copia],
                                        omitirVfxEscena: (toma.omitirVfxEscena ?? []).filter((id) => id !== vfxId),
                                      },
                                ),
                              };
                            }),
                          }));
                          setStatus("Efecto pasado solo a esta toma ✓");
                        }}
                        onSelectVfx={(id) => {
                          setSelShot(sh.id);
                          setSelVfx(id);
                          setBorrandoVfx(false);
                          // Sin seek: pausaba y volvía al inicio de la toma.
                        }}
                        onSelectOverlay={(id) => {
                          setSelShot(sh.id);
                          setSelOverlay(id);
                          if (id) irAlSticker(sh, id);
                        }}
                        vocesIa={vozOpenAi}
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
          <input className="input mt-2" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Nombre del proyecto" />
          {/* A qué serie pertenece este capítulo. Sin serie también vale: un
              video suelto no tiene por qué estar en ninguna. */}
          <label className="mt-2 block">
            <span className="text-xs text-muted">Serie</span>
            <select
              className="input mt-1 w-full text-sm"
              value={seriesId ?? ""}
              title="Asigna este capítulo a una serie, muévelo a otra, o déjalo suelto"
              onChange={async (e) => {
                const v = e.target.value;
                if (v === "__nueva") {
                  const nom = prompt("Nombre de la serie nueva");
                  if (!nom?.trim()) return;
                  const r = await fetch("/api/story/series", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: nom.trim(), data: { description: "", style: "", model: "", seed: "", notes: "" } }),
                  });
                  const j = await r.json();
                  if (r.ok) { await cargarSeries(); setSeriesId(j.serie.id); setDirty(true); }
                  return;
                }
                setSeriesId(v || null);
                setDirty(true);
              }}
            >
              <option value="">Sin serie (capítulo suelto)</option>
              {series.map((x) => (
                <option key={x.id} value={x.id}>{x.name} · {x.capitulos} cap.</option>
              ))}
              <option value="__nueva">+ Serie nueva…</option>
            </select>
            <p className="mt-1 text-[11px] text-muted">
              Si te equivocaste: cámbialo aquí o desde la lista de inicio. Al guardar, el capítulo queda en esa serie.
            </p>
          </label>
          <div className="mt-2 flex gap-2">
            <button onClick={save} disabled={busy === "save"} className="btn-brand flex-1"><Save className="h-4 w-4" /> Guardar</button>
            <button onClick={newProject} className="btn-ghost"><Plus className="h-4 w-4" /> Nuevo</button>
          </div>
          {/* La lista de proyectos ya no vive aquí: está en la pantalla de
              inicio, agrupada por serie. */}
          {creando && (
            <div className="mt-3 rounded-xl border border-brand/60 bg-brand/5 p-2">
              <p className="text-xs font-medium text-fg">¿Cómo será este video?</p>
              <p className="mt-0.5 text-[11px] text-muted">
                Se elige ahora porque los encuadres se hacen para esta forma.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => crearProyecto(a.id)}
                    title={`${a.label} · ${a.corto} · ${a.w}×${a.h}`}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border px-1 py-2 text-[10px] leading-tight text-muted hover:border-brand hover:bg-brand/10 hover:text-brand"
                  >
                    <FormaVideo ratio={a.ratio} />
                    <span className="font-medium">{a.id}</span>
                    <span className="text-[9px]">{a.corto.split(",")[0]}</span>
                  </button>
                ))}
              </div>
              <button // Si se echa atrás sin nada abierto, se vuelve al inicio en vez de
                // dejarle un editor vacío delante.
                onClick={() => {
                  setCreando(false);
                  if (!projectId && !projRef.current.scenes.length) {
                    setVista("inicio");
                    syncStoryUrl({ serie: seriesId });
                  }
                }} className="btn-ghost mt-2 w-full text-[11px]">
                Cancelar
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
            <FormaVideo ratio={forma.ratio} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
              <strong className="text-fg">{forma.label}</strong> · {forma.w}×{forma.h}
            </span>
          </div>
          {/* El formato no se cambia sobre la marcha: reencuadrar todas las tomas
              estropearía lo ya hecho. Se saca una copia aparte. */}
          {projectId && (
            <div className="mt-2">
              <span className="text-[11px] text-muted">Sacar una copia en otro formato</span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {ASPECTS.filter((a) => a.id !== project.aspect).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => copiarEnFormato(a.id)}
                    disabled={busy === "copy" || exporting}
                    title={`Crear una copia en ${a.label} (${a.w}×${a.h}). El proyecto actual no se toca.`}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-1 py-1.5 text-[11px] text-muted hover:border-brand hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                  >
                    <FormaVideo ratio={a.ratio} />
                    {a.id}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {busy === "copy"
                  ? "Creando la copia…"
                  : "Se crea un proyecto aparte con ese formato. Este se queda como está."}
              </p>
            </div>
          )}

          <p className="mt-2 text-[11px] text-muted">
            Se guardan los textos y ajustes. Las imágenes/audios se quedan en este navegador.
          </p>
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-2">
            <span className="label">Voz (narración)</span>
            {vozOpenAi && esAdminIa && (
              <button onClick={() => setVerModelosVoz((v) => !v)} className="btn-ghost ml-auto text-[11px]">
                <Settings2 className="h-3.5 w-3.5 text-accent" /> Modelo
              </button>
            )}
          </div>
          {vozOpenAi && esAdminIa && (verModelosVoz || vozRota) && (
            <div className="mt-2 space-y-2">
              {vozRota && (
                <p className="flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{vozRota}</span>
                </p>
              )}
              <ModelosIa
                tareas={["voz"]}
                titulo="Modelo para narrar"
                onGuardado={() => { setVozRota(null); setStatus("Modelo cambiado ✓ · vuelve a darle a narrar"); }}
              />
            </div>
          )}
          {vozRota && !esAdminIa && (
            <p className="mt-2 text-[11px] text-danger">{vozRota}</p>
          )}
          {!vozOpenAi && (
            <label className="mt-2 block space-y-1 text-sm">
              <span className="text-xs text-muted">Idioma / voz</span>
              <select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
          )}
          <button onClick={genAllVoices} className="btn-ghost mt-2 w-full text-sm">
            <Mic className="h-4 w-4 text-accent" /> Generar la voz de los diálogos que falten
          </button>
          {marcados > 0 && (
            <button onClick={genStaleVoices} className="btn-ghost mt-2 w-full text-sm">
              <Mic className="h-4 w-4 text-gold" /> Regenerar {marcados === 1 ? "la voz que cambió" : `las ${marcados} voces que cambiaron`}
            </button>
          )}
          {pendientes > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendientes === 1 ? "1 voz generándose" : `${pendientes} voces en cola`} · puedes seguir editando
            </p>
          )}
          <div className="mt-3">
            <Slider
              label="Volumen de la narración" value={project.narrationVolume}
              min={0} max={1} step={0.01}
              onChange={(v) => mut((p) => ({ ...p, narrationVolume: v }))}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Voz IA gratis en tu navegador (la 1ª vez descarga el modelo, ~30–60&nbsp;MB). Suena algo
            robótica; es temporal.
          </p>
        </div>

        <div className="card p-3">
          <span className="label">Música y sonido global</span>
          {/* La biblioteca primero: es lo que resuelve el caso normal sin que
              nadie tenga que buscar un archivo. Subir la tuya sigue igual. */}
          <button onClick={() => setVerBiblioteca(true)} className="btn-brand mt-2 w-full text-xs">
            <Music className="h-4 w-4" /> Elegir música de la biblioteca
          </button>
          <div className="mt-2 flex gap-2">
            <label className="btn-ghost flex-1 cursor-pointer text-xs"><Music className="h-4 w-4 text-accent" /> Subir música
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => addAudioLayer("music", e)} />
            </label>
            <label className="btn-ghost flex-1 cursor-pointer text-xs"><Volume2 className="h-4 w-4 text-accent" /> Efecto
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => addAudioLayer("sfx", e)} />
            </label>
          </div>
          {verBiblioteca && (
            <BibliotecaMusica onElegir={addPistaBiblioteca} onCerrar={() => setVerBiblioteca(false)} />
          )}
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
                  <Slider label="Volumen" value={l.volume} min={0} max={1} step={0.01}
                    onChange={(v) => updLayer(l.id, { volume: v })}
                    format={(v) => `${Math.round(v * 100)}%`} />
                  <NumberInput
                    label="Inicio (s)"
                    value={l.startSec}
                    onChange={(v) => updLayer(l.id, { startSec: v })}
                    min={0} max={3600} step={0.5}
                  />
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

        {/* Llevarse el montaje a otro equipo. Los archivos no caben en un JSON,
            así que se reponen al abrirlo con el panel de arriba. */}
        <div className="card p-3">
          <span className="label">El proyecto en un archivo</span>
          <div className="mt-2 flex gap-2">
            <button onClick={exportProject} className="btn-ghost flex-1 text-xs" disabled={!project.scenes.length}>
              <Download className="h-4 w-4 text-accent" /> Exportar
            </button>
            <label className="btn-ghost flex-1 cursor-pointer justify-center text-xs">
              <FileJson className="h-4 w-4 text-accent" /> Importar
              <input type="file" accept="application/json,.json" className="hidden" onChange={importProject} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Guarda el montaje entero —escenas, encuadres, tiempos, voces, stickers y efectos— en un
            JSON, con el catálogo de efectos dentro. Las imágenes y los audios no caben ahí, así que
            al importarlo en otro equipo salen como faltantes y se reponen una a una con «Buscar».
          </p>
          {/* Con los archivos dentro: es el respaldo de verdad. */}
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <button onClick={exportPaquete} disabled={busy === "zip" || !project.scenes.length}
              className="btn-brand flex-1 text-xs disabled:opacity-40">
              <Download className="h-4 w-4" /> Todo (.zip)
            </button>
            <label className="btn-ghost flex-1 cursor-pointer justify-center text-xs">
              <FileJson className="h-4 w-4 text-accent" /> Importar .zip
              <input type="file" accept=".zip,application/zip" className="hidden" onChange={importPaquete} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            El montaje <strong>y sus archivos</strong> —imágenes, músicas, sonidos y las voces ya
            generadas— en un solo archivo. Al importarlo se colocan solos: no hay que reponer nada
            ni volver a generar las voces. Es lo que conviene guardar como copia.
          </p>

          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <button onClick={exportSaga} disabled={busy === "saga"} className="btn-ghost flex-1 text-xs disabled:opacity-40">
              <Download className="h-4 w-4 text-accent" /> Toda la serie
            </button>
            <label className="btn-ghost flex-1 cursor-pointer justify-center text-xs">
              <FileJson className="h-4 w-4 text-accent" /> Importar serie
              <input type="file" accept="application/json,.json" className="hidden" onChange={importSaga} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            La serie entera —todos sus capítulos y sus personajes— en un solo archivo. Sin serie
            seleccionada, se lleva lo que no pertenece a ninguna.
          </p>
        </div>

        {/* Sacar los textos para corregirlos fuera (por ejemplo con una IA) y
            volver a meterlos. Solo viajan los textos: nada más se toca. */}
        <div className="card p-3">
          <span className="label">Textos de la narración</span>
          <div className="mt-2 flex gap-2">
            <button onClick={exportTexts} className="btn-ghost flex-1 text-xs">
              <Download className="h-4 w-4 text-accent" /> Exportar
            </button>
            <label className="btn-ghost flex-1 cursor-pointer justify-center text-xs">
              <FileJson className="h-4 w-4 text-accent" /> Importar
              <input type="file" accept="application/json,.json" className="hidden" onChange={importTexts} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Saca todos los diálogos en un JSON para corregirlos fuera (por ejemplo con una IA) y
            vuelve a meterlos. Los que cambien se marcan y luego se regenera solo su voz.
          </p>
        </div>

        {/* Unir con otros videos: la careta va en su propio proyecto, se exporta
            y aquí se pega delante (o detrás) para que salga un solo capítulo. */}
        <div className="card p-3">
          <span className="label">Unir con otros videos</span>
          <div className="mt-2 space-y-2">
            {([["intro", "Al inicio"], ["outro", "Al final"]] as const).map(([donde, etiqueta]) => {
              const clip = project[donde];
              return (
                <div key={donde} className="rounded-lg border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className="chip shrink-0 bg-brand/15 text-brand">{etiqueta}</span>
                    {clip ? (
                      <>
                        <span className="min-w-0 flex-1 truncate text-xs">{clip.name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">{fmt(clip.dur)}</span>
                        <button
                          onClick={() => mut((p) => ({ ...p, [donde]: null }))}
                          className="shrink-0 text-muted hover:text-danger"
                          title={`Quitar el video ${etiqueta.toLowerCase()}`}
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <label className="btn-ghost flex-1 cursor-pointer justify-center text-xs">
                        <Film className="h-3.5 w-3.5 text-accent" /> Elegir video
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => addClip(donde, e)} />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Se pegan al exportar y sale un único archivo. Haz la careta en otro proyecto, expórtala y
            súbela aquí.
          </p>
        </div>

        <div className="card p-3">
          <span className="label">Exportar</span>
          <p className="mt-1 text-[11px] text-muted">
            Saldrá en <strong className="text-fg">{forma.label}</strong> ({forma.w}×{forma.h}).
            El formato se cambia arriba, en Proyecto.
          </p>
          <div className="mt-2 flex gap-2">
            <select value={format} onChange={(e) => setFormat(e.target.value as any)} disabled={exporting} className="input">
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
              <option value="gif">GIF</option>
              <option value="mp3">MP3 (audio)</option>
            </select>
            <button
              className="btn-brand"
              onClick={doExport}
              disabled={exporting || (!project.scenes.length && !project.intro && !project.outro)}
            >
              <Download className="h-4 w-4" /> {exporting ? `${Math.round(progress * 100)}%` : "Exportar"}
            </button>
          </div>
          {(project.intro || project.outro) && (
            <p className="mt-2 text-[11px] text-muted">
              Durará <strong className="tabular-nums text-fg">{fmt(durFinal)}</strong>:
              {project.intro ? ` careta ${fmt(project.intro.dur)} +` : ""} historia {fmt(dur)}
              {project.outro ? ` + cierre ${fmt(project.outro.dur)}` : ""}.
            </p>
          )}
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
          {/* Aquí también se pueden colocar los sitios: es el motivo de que exista
              esta miniatura, no tener que subir al reproductor de arriba. */}
          {curVfx && (
            <VfxTools
              layer={curVfx} activo={colocando} borrando={borrandoVfx}
              onToggle={setColocando} onBorrando={setBorrandoVfx}
              onChange={(nodes) => updVfxNodes(curVfx.id, nodes)}
            />
          )}
          <div
            ref={floatRef}
            className="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: `${forma.w} / ${forma.h}`, maxWidth: `calc(46vh * ${forma.ratio})` }}
          >
            {curVfx && colocando && (
              <VfxCanvas
                layer={curVfx} borrando={borrandoVfx}
                onChange={(nodes) => updVfxNodes(curVfx.id, nodes)}
                onSettled={() => engineRef.current?.resetVfx()}
              />
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 px-1">
            <button onClick={togglePlay} className="btn-brand py-1">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleLoop}
              title={loopSection ? "Repitiendo sin parar: pulsa para que se pare al final" : "Repetir sin parar (vista previa)"}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                loopSection ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
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
    // Se deja salir del cuadro ENTERO por los cuatro lados: a −tamaño ya no se
    // ve nada, y así se puede dejar asomando solo una esquina o hacerlo entrar
    // y salir de la escena. Con uno más grande que el video hace falta de sobra.
    if (d.mode === "move") {
      emit(cl(d.ox + dx, -Math.max(1, d.ow), 1), cl(d.oy + dy, -Math.max(1, d.oh), 1), d.ow, d.oh);
    }
    else {
      const w = cl(d.ow + dx, 0.03, 2);
      emit(d.ox, d.oy, w, cl(d.oh + dy, 0.03, 2));
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
