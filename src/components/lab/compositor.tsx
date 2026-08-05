"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Play, Pause, Crosshair, Download, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  Package, FolderOpen, Loader2, ListPlus, ListOrdered,
} from "lucide-react";
import { bajar } from "@/lib/lab/exportar";
import { bajarMontajeZip, leerMontajeZip } from "@/lib/lab/montaje-zip";
import {
  ANIM_OPCIONES, MOV_COLA, vistaAnim, estadoNeutro, clonarEstado, pasoPorDefecto,
  planificarCola, interpolarTramo, escalaPerspectiva,
  type AnimParalaje, type MovCola, type PasoSecuencia, type VistaCamara, type EstadoCamara,
  type DesdePaso, type FadeAccion, type FadeCapa, type Tramo,
} from "@/lib/lab/anim-paralaje";

// Paso 2: apilar las capas ya generadas y moverlas con profundidad.
//
// La primera imagen manda: fija el tamaño del lienzo y se toma como fondo
// opaco. Las siguientes deben ser PNG con transparencia. Cada una lleva su
// profundidad, y al mover la cámara cada capa se desplaza en proporción: el
// fondo casi nada, el primer plano mucho. Eso es lo que da la sensación de que
// la escena tiene fondo, con imágenes que son planas.

interface CapaImg {
  id: string;
  nombre: string;
  img: HTMLImageElement;
  depth: number;
  visible: boolean;
  escala: number;
  opacidad: number;
  via?: "transparente" | "croma" | "opaca";
  vacio?: number;
}

export interface Semilla {
  nombre: string;
  url: string;
  via?: CapaImg["via"];
  vacio?: number;
}

let contador = 0;
let pasoSeq = 0;

export function Compositor({ semilla }: { semilla?: Semilla[] }) {
  const [capas, setCapas] = useState<CapaImg[]>([]);
  const [moviendo, setMoviendo] = useState(true);
  const [fuerza, setFuerza] = useState(55);
  const [anim, setAnim] = useState<AnimParalaje>("suave");
  // Borrador del paso a añadir a la cola
  const [borrador, setBorrador] = useState(() => pasoPorDefecto({ id: "borrador", mov: "der", durMs: 4000, distancia: 55 }));
  const [cola, setCola] = useState<PasoSecuencia[]>([]);
  const [enSecuencia, setEnSecuencia] = useState(false);
  const [pasoActivo, setPasoActivo] = useState(0);
  const [repetirCola, setRepetirCola] = useState(false);
  /** Qué paso de la cola tiene abiertos sus ajustes. Solo uno a la vez. */
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("Carga primero el fondo y luego las capas PNG con transparencia.");
  const [busyZip, setBusyZip] = useState<"bajar" | "subir" | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const raton = useRef({ x: 0, y: 0 });
  const encima = useRef(false);
  const tam = useRef({ w: 1920, h: 1080 });
  const animRef = useRef(anim);
  const fuerzaRef = useRef(fuerza);
  const moviendoRef = useRef(moviendo);
  const colaRef = useRef(cola);
  const capasRef = useRef(capas);
  const enSecuenciaRef = useRef(enSecuencia);
  const pasoActivoRef = useRef(pasoActivo);
  const repetirRef = useRef(repetirCola);
  const pasoMsRef = useRef(0);
  const ultimoFrameRef = useRef<number | null>(null);
  /** Pose acumulada (entre pasos y al terminar la cola). */
  const estadoRef = useRef<EstadoCamara>(estadoNeutro());
  /**
   * La cola entera planificada de antemano. Hace falta completa: para no
   * frenar en cada juntura, un tramo necesita saber a dónde va el siguiente.
   */
  const planRef = useRef<Tramo[]>([]);
  /** Tras una secuencia: dibujar la pose final en vez del idle. */
  const retenerPoseRef = useRef(false);

  animRef.current = anim;
  fuerzaRef.current = fuerza;
  moviendoRef.current = moviendo;
  colaRef.current = cola;
  capasRef.current = capas;
  enSecuenciaRef.current = enSecuencia;
  pasoActivoRef.current = pasoActivo;
  repetirRef.current = repetirCola;

  function metaCapas() {
    return capasRef.current.map((c) => ({ id: c.id, depth: c.depth }));
  }

  function planificar() {
    planRef.current = planificarCola(colaRef.current, fuerzaRef.current, metaCapas());
    pasoMsRef.current = 0;
  }

  async function meter(archivos: FileList | null) {
    if (!archivos?.length) return;
    const nuevas: CapaImg[] = [];
    for (const f of Array.from(archivos)) {
      const url = URL.createObjectURL(f);
      try {
        const img = await cargar(url);
        nuevas.push(hacerCapa(f.name.replace(/\.[a-z0-9]+$/i, ""), img));
      } catch { setAviso(`No se pudo leer «${f.name}».`); }
    }
    if (!nuevas.length) return;
    setCapas((prev) => {
      const todas = [...prev, ...nuevas];
      if (!prev.length) tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      return repartirProfundidad(todas);
    });
    setAviso(`${nuevas.length} imagen${nuevas.length > 1 ? "es" : ""} añadida${nuevas.length > 1 ? "s" : ""}. Ajusta la profundidad de cada una.`);
  }

  async function exportarZip() {
    if (!capas.length || busyZip) return;
    setBusyZip("bajar");
    try {
      await bajarMontajeZip({
        width: tam.current.w,
        height: tam.current.h,
        capas: capas.map((c) => ({
          nombre: c.nombre, depth: c.depth, escala: c.escala, opacidad: c.opacidad,
          via: c.via, vacio: c.vacio, img: c.img,
        })),
      });
      setAviso(`ZIP con ${capas.length} capas y montaje.json listo.`);
    } catch (e) {
      setAviso((e as Error).message || "No se pudo crear el ZIP.");
    } finally {
      setBusyZip(null);
    }
  }

  async function importarZip(file: File | null) {
    if (!file || busyZip) return;
    setBusyZip("subir");
    try {
      const pack = await leerMontajeZip(file);
      const nuevas: CapaImg[] = [];
      for (const c of pack.capas) {
        const img = await cargar(c.url);
        nuevas.push({
          ...hacerCapa(c.nombre, img),
          depth: c.depth, escala: c.escala, opacidad: c.opacidad, via: c.via, vacio: c.vacio,
        });
      }
      if (!nuevas.length) throw new Error("El ZIP no trae capas.");
      tam.current = {
        w: pack.width || nuevas[0].img.naturalWidth,
        h: pack.height || nuevas[0].img.naturalHeight,
      };
      if (!pack.width || !pack.height) {
        tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      }
      setCapas(nuevas);
      setAviso(`Importadas ${nuevas.length} capas del ZIP.`);
    } catch (e) {
      setAviso((e as Error).message || "No se pudo importar el ZIP.");
    } finally {
      setBusyZip(null);
    }
  }

  useEffect(() => {
    if (!semilla?.length) return;
    let vivo = true;
    (async () => {
      const nuevas: CapaImg[] = [];
      for (const s of semilla) {
        try {
          nuevas.push({ ...hacerCapa(s.nombre, await cargar(s.url)), via: s.via, vacio: s.vacio });
        } catch {}
      }
      if (!vivo || !nuevas.length) return;
      tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      setCapas(repartirProfundidad(nuevas));
      setAviso("Capas del mapa cargadas. Es el mapa, no la imagen final: sirve para ver el movimiento.");
    })();
    return () => { vivo = false; };
  }, [semilla]);

  // UNA sola vez, y con [] a propósito.
  //
  // Antes este efecto no llevaba lista de dependencias, así que se rearmaba en
  // CADA render: cancelaba el bucle y ponía el reloj a cero. Y como al cambiar
  // de paso se hace setPasoActivo, cada juntura provocaba un render, y ese
  // render dejaba dt = 0 en el fotograma siguiente: la misma imagen pintada dos
  // veces. Ese era el tirón que se veía al encadenar efectos, y no venía de la
  // animación sino de aquí. Todo lo que usa el bucle vive en refs, así que
  // montarlo una vez es además lo correcto.
  const pintarRef = useRef(pintar);
  pintarRef.current = pintar;
  useEffect(() => {
    let vivo = true;
    let id = 0;
    const paso = (ahora: number) => {
      if (!vivo) return;
      const prev = ultimoFrameRef.current;
      ultimoFrameRef.current = ahora;
      const dt = prev == null ? 0 : Math.min(64, ahora - prev);
      pintarRef.current(dt);
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => { vivo = false; cancelAnimationFrame(id); ultimoFrameRef.current = null; };
  }, []);

  function vistaDesdeEstado(e: EstadoCamara): VistaCamara {
    return {
      ox: e.ox, oy: e.oy, zoom: e.zoom,
      zoomCapa: (depth) => escalaPerspectiva(e.avance, depth),
      panCapa: (depth) => depth * escalaPerspectiva(e.avance, depth),
      alphaCapa: (_d, id) => (id && typeof e.alpha[id] === "number" ? e.alpha[id] : 1),
      t: 1, fin: true,
    };
  }

  function pintar(dt: number) {
    const cv = canvas.current;
    if (!cv) return;
    const ancho = Math.max(320, Math.min(1200, caja.current?.clientWidth ?? 900));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(ancho * dpr);
    const h = Math.round((w * tam.current.h) / tam.current.w);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#05070d";
    c.fillRect(0, 0, w, h);

    const k = (fuerzaRef.current / 100) * 0.08;
    let vista: VistaCamara = {
      ox: 0, oy: 0, zoom: 1,
      zoomCapa: () => 1, panCapa: (d) => d, alphaCapa: () => 1, t: 0, fin: false,
    };

    if (enSecuenciaRef.current && planRef.current.length) {
      // El reloj corre y DESPUÉS se mira en qué tramo cae, consumiendo los que
      // ya se hayan pasado. Antes se pintaba el final clavado de un tramo y
      // luego el principio del siguiente: dos fotogramas en el mismo sitio, o
      // sea un tropiezo de 16 ms en cada juntura, justo lo que se veía como
      // «se pausa». Ahora el sobrante cruza la juntura y no se pinta dos veces.
      pasoMsRef.current += dt;
      let idx = pasoActivoRef.current;
      let acabo = false;
      while (idx < planRef.current.length && pasoMsRef.current >= planRef.current[idx].durMs) {
        pasoMsRef.current -= planRef.current[idx].durMs;
        estadoRef.current = clonarEstado(planRef.current[idx].destino);
        idx++;
        if (idx >= planRef.current.length) {
          if (repetirRef.current) {
            idx = 0;
            estadoRef.current = estadoNeutro();
          } else { acabo = true; }
          break;
        }
      }
      if (acabo) {
        enSecuenciaRef.current = false;
        setEnSecuencia(false);
        retenerPoseRef.current = true;
        pasoMsRef.current = 0;
        setAviso("Secuencia terminada — la pose se conserva. «Centrar» la reinicia.");
        vista = vistaDesdeEstado(estadoRef.current);
      } else {
        if (idx !== pasoActivoRef.current) { pasoActivoRef.current = idx; setPasoActivo(idx); }
        const { vista: v, estado } = interpolarTramo(planRef.current[idx], pasoMsRef.current, metaCapas());
        vista = v;
        estadoRef.current = estado;
      }
    } else if (retenerPoseRef.current) {
      vista = vistaDesdeEstado(estadoRef.current);
    } else if (moviendoRef.current) {
      if (encima.current) {
        vista = {
          ox: raton.current.x * k,
          oy: raton.current.y * k * 0.5,
          zoom: 1, zoomCapa: () => 1, panCapa: (d) => d,
          alphaCapa: () => 1, t: 0, fin: false,
        };
      } else {
        pasoMsRef.current += dt;
        vista = vistaAnim(animRef.current, pasoMsRef.current, k, { durMs: 4500, modo: "ciclo" });
      }
    }

    // El fondo es el único opaco: si se queda por debajo del cuadro, asoma el
    // negro por los bordes. Se le pone suelo en 1 y así «alejar» no rompe nada.
    const idFondo = capas.find((x) => x.visible)?.id;
    for (const capa of capas) {
      if (!capa.visible) continue;
      let e = capa.escala * vista.zoom * vista.zoomCapa(capa.depth);
      if (capa.id === idFondo) e = Math.max(1, e);
      const dw = w * e, dh = h * e;
      // El paneo también va con la perspectiva: de cerca, el mismo movimiento
      // de cámara barre mucho más cuadro. Sin esto, al acercarse el paralaje se
      // queda corto y la escena vuelve a parecer plana.
      const pan = vista.panCapa(capa.depth);
      c.save();
      c.globalAlpha = capa.opacidad * vista.alphaCapa(capa.depth, capa.id);
      c.drawImage(
        capa.img,
        -(dw - w) / 2 + vista.ox * pan * w,
        -(dh - h) / 2 + vista.oy * pan * h,
        dw, dh,
      );
      c.restore();
    }
  }

  async function exportarPng() {
    if (!capas.length) return;
    const out = document.createElement("canvas");
    out.width = tam.current.w; out.height = tam.current.h;
    const c = out.getContext("2d");
    if (!c) return;
    for (const capa of capas) {
      if (!capa.visible) continue;
      const e = capa.escala;
      const dw = out.width * e, dh = out.height * e;
      c.globalAlpha = capa.opacidad;
      c.drawImage(capa.img, -(dw - out.width) / 2, -(dh - out.height) / 2, dw, dh);
    }
    const b = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (b) bajar(b, "montaje.png");
  }

  function anadirACola() {
    const p = pasoPorDefecto({ ...borrador, id: `p${++pasoSeq}` });
    setCola((c) => [...c, p]);
    const label = MOV_COLA.find((o) => o.id === p.mov)?.label ?? p.mov;
    setAviso(`Añadido: ${label} · dist ${p.distancia}% · ${(p.durMs / 1000).toFixed(1)}s`);
  }

  function updPaso(id: string, patch: Partial<PasoSecuencia>) {
    setCola((cs) => cs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function iniciarSecuencia() {
    if (!cola.length) return;
    encima.current = false;
    retenerPoseRef.current = false;
    estadoRef.current = estadoNeutro();
    pasoActivoRef.current = 0;
    setPasoActivo(0);
    planificar();
    setEnSecuencia(true);
    setMoviendo(true);
    setAviso(`Reproduciendo secuencia (${cola.length} pasos, estado encadenado)…`);
  }

  function pararSecuencia() {
    setEnSecuencia(false);
    retenerPoseRef.current = true;
    setAviso("Secuencia en pausa — se conserva la pose actual.");
  }

  function centrarTodo() {
    encima.current = false;
    raton.current = { x: 0, y: 0 };
    estadoRef.current = estadoNeutro();
    retenerPoseRef.current = false;
    pasoMsRef.current = 0;
    setAviso("Cámara al centro, fades reiniciados.");
  }

  const upd = (id: string, p: Partial<CapaImg>) =>
    setCapas((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const mover = (i: number, d: -1 | 1) =>
    setCapas((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const n = [...cs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const pistaIdle = ANIM_OPCIONES.find((o) => o.id === anim)?.pista;
  const pistaMov = MOV_COLA.find((o) => o.id === borrador.mov)?.pista;
  const segsBorrador = borrador.durMs / 1000;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-brand cursor-pointer text-xs">
          <Upload className="h-3.5 w-3.5" /> Añadir imágenes
          <input
            type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
            onChange={(e) => { void meter(e.target.files); e.target.value = ""; }}
          />
        </label>
        <button
          onClick={() => {
            if (enSecuencia) pararSecuencia();
            else {
              retenerPoseRef.current = false;
              setMoviendo((v) => !v);
            }
          }}
          className="btn-ghost text-xs"
        >
          {moviendo || enSecuencia
            ? <Pause className="h-3.5 w-3.5 text-accent" />
            : <Play className="h-3.5 w-3.5 text-accent" />}
          {enSecuencia ? "Parar secuencia" : moviendo ? "Parar el movimiento" : "Mover"}
        </button>
        <button onClick={centrarTodo} className="btn-ghost text-xs">
          <Crosshair className="h-3.5 w-3.5 text-accent" /> Centrar
        </button>
        <button onClick={() => void exportarPng()} disabled={!capas.length} className="btn-ghost text-xs">
          <Download className="h-3.5 w-3.5 text-accent" /> Montaje PNG
        </button>
        <button onClick={() => void exportarZip()} disabled={!capas.length || !!busyZip} className="btn-ghost text-xs">
          {busyZip === "bajar" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <Package className="h-3.5 w-3.5 text-accent" />}
          Descargar ZIP
        </button>
        <label className={`btn-ghost cursor-pointer text-xs ${busyZip ? "pointer-events-none opacity-50" : ""}`}>
          {busyZip === "subir" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <FolderOpen className="h-3.5 w-3.5 text-accent" />}
          Importar ZIP
          <input
            type="file" accept=".zip,application/zip" className="hidden"
            onChange={(e) => { void importarZip(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
        </label>
        <button onClick={() => { setCapas([]); setAviso("Vacío."); }} disabled={!capas.length} className="btn-ghost text-xs text-danger">
          <Trash2 className="h-3.5 w-3.5" /> Vaciar
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card space-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="label">Capas</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{capas.length}</span>
          </div>
          {!capas.length && (
            <p className="text-[11px] text-muted">
              La primera imagen fija el tamaño y hace de fondo. Las siguientes tienen que ser PNG
              con transparencia. Encadena acercar → pan → fade para controlar la toma a mano.
            </p>
          )}
          {capas.map((c, i) => (
            <div key={c.id} className="space-y-1.5 rounded-lg border border-border bg-surface-2/50 p-2">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.nombre}</span>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted hover:text-fg disabled:opacity-30" title="Atrás"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === capas.length - 1} className="text-muted hover:text-fg disabled:opacity-30" title="Adelante"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => upd(c.id, { visible: !c.visible })} className="text-muted hover:text-fg">
                  {c.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setCapas((cs) => cs.filter((x) => x.id !== c.id))} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {c.via && (
                <p className={`text-[10px] ${c.via === "opaca" && i > 0 ? "text-gold" : "text-muted"}`}>
                  {c.via === "transparente" && "vino con transparencia"}
                  {c.via === "croma" && "se le quitó el color de fondo"}
                  {c.via === "opaca" && (i === 0 ? "fondo opaco, como debe ser" : "opaca y sin fondo plano que quitar: tapará a las de atrás")}
                  {typeof c.vacio === "number" ? ` · ${Math.round(c.vacio * 100)}% vacío` : ""}
                </p>
              )}
              <Barra etiqueta="Profundidad" valor={c.depth} max={1} paso={0.01}
                onCambio={(v) => upd(c.id, { depth: v })} formato={(v) => v.toFixed(2)} />
              <Barra etiqueta="Zoom" valor={c.escala} min={1} max={1.4} paso={0.01}
                onCambio={(v) => upd(c.id, { escala: v })} formato={(v) => `${Math.round((v - 1) * 100)}%`} />
              <Barra etiqueta="Opacidad" valor={c.opacidad} max={1} paso={0.01}
                onCambio={(v) => upd(c.id, { opacidad: v })} formato={(v) => `${Math.round(v * 100)}%`} />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {/* La vista previa, arriba y pegada. Antes vivía debajo de toda la
              cola: para tocar un paso había que bajar, y se editaba a ciegas.
              Ahora se queda a la vista mientras se ajusta lo de abajo. */}
          <div className="sticky top-2 z-10 space-y-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/40">
            <div
              ref={caja}
              className="overflow-hidden rounded-lg border border-border bg-black"
              onPointerMove={(e) => {
                if (enSecuencia || retenerPoseRef.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                raton.current = {
                  x: ((e.clientX - r.left) / r.width - 0.5) * 2,
                  y: ((e.clientY - r.top) / r.height - 0.5) * 2,
                };
                encima.current = true;
              }}
              onPointerLeave={() => { encima.current = false; }}
              onDrop={(e) => {
                e.preventDefault();
                const z = Array.from(e.dataTransfer.files).find((f) => /\.zip$/i.test(f.name));
                if (z) void importarZip(z);
                else void meter(e.dataTransfer.files);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <canvas ref={canvas} className="block h-auto w-full" />
            </div>
            {!!cola.length && (
              <div className="flex items-center gap-1">
                {cola.map((q, i) => (
                  <span
                    key={q.id}
                    title={`${i + 1}. ${MOV_COLA.find((o) => o.id === q.mov)?.label ?? q.mov}`}
                    style={{ flexGrow: q.durMs }}
                    className={`h-1 rounded-full ${enSecuencia && i === pasoActivo ? "bg-brand" : i < pasoActivo ? "bg-accent/50" : "bg-border"}`}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted">
                Fuerza
                <input type="range" min={0} max={100} value={fuerza} onChange={(e) => setFuerza(Number(e.target.value))} className="min-w-0 flex-1" />
                <span className="w-8 tabular-nums">{fuerza}%</span>
              </label>
            </div>
            <p className="text-[11px] text-muted">{aviso}</p>
          </div>

          <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted">
              Idle (fuera de cola)
              <select
                value={anim}
                onChange={(e) => {
                  setAnim(e.target.value as AnimParalaje);
                  if (!enSecuencia) pasoMsRef.current = 0;
                  retenerPoseRef.current = false;
                }}
                className="input min-w-0 flex-1 py-1 text-[11px]"
                aria-label="Animación idle"
                disabled={enSecuencia}
              >
                {ANIM_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          {pistaIdle && !enSecuencia && (
            <p className="text-[10px] text-muted">{pistaIdle}. Con el ratón encima mandas tú.</p>
          )}

          <div className="space-y-2 rounded-lg border border-border/70 bg-surface-2/40 p-2">
            <p className="text-[11px] font-medium text-fg">Cola encadenada</p>
            <p className="text-[10px] text-muted">
              Cada paso parte de donde dejó el anterior (pan, zoom y capas ocultas se conservan).
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[9rem] flex-1 text-[11px] text-muted">
                Movimiento
                <select
                  value={borrador.mov}
                  onChange={(e) => setBorrador((b) => ({
                    ...b,
                    mov: e.target.value as MovCola,
                    fade: e.target.value === "atravesar" && b.fade === "nada" ? "desaparecer" : b.fade,
                    fadeCapa: e.target.value === "atravesar" && b.fadeCapa === "ninguna" ? "frente" : b.fadeCapa,
                  }))}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia}
                >
                  {MOV_COLA.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-muted">
                Segundos
                <input
                  type="number" min={0.8} max={30} step={0.5} value={segsBorrador}
                  onChange={(e) => setBorrador((b) => ({
                    ...b,
                    durMs: Math.round(Math.max(0.8, Number(e.target.value) || 4) * 1000),
                  }))}
                  className="input mt-0.5 w-20 py-1 text-[11px] tabular-nums"
                  disabled={enSecuencia}
                />
              </label>
              <label className="text-[11px] text-muted">
                Distancia
                <input
                  type="number" min={5} max={100} step={5} value={borrador.distancia}
                  onChange={(e) => setBorrador((b) => ({
                    ...b,
                    distancia: Math.max(5, Math.min(100, Number(e.target.value) || 55)),
                  }))}
                  className="input mt-0.5 w-20 py-1 text-[11px] tabular-nums"
                  disabled={enSecuencia}
                />
              </label>
            </div>
            {pistaMov && <p className="text-[10px] text-muted">{pistaMov}</p>}

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[8rem] flex-1 text-[11px] text-muted">
                Partir desde
                <select
                  value={borrador.desde}
                  onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value as DesdePaso }))}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia}
                >
                  <option value="continuar">Donde quedó (encadenar)</option>
                  <option value="centro">Centro (reinicia pan/zoom)</option>
                  <option value="posicion">Posición inicial…</option>
                </select>
              </label>
              <label className="min-w-[7rem] flex-1 text-[11px] text-muted">
                Capa fade
                <select
                  value={borrador.fadeCapa}
                  onChange={(e) => setBorrador((b) => ({ ...b, fadeCapa: e.target.value as FadeCapa }))}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia}
                >
                  <option value="ninguna">Ninguna</option>
                  <option value="frente">Frontal (más depth)</option>
                  {capas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-[7rem] text-[11px] text-muted">
                Fade
                <select
                  value={borrador.fade}
                  onChange={(e) => setBorrador((b) => ({ ...b, fade: e.target.value as FadeAccion }))}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia || borrador.fadeCapa === "ninguna"}
                >
                  <option value="nada">Nada</option>
                  <option value="desaparecer">Desaparecer</option>
                  <option value="aparecer">Aparecer</option>
                </select>
              </label>
            </div>

            {borrador.desde === "posicion" && (
              <div className="flex flex-wrap gap-2">
                <Num etiqueta="Inicio X" valor={borrador.inicioOx} min={-1} max={1} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioOx: v }))} disabled={enSecuencia} />
                <Num etiqueta="Inicio Y" valor={borrador.inicioOy} min={-1} max={1} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioOy: v }))} disabled={enSecuencia} />
                <Num etiqueta="Inicio zoom" valor={borrador.inicioZoom} min={0.6} max={2.5} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioZoom: v }))} disabled={enSecuencia} />
              </div>
            )}

            {borrador.mov === "ir-a" && (
              <div className="flex flex-wrap gap-2">
                <Num etiqueta="Destino X" valor={borrador.destOx} min={-1} max={1} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, destOx: v }))} disabled={enSecuencia} />
                <Num etiqueta="Destino Y" valor={borrador.destOy} min={-1} max={1} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, destOy: v }))} disabled={enSecuencia} />
                <Num etiqueta="Destino zoom" valor={borrador.destZoom} min={0.6} max={2.5} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, destZoom: v }))} disabled={enSecuencia} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={anadirACola} disabled={enSecuencia} className="btn-ghost text-xs">
                <ListPlus className="h-3.5 w-3.5 text-accent" /> Añadir a la cola
              </button>
              <button
                type="button"
                onClick={() => (enSecuencia ? pararSecuencia() : iniciarSecuencia())}
                disabled={!cola.length}
                className="btn-brand text-xs"
              >
                <ListOrdered className="h-3.5 w-3.5" />
                {enSecuencia ? "Parar cola" : "Reproducir cola"}
              </button>
              <label className="flex items-center gap-1.5 text-[11px] text-muted">
                <input type="checkbox" checked={repetirCola} onChange={(e) => setRepetirCola(e.target.checked)} />
                Repetir
              </label>
              {!!cola.length && (
                <button
                  type="button"
                  onClick={() => { setCola([]); pararSecuencia(); retenerPoseRef.current = false; estadoRef.current = estadoNeutro(); }}
                  className="btn-ghost text-xs text-danger"
                >
                  Vaciar cola
                </button>
              )}
            </div>
          </div>

          {!!cola.length && (
            <ol className="space-y-1.5 text-[11px]">
              {cola.map((p, i) => {
                const label = MOV_COLA.find((o) => o.id === p.mov)?.label ?? p.mov;
                const on = enSecuencia && i === pasoActivo;
                const fadeTxt = p.fade !== "nada" && p.fadeCapa !== "ninguna"
                  ? ` · ${p.fade === "aparecer" ? "aparece" : "desaparece"} ${p.fadeCapa === "frente" ? "frente" : (capas.find((c) => c.id === p.fadeCapa)?.nombre ?? "capa")}`
                  : p.mov === "atravesar" ? " · fade frente" : "";
                const desdeTxt = p.desde === "continuar" ? "" : p.desde === "centro" ? " · desde centro" : " · desde pos.";
                return (
                  <li
                    key={p.id}
                    className={`rounded-md px-2 py-1.5 ${on ? "bg-brand/15 text-brand" : "bg-surface-2/50 text-muted"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums opacity-70">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-fg">{label}</span>
                      <span className="tabular-nums">{p.distancia}%</span>
                      <span className="tabular-nums">{(p.durMs / 1000).toFixed(1)}s</span>
                      {!enSecuencia && (
                        <button
                          type="button"
                          className="text-muted hover:text-danger"
                          onClick={() => setCola((cs) => cs.filter((x) => x.id !== p.id))}
                          aria-label="Quitar paso"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] opacity-80">{desdeTxt}{fadeTxt || " · encadena"}</p>
                    {/* Los seis controles de cada paso solo salen al abrirlo:
                        con cinco pasos abiertos a la vez, la página era un
                        tobogán y se tocaban cosas sin querer al bajar. */}
                    {!enSecuencia && abierto !== p.id && (
                      <button
                        type="button"
                        onClick={() => setAbierto(p.id)}
                        className="mt-1 text-[10px] text-accent hover:underline"
                      >
                        Ajustar…
                      </button>
                    )}
                    {!enSecuencia && abierto === p.id && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <select
                          value={p.mov}
                          onChange={(e) => updPaso(p.id, { mov: e.target.value as MovCola })}
                          className="input py-0.5 text-[10px]"
                        >
                          {MOV_COLA.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-[10px]">
                          Dist
                          <input
                            type="number" min={5} max={100} step={5} value={p.distancia}
                            onChange={(e) => updPaso(p.id, {
                              distancia: Math.max(5, Math.min(100, Number(e.target.value) || 55)),
                            })}
                            className="input w-14 py-0.5 text-[10px] tabular-nums"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px]">
                          s
                          <input
                            type="number" min={0.8} max={30} step={0.5} value={p.durMs / 1000}
                            onChange={(e) => updPaso(p.id, {
                              durMs: Math.round(Math.max(0.8, Number(e.target.value) || 4) * 1000),
                            })}
                            className="input w-14 py-0.5 text-[10px] tabular-nums"
                          />
                        </label>
                        <select
                          value={p.desde}
                          onChange={(e) => updPaso(p.id, { desde: e.target.value as DesdePaso })}
                          className="input py-0.5 text-[10px]"
                        >
                          <option value="continuar">Encadenar</option>
                          <option value="centro">Desde centro</option>
                          <option value="posicion">Desde posición</option>
                        </select>
                        <select
                          value={p.fadeCapa}
                          onChange={(e) => updPaso(p.id, { fadeCapa: e.target.value as FadeCapa })}
                          className="input py-0.5 text-[10px]"
                        >
                          <option value="ninguna">Sin fade</option>
                          <option value="frente">Frente</option>
                          {capas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <select
                          value={p.fade}
                          onChange={(e) => updPaso(p.id, { fade: e.target.value as FadeAccion })}
                          className="input py-0.5 text-[10px]"
                          disabled={p.fadeCapa === "ninguna"}
                        >
                          <option value="nada">—</option>
                          <option value="desaparecer">Desaparecer</option>
                          <option value="aparecer">Aparecer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setAbierto(null)}
                          className="text-[10px] text-muted hover:text-fg"
                        >
                          Cerrar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          </div>
        </div>
      </div>
    </div>
  );
}

function Num({ etiqueta, valor, min, max, paso, onCambio, disabled }: {
  etiqueta: string; valor: number; min: number; max: number; paso: number;
  onCambio: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label className="text-[11px] text-muted">
      {etiqueta}
      <input
        type="number" min={min} max={max} step={paso} value={valor} disabled={disabled}
        onChange={(e) => onCambio(Number(e.target.value))}
        className="input mt-0.5 w-24 py-1 text-[11px] tabular-nums"
      />
    </label>
  );
}

function Barra({ etiqueta, valor, min = 0, max, paso, onCambio, formato }: {
  etiqueta: string; valor: number; min?: number; max: number; paso: number;
  onCambio: (v: number) => void; formato: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="w-16 shrink-0">{etiqueta}</span>
      <input type="range" min={min} max={max} step={paso} value={valor}
        onChange={(e) => onCambio(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}

const cargar = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("imagen ilegible"));
    i.src = url;
  });

function hacerCapa(nombre: string, img: HTMLImageElement): CapaImg {
  return {
    id: `c${++contador}`, nombre, img,
    depth: 0, visible: true, escala: 1, opacidad: 1,
  };
}

function repartirProfundidad(cs: CapaImg[]): CapaImg[] {
  return cs.map((c, i) => {
    const d = cs.length === 1 ? 0 : (i / (cs.length - 1)) ** 1.4;
    return { ...c, depth: Math.round(d * 100) / 100, escala: 1 + d * 0.12 };
  });
}
