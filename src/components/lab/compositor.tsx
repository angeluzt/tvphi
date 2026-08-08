"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Play, Pause, Crosshair, Download, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  Package, FolderOpen, Loader2, ListPlus, ListOrdered,
  Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut,
  MapPinned, Plus, RotateCcw, Square,
} from "lucide-react";
import { bajar } from "@/lib/lab/exportar";
import { bajarMontajeZip, leerMontajeZip } from "@/lib/lab/montaje-zip";
import { desplazamientoCapa, normalizarMov, MOVS_CAPA, type MovCapa } from "@/lib/lab/movimiento-capa";
import {
  cajaSprite, estadoSpriteEn, fotogramaEn, normalizarSprite, pintarSprite, spriteSigueCamara,
  type PasoRutaSprite, type Plano, type SpriteEnCapa,
} from "@/lib/lab/sprite-capa";
import {
  ANIM_OPCIONES, MOV_COLA, vistaAnim, estadoNeutro, clonarEstado, pasoPorDefecto,
  planificarCola, interpolarTramo, escalaPerspectiva, visibilidadPorAvance,
  acotarAvance, acotarPan, panPerspectiva, seCombinan, segundosPosibles,
  type AnimParalaje, type MovCola, type PasoSecuencia, type VistaCamara, type EstadoCamara,
  type DesdePaso, type FadeAccion, type FadeCapa, type Tramo,
} from "@/lib/lab/anim-paralaje";
import { RangoPreciso } from "./rango-preciso";

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
  /** Movimiento propio, además del de la cámara. */
  mov?: MovCapa;
  /**
   * Si la capa es un sprite: `img` es la TIRA entera y esto dice cómo leerla.
   * Sin esto, la imagen se pinta a pantalla completa, como siempre.
   */
  spr?: SpriteEnCapa;
}

export interface Semilla {
  nombre: string;
  url: string;
  via?: CapaImg["via"];
  vacio?: number;
  mov?: MovCapa;
  spr?: SpriteEnCapa;
}

let contador = 0;
let pasoSeq = 0;

export function Compositor({ semilla, sprite, colaInicial, escena, onEscena }: {
  semilla?: Semilla[];
  /**
   * Un sprite de la biblioteca para AÑADIR, no para reemplazar.
   *
   * Va aparte de `semilla` a propósito: la semilla es «este es el montaje»,
   * y un sprite es «mete además este pájaro». Si compartieran camino, elegir
   * un pájaro borraría el decorado.
   */
  sprite?: (Semilla & { spr: SpriteEnCapa }) | null;
  /** Cola escrita por la IA. Se carga una vez, y a partir de ahí se edita. */
  colaInicial?: PasoSecuencia[];
  /** El mapa de formas, para que viaje dentro del ZIP del proyecto. */
  escena?: unknown;
  /** Al importar un ZIP que trae mapa, se devuelve para reponerlo en su pestaña. */
  onEscena?: (e: unknown) => void;
}) {
  const [capas, setCapas] = useState<CapaImg[]>([]);
  const [moviendo, setMoviendo] = useState(true);
  const [fuerza, setFuerza] = useState(55);
  const [anim, setAnim] = useState<AnimParalaje>("suave");
  // Borrador del paso a añadir a la cola
  const [borrador, setBorrador] = useState(() => pasoPorDefecto({ id: "borrador", mov: "der", durMs: 4000, distancia: 55 }));
  const [cola, setCola] = useState<PasoSecuencia[]>([]);
  const relojRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  /** Cada sprite puede pararse y reanudarse sin congelar cámara ni animales vecinos. */
  const relojesSpriteRef = useRef(new Map<string, { inicio: number; pausa?: number }>());
  const [, refrescarRelojes] = useState(0);
  const [rutaVisibleId, setRutaVisibleId] = useState<string | null>(null);
  // La cola de la IA se copia UNA vez y ya es tuya: si se volviera a copiar en
  // cada render, cualquier retoque a mano se perdería al respirar.
  const colaIaRef = useRef<PasoSecuencia[] | null>(null);
  useEffect(() => {
    if (!colaInicial?.length || colaIaRef.current === colaInicial) return;
    colaIaRef.current = colaInicial;
    setCola(colaInicial.map((p, i) => ({ ...p, id: `p${++pasoSeq}-${i}` })));
  }, [colaInicial]);
  const [enSecuencia, setEnSecuencia] = useState(false);
  const [pasoActivo, setPasoActivo] = useState(0);
  const [repetirCola, setRepetirCola] = useState(false);
  /** Qué paso de la cola tiene abiertos sus ajustes. Solo uno a la vez. */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Dónde está la cámara ahora mismo, para enseñarlo mientras se coloca. */
  const [pose, setPose] = useState({ ox: 0, oy: 0, avance: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const arrastreRef = useRef<{ x: number; y: number } | null>(null);
  /** Dedos puestos ahora mismo, para saber cuándo hay pellizco. */
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizcoRef = useRef<number | null>(null);
  const separacionDedos = () => {
    const p = [...dedos.current.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
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
  /**
   * EL FOTOGRAMA CERO: dónde empieza la animación.
   *
   * Aparte del estado vivo a propósito. Si se planifica desde la cámara actual,
   * al acabar la cola esa cámara ya está en el final y darle otra vez sigue
   * avanzando, así que la misma animación nunca se puede repetir. Esto solo lo
   * cambian el usuario colocando la toma y el botón de centrar.
   */
  const inicioRef = useRef<EstadoCamara>(estadoNeutro());
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

  function tiempoSprite(id: string, ahora = performance.now()) {
    let r = relojesSpriteRef.current.get(id);
    if (!r) {
      r = { inicio: relojRef.current || ahora };
      relojesSpriteRef.current.set(id, r);
    }
    return r.pausa !== undefined ? r.pausa : Math.max(0, (ahora - r.inicio) / 1000);
  }

  function spriteCorriendo(id: string) {
    return relojesSpriteRef.current.get(id)?.pausa === undefined;
  }

  function pausarSprite(id: string) {
    const ahora = performance.now();
    const segundos = tiempoSprite(id, ahora);
    relojesSpriteRef.current.set(id, { inicio: ahora - segundos * 1000, pausa: segundos });
    refrescarRelojes((n) => n + 1);
  }

  function reproducirSprite(id: string) {
    const ahora = performance.now();
    const r = relojesSpriteRef.current.get(id);
    const segundos = r?.pausa ?? (r ? Math.max(0, (ahora - r.inicio) / 1000) : 0);
    relojesSpriteRef.current.set(id, { inicio: ahora - segundos * 1000 });
    refrescarRelojes((n) => n + 1);
  }

  function reiniciarSprite(id: string, reproducir = true) {
    const ahora = performance.now();
    relojesSpriteRef.current.set(id, reproducir ? { inicio: ahora } : { inicio: ahora, pausa: 0 });
    refrescarRelojes((n) => n + 1);
  }

  function reiniciarSpritesSincronizados() {
    const ahora = performance.now();
    for (const capa of capasRef.current) {
      if (capa.spr && capa.spr.sincronizar !== false) {
        relojesSpriteRef.current.set(capa.id, { inicio: ahora });
      }
    }
  }

  function planificar() {
    // Siempre desde la pose de INICIO, nunca desde donde esté la cámara ahora.
    // Antes se planificaba desde el estado vivo, y al acabar la cola ese estado
    // era el final: darle otra vez a reproducir seguía avanzando desde ahí y no
    // había forma de repetir la misma animación.
    planRef.current = planificarCola(
      colaRef.current, fuerzaRef.current, metaCapas(), clonarEstado(inicioRef.current),
    );
    pasoMsRef.current = 0;
  }

  /** Refresca el marcador de la pose sin repintar en cada píxel arrastrado. */
  function anotarPose() {
    const e = estadoRef.current;
    setPose({ ox: e.ox, oy: e.oy, avance: e.avance });
  }

  /**
   * Colocar la cámara a mano REDEFINE dónde empieza la animación. Es lo que
   * hace que «lo dejo aquí» signifique algo: no es una vista suelta, es el
   * fotograma cero.
   */
  function fijarInicio(e: EstadoCamara) {
    estadoRef.current = e;
    inicioRef.current = clonarEstado(e);
    anotarPose();
  }

  function moverPose(dx: number, dy: number) {
    const e = estadoRef.current;
    // Se divide por el paralaje del primer plano para que lo que agarras siga
    // al dedo: arrastras la piedra de delante y la piedra va contigo.
    const ref = Math.max(0.2, vistaDesdeEstado(e).panCapa(1));
    fijarInicio({
      ...e,
      ox: acotarPan(e.ox + dx / ref),
      oy: acotarPan(e.oy + dy / ref),
    });
  }

  function acercarPose(signo: 1 | -1) {
    const e = estadoRef.current;
    // Paso proporcional a lo que queda por delante: cerca del plano de una capa
    // un incremento fijo daría saltos enormes, porque la escala es 1/(1−a).
    const paso = 0.045 * Math.max(0.35, 1 - e.avance * 0.55);
    fijarInicio({ ...e, avance: acotarAvance(e.avance + signo * paso) });
  }

  /** Mete la pose actual en el paso que se está preparando. */
  function tomarPose() {
    const e = estadoRef.current;
    setBorrador((b) => ({
      ...b,
      desde: "posicion",
      inicioOx: Math.round(e.ox * 1000) / 1000,
      inicioOy: Math.round(e.oy * 1000) / 1000,
      inicioAvance: Math.round(e.avance * 1000) / 1000,
      inicioZoom: Math.max(0.4, 1 / Math.max(0.08, 1 - e.avance)),
    }));
    setAviso("Este paso arrancará desde la posición que tienes en la vista previa.");
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
        // El mapa y la cámara van DENTRO. Sin ellos, al reimportar volvían las
        // imágenes pero había que rehacer el mapa y la animación a mano, que es
        // justo el trabajo que uno guarda para no repetir.
        escena,
        cola,
        capas: capas.map((c) => ({
          nombre: c.nombre, depth: c.depth, escala: c.escala, opacidad: c.opacidad,
          via: c.via, vacio: c.vacio, mov: c.mov, spr: c.spr, img: c.img,
        })),
      });
      setAviso(
        `ZIP con ${capas.length} capas`
        + (escena ? ", el mapa" : "")
        + (cola.length ? ` y ${cola.length} pasos de cámara` : "")
        + ".",
      );
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
          mov: normalizarMov(c.mov),
          spr: normalizarSprite(c.spr),
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
      relojesSpriteRef.current.clear();
      setRutaVisibleId(null);
      setCapas(nuevas);

      // Y lo demás, si el ZIP lo trae (los v1 no).
      const partes = [`${nuevas.length} capas`];
      if (Array.isArray(pack.cola) && pack.cola.length) {
        setCola((pack.cola as PasoSecuencia[]).map((p, i) => pasoPorDefecto({ ...p, id: `z${++pasoSeq}-${i}` })));
        partes.push(`${pack.cola.length} pasos de cámara`);
      }
      if (pack.escena) {
        onEscena?.(pack.escena);
        partes.push("el mapa");
      }
      setAviso(`Importado: ${partes.join(", ")}.`);
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
          nuevas.push({
            ...hacerCapa(s.nombre, await cargar(s.url)),
            via: s.via, vacio: s.vacio, mov: s.mov, spr: s.spr,
          });
        } catch {}
      }
      if (!vivo || !nuevas.length) return;
      relojesSpriteRef.current.clear();
      tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      setCapas(repartirProfundidad(nuevas));
      setAviso("Capas del mapa cargadas. Es el mapa, no la imagen final: sirve para ver el movimiento.");
    })();
    return () => { vivo = false; };
  }, [semilla]);

  // Un sprite de la biblioteca se AÑADE encima de lo que ya hay.
  //
  // Y NO se reparten las profundidades: `repartirProfundidad` las recalcula
  // todas según el orden, así que meter un pájaro movería el fondo y el primer
  // plano que ya estaban puestos. El pájaro entra a media distancia y se ajusta
  // a mano, que es lo único que no rompe el montaje de nadie.
  useEffect(() => {
    if (!sprite) return;
    let vivo = true;
    (async () => {
      try {
        const img = await cargar(sprite.url);
        if (!vivo) return;
        const nueva = {
          ...hacerCapa(sprite.nombre, img),
          mov: sprite.mov,
          spr: {
            ...sprite.spr,
            espacio: sprite.spr.espacio ?? "pantalla",
            sincronizar: sprite.spr.sincronizar !== false,
          },
        };
        relojesSpriteRef.current.set(nueva.id, { inicio: performance.now() });
        setRutaVisibleId(nueva.id);
        setCapas((prev) => [...prev, { ...nueva, depth: prev.length ? 0.5 : 0 }]);
        // Empieza en A al entrar al montaje; si se conserva el reloj de la
        // sesión, una trayectoria corta aparecería ya terminada en B.
        relojRef.current = performance.now();
        setAviso(`«${sprite.nombre}» añadido. Colócalo con los mandos de su capa.`);
      } catch {
        if (vivo) setAviso(`No se pudo cargar «${sprite.nombre}».`);
      }
    })();
    return () => { vivo = false; };
  }, [sprite]);

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
      panCapa: (depth) => panPerspectiva(e.avance, depth),
      alphaCapa: (d, id) =>
        (id && typeof e.alpha[id] === "number" ? e.alpha[id] : 1) * visibilidadPorAvance(e.avance, d),
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

    // Mismo orden de magnitud que el paneo de la cola: con 0,08 los presets
    // sueltos se movían 40 px en cuatro segundos y parecían estropeados.
    const k = (fuerzaRef.current / 100) * 0.32;
    let vista: VistaCamara = {
      ox: 0, oy: 0, zoom: 1,
      zoomCapa: () => 1, panCapa: (d) => panPerspectiva(0, d), alphaCapa: () => 1, t: 0, fin: false,
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
            // Vuelve a donde EMPEZÓ, no al centro: si la toma se colocó abajo,
            // cada vuelta del bucle tiene que salir de abajo otra vez.
            idx = 0;
            estadoRef.current = clonarEstado(inicioRef.current);
            relojRef.current = performance.now();
            reiniciarSpritesSincronizados();
          } else { acabo = true; }
          break;
        }
      }
      if (acabo) {
        enSecuenciaRef.current = false;
        setEnSecuencia(false);
        retenerPoseRef.current = true;
        pasoMsRef.current = 0;
        // Al acabar, la cámara VUELVE al inicio que se definió: es lo que deja
        // ver otra vez el fotograma cero y poder repetir la misma animación.
        estadoRef.current = clonarEstado(inicioRef.current);
        relojRef.current = performance.now();
        reiniciarSpritesSincronizados();
        anotarPose();
        setAviso("Terminada. La cámara vuelve al inicio que fijaste: dale otra vez y hace lo mismo.");
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
          // Con el ratón encima, la mitad: es para curiosear la escena, no un
          // travelling, y a tamaño completo marea.
          ox: raton.current.x * k * 0.5,
          oy: raton.current.y * k * 0.25,
          zoom: 1, zoomCapa: () => 1, panCapa: (d) => panPerspectiva(0, d),
          alphaCapa: () => 1, t: 0, fin: false,
        };
      } else {
        pasoMsRef.current += dt;
        vista = vistaAnim(animRef.current, pasoMsRef.current, k, { durMs: 4500, modo: "ciclo" });
      }
    }

    // El fondo es el único opaco: si se queda por debajo del cuadro, asoma el
    // negro por los bordes. Se le pone suelo en 1 y así «alejar» no rompe nada.
    // Un sprite nunca puede hacer de fondo: es un bicho recortado con casi todo
    // transparente, y darle el trato de fondo opaco solo consigue que se estire
    // buscando tapar un cuadro que no puede tapar.
    const idFondo = capas.find((x) => x.visible && !x.spr)?.id;
    // Reloj propio: un pájaro sigue volando aunque la cámara esté quieta. Al
    // reproducir una cola sí se reinicia, para que A→B y la toma compartan un
    // fotograma cero reproducible.
    const ahora = performance.now();
    const reloj = (ahora - relojRef.current) / 1000;
    let guiaRuta: { spr: SpriteEnCapa; plano: Plano; tiempo: number } | null = null;
    for (const capa of capas) {
      if (!capa.visible) continue;
      // El movimiento propio siempre usa coordenadas del lienzo. Para sprites
      // «pantalla» este es TODO su movimiento; para el resto se suma después
      // al paneo y al zoom de cámara.
      const tiempo = capa.spr ? tiempoSprite(capa.id, ahora) : reloj;
      const propio = desplazamientoCapa(capa.mov, tiempo);

      if (capa.spr && !spriteSigueCamara(capa.spr)) {
        // Plano fijo del lienzo: no usa vista.ox, vista.zoom, profundidad ni
        // alphaCapa. Así una transición de cámara no dobla la trayectoria A→B
        // ni hace desaparecer al sprite. Zoom y opacidad manuales sí mandan.
        const af = capa.img.naturalWidth / capa.spr.fotogramas;
        const hf = capa.img.naturalHeight;
        const i = fotogramaEn(capa.spr, tiempo);
        const estado = estadoSpriteEn(capa.spr, tiempo);
        const spr = {
          ...capa.spr,
          alto: capa.spr.alto * capa.escala * propio.escala,
          espejo: estado.espejo,
        };
        const plano = { x0: propio.dx * w, y0: propio.dy * h, w, h };
        c.save();
        c.globalAlpha = capa.opacidad;
        pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, plano, tiempo));
        if (propio.repetir) {
          if (capa.mov?.x) {
            const p2 = { ...plano, x0: plano.x0 - Math.sign(capa.mov.x) * 2 * w };
            pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
          }
          if (capa.mov?.y) {
            const p2 = { ...plano, y0: plano.y0 - Math.sign(capa.mov.y) * 2 * h };
            pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
          }
        }
        c.restore();
        if (rutaVisibleId === capa.id) guiaRuta = { spr, plano, tiempo };
        continue;
      }

      let e = capa.escala * vista.zoom * vista.zoomCapa(capa.depth);
      // El paneo también va con la perspectiva: de cerca, el mismo movimiento
      // de cámara barre mucho más cuadro. Sin esto, al acercarse el paralaje se
      // queda corto y la escena vuelve a parecer plana.
      const pan = vista.panCapa(capa.depth);
      if (capa.id === idFondo) {
        // El fondo es el único opaco: si se desplaza o se queda por debajo del
        // cuadro, asoma el negro por el canto. Se le da justo el margen que
        // necesita para el paneo de este fotograma —(e−1)/2 tiene que cubrir el
        // desplazamiento— así que ni se ve el negro ni se agranda de más.
        const holgura = 1 + 2 * Math.max(Math.abs(vista.ox * pan), Math.abs(vista.oy * pan));
        e = Math.max(e, holgura);
      }
      e *= propio.escala;
      const dw = w * e, dh = h * e;
      const x0 = -(dw - w) / 2 + vista.ox * pan * w + propio.dx * w;
      const y0 = -(dh - h) / 2 + vista.oy * pan * h + propio.dy * h;
      c.save();
      c.globalAlpha = capa.opacidad * vista.alphaCapa(capa.depth, capa.id);

      if (capa.spr) {
        // Este es el modo opcional «seguir cámara»: el sprite vive dentro del
        // plano transformado y por eso sí hereda paralaje, zoom y fundidos.
        const af = capa.img.naturalWidth / capa.spr.fotogramas;
        const hf = capa.img.naturalHeight;
        const i = fotogramaEn(capa.spr, tiempo);
        const estado = estadoSpriteEn(capa.spr, tiempo);
        const spr = { ...capa.spr, espejo: estado.espejo };
        const plano = { x0, y0, w: dw, h: dh };
        pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, plano, tiempo));
        if (propio.repetir) {
          if (capa.mov?.x) {
            const p2 = { ...plano, x0: x0 - Math.sign(capa.mov.x) * 2 * w };
            pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
          }
          if (capa.mov?.y) {
            const p2 = { ...plano, y0: y0 - Math.sign(capa.mov.y) * 2 * h };
            pintarSprite(c, capa.img, spr, af, hf, i, cajaSprite(spr, af, hf, p2, tiempo));
          }
        }
        c.restore();
        if (rutaVisibleId === capa.id) guiaRuta = { spr, plano, tiempo };
        continue;
      }

      c.drawImage(capa.img, x0, y0, dw, dh);
      // Con bucle se pinta una segunda copia a un cuadro de distancia: es lo
      // que evita el hueco negro mientras la primera termina de salir.
      if (propio.repetir) {
        if (capa.mov?.x) c.drawImage(capa.img, x0 - Math.sign(capa.mov.x) * 2 * w, y0, dw, dh);
        if (capa.mov?.y) c.drawImage(capa.img, x0, y0 - Math.sign(capa.mov.y) * 2 * h, dw, dh);
      }
      c.restore();
    }
    // Guía solo en la vista previa. Nunca entra al PNG ni al ZIP.
    if (guiaRuta) pintarGuiaRuta(c, guiaRuta.spr, guiaRuta.plano, guiaRuta.tiempo);
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
      const x0 = -(dw - out.width) / 2, y0 = -(dh - out.height) / 2;
      c.globalAlpha = capa.opacidad;
      if (capa.spr) {
        // Un PNG es un instante, así que del sprite se congela el primero.
        const af = capa.img.naturalWidth / capa.spr.fotogramas;
        const hf = capa.img.naturalHeight;
        if (spriteSigueCamara(capa.spr)) {
          const plano = { x0, y0, w: dw, h: dh };
          const spr = { ...capa.spr, espejo: estadoSpriteEn(capa.spr, 0).espejo };
          pintarSprite(c, capa.img, spr, af, hf, 0, cajaSprite(spr, af, hf, plano));
        } else {
          const spr = {
            ...capa.spr,
            alto: capa.spr.alto * capa.escala,
            espejo: estadoSpriteEn(capa.spr, 0).espejo,
          };
          const plano = { x0: 0, y0: 0, w: out.width, h: out.height };
          pintarSprite(c, capa.img, spr, af, hf, 0, cajaSprite(spr, af, hf, plano));
        }
        continue;
      }
      c.drawImage(capa.img, x0, y0, dw, dh);
    }
    const b = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (b) bajar(b, "montaje.png");
  }

  function anadirACola() {
    const p = pasoPorDefecto({ ...borrador, id: `p${++pasoSeq}` });
    setCola((c) => [...c, p]);
    setAviso(`Añadido: ${nombreMov(p)} · dist ${p.distancia}% · ${(p.durMs / 1000).toFixed(1)}s`);
  }

  function updPaso(id: string, patch: Partial<PasoSecuencia>) {
    setCola((cs) => cs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function iniciarSecuencia() {
    if (!cola.length) return;
    encima.current = false;
    retenerPoseRef.current = false;
    // Siempre desde el inicio fijado, con los fundidos limpios: así la misma
    // cola da el mismo resultado las veces que se le dé.
    estadoRef.current = { ...clonarEstado(inicioRef.current), alpha: {} };
    inicioRef.current = clonarEstado(estadoRef.current);
    pasoActivoRef.current = 0;
    setPasoActivo(0);
    planificar();
    // La cámara y todos los recorridos A→B comparten fotograma cero.
    relojRef.current = performance.now();
    reiniciarSpritesSincronizados();
    refrescarRelojes((n) => n + 1);
    setEnSecuencia(true);
    setMoviendo(true);
    anotarPose();
    setAviso(`Reproduciendo (${cola.length} pasos). Al acabar vuelve al inicio.`);
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
    inicioRef.current = estadoNeutro();
    retenerPoseRef.current = false;
    pasoMsRef.current = 0;
    relojRef.current = performance.now();
    reiniciarSpritesSincronizados();
    refrescarRelojes((n) => n + 1);
    setPose({ ox: 0, oy: 0, avance: 0 });
    setAviso("Cámara al centro. La animación vuelve a empezar desde aquí.");
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
          Descargar todo · ZIP
        </button>
        <label className={`btn-ghost cursor-pointer text-xs ${busyZip ? "pointer-events-none opacity-50" : ""}`}>
          {busyZip === "subir" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <FolderOpen className="h-3.5 w-3.5 text-accent" />}
          Importar todo
          <input
            type="file" accept=".zip,application/zip" className="hidden"
            onChange={(e) => { void importarZip(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
        </label>
        <button onClick={() => {
          relojesSpriteRef.current.clear();
          setRutaVisibleId(null);
          setCapas([]);
          setAviso("Vacío.");
        }} disabled={!capas.length} className="btn-ghost text-xs text-danger">
          <Trash2 className="h-3.5 w-3.5" /> Vaciar
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card space-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="label">Capas</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{capas.length}</span>
          </div>
          {!!capas.length && (
            <p className="text-[10px] text-muted">
              Orden visual: arriba queda detrás; abajo queda delante. La profundidad solo controla el paralaje.
            </p>
          )}
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
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted hover:text-fg disabled:opacity-30" title="Mover detrás" aria-label={`Mover ${c.nombre} detrás`}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === capas.length - 1} className="text-muted hover:text-fg disabled:opacity-30" title="Mover delante" aria-label={`Mover ${c.nombre} delante`}><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => upd(c.id, { visible: !c.visible })} className="text-muted hover:text-fg">
                  {c.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => {
                  relojesSpriteRef.current.delete(c.id);
                  if (rutaVisibleId === c.id) setRutaVisibleId(null);
                  setCapas((cs) => cs.filter((x) => x.id !== c.id));
                }} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
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
              {c.spr && (
                <MandosSprite
                  spr={c.spr}
                  mov={c.mov}
                  onSpr={(p) => upd(c.id, { spr: { ...c.spr!, ...p } })}
                  onMov={(m) => upd(c.id, { mov: m })}
                  onAtras={() => mover(i, -1)}
                  onAdelante={() => mover(i, 1)}
                  puedeAtras={i > 0}
                  puedeAdelante={i < capas.length - 1}
                  corriendo={spriteCorriendo(c.id)}
                  rutaVisible={rutaVisibleId === c.id}
                  onReproducir={() => reproducirSprite(c.id)}
                  onPausar={() => pausarSprite(c.id)}
                  onReiniciar={() => reiniciarSprite(c.id)}
                  onRutaVisible={(visible) => setRutaVisibleId(visible ? c.id : null)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {/* La vista previa, arriba y pegada. Antes vivía debajo de toda la
              cola: para tocar un paso había que bajar, y se editaba a ciegas.
              Ahora se queda a la vista mientras se ajusta lo de abajo. */}
          {/* Pegada solo a partir de tablet. En un móvil la pantalla no da para
              tener la vista previa fija Y los controles: se comía los botones de
              abajo y no se podía ni añadir un paso a la cola. */}
          <div className="z-10 space-y-2 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/40 sm:sticky sm:top-2">
            <div
              ref={caja}
              // «touch-none» es lo que hace que en el móvil se pueda arrastrar:
              // sin ello el navegador se queda el gesto para desplazar la página
              // y el dedo no mueve nada.
              className={`touch-none overflow-hidden rounded-lg border border-border bg-black ${
                enSecuencia ? "" : arrastrando ? "cursor-grabbing" : "cursor-grab"
              }`}
              // Colocar la cámara a mano: se arrastra la escena y cada capa se
              // mueve con su paralaje, así que se ve dónde va a quedar todo
              // ANTES de animar. Es la única forma de decir «empieza desde
              // abajo»: con los números a ciegas no hay manera de acertar.
              onPointerDown={(e) => {
                if (enSecuencia || !capas.length) return;
                dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                // Envuelto porque puede lanzar si el puntero ya se soltó, y una
                // excepción aquí dejaría el arrastre a medias.
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                encima.current = false;
                // Con dos dedos se pellizca: se deja de arrastrar y se mide la
                // separación, que en el móvil es el único gesto de zoom que hay.
                if (dedos.current.size >= 2) {
                  arrastreRef.current = null;
                  pellizcoRef.current = separacionDedos();
                } else {
                  arrastreRef.current = { x: e.clientX, y: e.clientY };
                }
                setArrastrando(true);
                // Al empezar a mover, la pose manda sobre el idle.
                retenerPoseRef.current = true;
              }}
              onPointerMove={(e) => {
                if (dedos.current.has(e.pointerId)) {
                  dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                }
                if (pellizcoRef.current !== null && dedos.current.size >= 2) {
                  const d = separacionDedos();
                  if (d > 0 && pellizcoRef.current > 0) {
                    // Cada 6% de separación, un paso de acercamiento.
                    const razon = d / pellizcoRef.current;
                    if (Math.abs(razon - 1) > 0.06) {
                      acercarPose(razon > 1 ? 1 : -1);
                      pellizcoRef.current = d;
                    }
                  }
                  return;
                }
                if (arrastreRef.current) {
                  const r = e.currentTarget.getBoundingClientRect();
                  const dx = (e.clientX - arrastreRef.current.x) / r.width;
                  const dy = (e.clientY - arrastreRef.current.y) / r.height;
                  arrastreRef.current = { x: e.clientX, y: e.clientY };
                  moverPose(dx, dy);
                  return;
                }
                if (enSecuencia || retenerPoseRef.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                raton.current = {
                  x: ((e.clientX - r.left) / r.width - 0.5) * 2,
                  y: ((e.clientY - r.top) / r.height - 0.5) * 2,
                };
                encima.current = true;
              }}
              onPointerUp={(e) => {
                dedos.current.delete(e.pointerId);
                if (dedos.current.size < 2) pellizcoRef.current = null;
                if (!dedos.current.size) {
                  arrastreRef.current = null;
                  setArrastrando(false);
                }
              }}
              onPointerCancel={(e) => {
                dedos.current.delete(e.pointerId);
                if (!dedos.current.size) { arrastreRef.current = null; setArrastrando(false); }
              }}
              onPointerLeave={() => { encima.current = false; }}
              // Con el foco puesto, las flechas del teclado colocan la toma.
              tabIndex={0}
              onKeyDown={(e) => {
                if (enSecuencia || !capas.length) return;
                const salto = e.shiftKey ? 0.14 : 0.05;
                const mapa: Record<string, () => void> = {
                  ArrowUp: () => moverPose(0, salto),
                  ArrowDown: () => moverPose(0, -salto),
                  ArrowLeft: () => moverPose(salto, 0),
                  ArrowRight: () => moverPose(-salto, 0),
                  "+": () => acercarPose(1),
                  "=": () => acercarPose(1),
                  "-": () => acercarPose(-1),
                };
                const f = mapa[e.key];
                if (!f) return;
                e.preventDefault();
                retenerPoseRef.current = true;
                f();
              }}
              // La rueda acerca y aleja: es el gesto que todo el mundo espera y
              // deja poner la profundidad de arranque sin teclear nada.
              onWheel={(e) => {
                if (enSecuencia || !capas.length) return;
                e.preventDefault();
                retenerPoseRef.current = true;
                acercarPose(e.deltaY < 0 ? 1 : -1);
              }}
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
                    title={`${i + 1}. ${nombreMov(q)}`}
                    style={{ flexGrow: q.durMs }}
                    className={`h-1 rounded-full ${enSecuencia && i === pasoActivo ? "bg-brand" : i < pasoActivo ? "bg-accent/50" : "bg-border"}`}
                  />
                ))}
              </div>
            )}
            {/* Colocar la toma a mano. Aquí y no abajo del todo porque se usa
                MIRANDO la vista previa: es un «déjalo así». */}
            <div className="flex flex-wrap items-center gap-2">
              <Palanca
                etiqueta="Palanca: empuja para colocar la toma"
                disabled={enSecuencia || !capas.length}
                onMover={(dx, dy) => { retenerPoseRef.current = true; moverPose(dx, dy); }}
              />
              <div className="flex flex-col gap-1">
                <Flecha etiqueta="Acercar" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; acercarPose(1); }}><ZoomIn className="h-4 w-4" /></Flecha>
                <Flecha etiqueta="Alejar" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; acercarPose(-1); }}><ZoomOut className="h-4 w-4" /></Flecha>
              </div>

              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip bg-surface-2 text-[10px] tabular-nums text-muted">
                    X {pose.ox >= 0 ? "+" : ""}{pose.ox.toFixed(2)} ·
                    Y {pose.oy >= 0 ? "+" : ""}{pose.oy.toFixed(2)} ·
                    {" "}{escalaPerspectiva(pose.avance, 1).toFixed(2)}×
                  </span>
                  <span className="chip bg-brand/15 text-[10px] text-brand">inicio de la animación</span>
                </div>
                {/* Todas las formas de hacerlo, dichas. Arrastrar la escena es
                    la más cómoda y era justo la que no se veía por ningún lado. */}
                <span className="text-[10px] leading-relaxed text-muted">
                  <b className="text-fg">Arrastra la escena</b> con el ratón o el dedo · empuja la
                  <b className="text-fg"> palanca</b> · <b className="text-fg">flechas</b> del teclado
                  (Shift = más) · <b className="text-fg">rueda</b> o <b className="text-fg">pellizco</b> para
                  acercar. Donde la dejes es donde <b className="text-fg">empieza y vuelve</b> la animación.
                </span>
                <button
                  type="button" onClick={tomarPose} disabled={enSecuencia || !capas.length}
                  className="btn-ghost w-fit text-[10px] disabled:opacity-40"
                  title="El paso que estás preparando arrancará justo desde aquí"
                >
                  <Crosshair className="h-3 w-3 text-accent" /> Usar en el paso
                </button>
              </div>

              {/* Las flechas sueltas, para quien esté en el ordenador y prefiera
                  dar toques exactos en vez de empujar la palanca. */}
              <div className="hidden grid-cols-3 gap-0.5 sm:grid">
                <span />
                <Flecha etiqueta="Subir la toma" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; moverPose(0, 0.05); }}><ArrowUp className="h-3.5 w-3.5" /></Flecha>
                <span />
                <Flecha etiqueta="Mover a la izquierda" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; moverPose(0.05, 0); }}><ArrowLeft className="h-3.5 w-3.5" /></Flecha>
                <Flecha etiqueta="Bajar la toma" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; moverPose(0, -0.05); }}><ArrowDown className="h-3.5 w-3.5" /></Flecha>
                <Flecha etiqueta="Mover a la derecha" disabled={enSecuencia || !capas.length}
                  onPulsa={() => { retenerPoseRef.current = true; moverPose(-0.05, 0); }}><ArrowRight className="h-3.5 w-3.5" /></Flecha>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted">
                Fuerza
                <RangoPreciso valor={fuerza} min={0} max={100} paso={1}
                  onCambio={setFuerza} etiqueta="fuerza" />
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
                  onChange={(e) => setBorrador((b) => {
                    const mov = e.target.value as MovCola;
                    return {
                      ...b,
                      mov,
                      // Si el segundo ya no pega con el nuevo primero, se quita:
                      // dejarlo sería guardar una combinación que se ignora.
                      mov2: b.mov2 && seCombinan(mov, b.mov2) ? b.mov2 : undefined,
                      fade: mov === "atravesar" && b.fade === "nada" ? "desaparecer" : b.fade,
                      fadeCapa: mov === "atravesar" && b.fadeCapa === "ninguna" ? "frente" : b.fadeCapa,
                    };
                  })}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia}
                >
                  {MOV_COLA.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              {/* Dos movimientos a la vez en el mismo tramo. Solo salen los de
                  OTRO eje: subir mientras te acercas sí, subir y bajar no. */}
              <label className="min-w-[9rem] flex-1 text-[11px] text-muted">
                Y a la vez
                <select
                  value={borrador.mov2 ?? ""}
                  onChange={(e) => setBorrador((b) => ({
                    ...b, mov2: (e.target.value || undefined) as MovCola | undefined,
                  }))}
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  disabled={enSecuencia || !segundosPosibles(borrador.mov).length}
                >
                  <option value="">— nada más —</option>
                  {MOV_COLA.filter((o) => seCombinan(borrador.mov, o.id)).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <Num
                etiqueta="Segundos" valor={segsBorrador} min={0.8} max={30} paso={0.5}
                sufijo="s" disabled={enSecuencia}
                onCambio={(v) => setBorrador((b) => ({ ...b, durMs: Math.round(v * 1000) }))}
              />
              <Num
                etiqueta="Distancia" valor={borrador.distancia} min={5} max={100} paso={5}
                sufijo="%" disabled={enSecuencia}
                onCambio={(v) => setBorrador((b) => ({ ...b, distancia: Math.round(v) }))}
              />
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
              <div className="flex flex-wrap items-end gap-2">
                <Num etiqueta="Inicio X" valor={borrador.inicioOx} min={-2.5} max={2.5} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioOx: v }))} disabled={enSecuencia} />
                <Num etiqueta="Inicio Y" valor={borrador.inicioOy} min={-2.5} max={2.5} paso={0.05}
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioOy: v }))} disabled={enSecuencia} />
                <Num etiqueta="Inicio zoom" valor={borrador.inicioZoom} min={0.6} max={2.5} paso={0.05}
                  // A mano manda el zoom: se borra el avance guardado por el
                  // ratón para que no le pise lo que se acaba de teclear.
                  onCambio={(v) => setBorrador((b) => ({ ...b, inicioZoom: v, inicioAvance: undefined }))}
                  disabled={enSecuencia} />
                <button
                  type="button" onClick={tomarPose} disabled={enSecuencia || !capas.length}
                  className="btn-ghost text-[10px] disabled:opacity-40"
                >
                  <Move className="h-3 w-3 text-accent" /> Tomar la de la vista previa
                </button>
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
                  onClick={() => { setCola([]); pararSecuencia(); retenerPoseRef.current = false; estadoRef.current = clonarEstado(inicioRef.current); }}
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
                const label = nombreMov(p);
                const on = enSecuencia && i === pasoActivo;
                const fadeTxt = p.fade !== "nada" && p.fadeCapa !== "ninguna"
                  ? ` · ${p.fade === "aparecer" ? "aparece" : "desaparece"} ${p.fadeCapa === "frente" ? "frente" : (capas.find((c) => c.id === p.fadeCapa)?.nombre ?? "capa")}`
                  : (p.mov === "atravesar" || p.mov2 === "atravesar") ? " · fade frente" : "";
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
                        <Num
                          etiqueta="Dist" valor={p.distancia} min={5} max={100} paso={5}
                          sufijo="%" ancho="w-12"
                          onCambio={(v) => updPaso(p.id, { distancia: Math.round(v) })}
                        />
                        <Num
                          etiqueta="Dura" valor={p.durMs / 1000} min={0.8} max={30} paso={0.5}
                          sufijo="s" ancho="w-12"
                          onCambio={(v) => updPaso(p.id, { durMs: Math.round(v * 1000) })}
                        />
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

/**
 * Palanca tipo mando, para colocar la toma con el dedo.
 *
 * En el móvil no hay rueda ni teclado, y los botoncitos de flecha son
 * imposibles de acertar. Con esto se empuja hacia donde sea y la cámara va
 * sola mientras se mantenga: cuanto más se separa del centro, más rápido.
 * Funciona igual con el ratón, así que no hay dos caminos que mantener.
 */
function Palanca({ onMover, disabled, etiqueta }: {
  onMover: (dx: number, dy: number) => void;
  disabled?: boolean;
  etiqueta: string;
}) {
  const R = 30;
  const caja = useRef<HTMLDivElement>(null);
  const vec = useRef({ x: 0, y: 0 });
  const lazo = useRef<number | null>(null);
  const [pomo, setPomo] = useState({ x: 0, y: 0 });

  const parar = () => {
    if (lazo.current !== null) cancelAnimationFrame(lazo.current);
    lazo.current = null;
    vec.current = { x: 0, y: 0 };
    setPomo({ x: 0, y: 0 });
  };
  useEffect(() => parar, []);

  const apuntar = (e: React.PointerEvent) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / R) / d;   // dirección, con módulo de 0 a 1
    vec.current = { x: dx * k, y: dy * k };
    setPomo({ x: vec.current.x * R, y: vec.current.y * R });
  };

  return (
    <div
      ref={caja}
      role="application"
      aria-label={etiqueta}
      title={etiqueta}
      className={`relative shrink-0 touch-none rounded-full border border-border bg-surface-2/70 ${
        disabled ? "opacity-40" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{ width: R * 2 + 12, height: R * 2 + 12 }}
      onPointerDown={(e) => {
        if (disabled) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        apuntar(e);
        if (lazo.current === null) {
          const tic = () => {
            // Empujar la palanca ARRIBA tiene que subir la toma, o sea llevar
            // la escena hacia abajo: por eso el signo va cambiado.
            onMover(-vec.current.x * 0.014, -vec.current.y * 0.014);
            lazo.current = requestAnimationFrame(tic);
          };
          lazo.current = requestAnimationFrame(tic);
        }
      }}
      onPointerMove={(e) => { if (lazo.current !== null) apuntar(e); }}
      onPointerUp={parar}
      onPointerCancel={parar}
      onLostPointerCapture={parar}
    >
      <span className="pointer-events-none absolute inset-0 m-auto h-px w-4 self-center bg-border" style={{ top: "50%" }} />
      <span
        className="pointer-events-none absolute rounded-full bg-accent/80 shadow"
        style={{
          width: 20, height: 20,
          left: `calc(50% - 10px + ${pomo.x}px)`,
          top: `calc(50% - 10px + ${pomo.y}px)`,
        }}
      />
    </div>
  );
}

/**
 * Botón de flecha que repite mientras se mantiene pulsado.
 *
 * Un clic por cada 6% de cuadro sería un martilleo para cruzar la escena; con
 * mantener pulsado se coloca la toma de un tirón, que es como se usa esto.
 */
function Flecha({ etiqueta, onPulsa, disabled, children }: {
  etiqueta: string; onPulsa: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  const timers = useRef<{ retardo?: ReturnType<typeof setTimeout>; repite?: ReturnType<typeof setInterval> }>({});
  const parar = () => {
    if (timers.current.retardo) clearTimeout(timers.current.retardo);
    if (timers.current.repite) clearInterval(timers.current.repite);
    timers.current = {};
  };
  useEffect(() => parar, []);
  return (
    <button
      type="button" disabled={disabled} title={etiqueta} aria-label={etiqueta}
      onPointerDown={() => {
        if (disabled) return;
        onPulsa();
        timers.current.retardo = setTimeout(() => {
          timers.current.repite = setInterval(onPulsa, 40);
        }, 300);
      }}
      onPointerUp={parar}
      onPointerLeave={parar}
      className="rounded border border-border p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Campo numérico que se deja escribir.
 *
 * El de antes recortaba al rango EN CADA TECLA sobre un valor controlado: al
 * borrarlo saltaba solo a un número, escribir «12» pasaba por «1» y se comía el
 * primer dígito, y no había manera de dejarlo vacío para teclear otra cosa.
 * Aquí se guarda lo tecleado tal cual mientras se escribe y solo se recorta al
 * salir del campo, que es cuando ya se sabe lo que quería poner. Y con ± para
 * no tener que teclear.
 */
function Num({ etiqueta, valor, min, max, paso, onCambio, disabled, sufijo, ancho = "w-20" }: {
  etiqueta: string; valor: number; min: number; max: number; paso: number;
  onCambio: (v: number) => void; disabled?: boolean; sufijo?: string; ancho?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const acotar = (v: number) => Math.max(min, Math.min(max, v));
  // Decimales según el paso, para que 0.5 no acabe en 4.300000000000001.
  const limpio = (v: number) => String(Number(v.toFixed(paso < 1 ? 2 : 0)));
  const empujar = (d: number) => { setTexto(null); onCambio(acotar(valor + d * paso)); };

  return (
    <label className={`text-[11px] text-muted ${disabled ? "opacity-50" : ""}`}>
      {etiqueta}
      <span className="mt-0.5 flex items-center gap-0.5">
        <button
          type="button" disabled={disabled || valor <= min} onClick={() => empujar(-1)}
          className="rounded border border-border px-1.5 py-1 leading-none hover:bg-surface-2 disabled:opacity-30"
          aria-label={`Bajar ${etiqueta}`}
        >−</button>
        <input
          type="text" inputMode="decimal" disabled={disabled}
          value={texto ?? limpio(valor)}
          onChange={(e) => {
            const t = e.target.value;
            setTexto(t);
            // Se avisa en cuanto lo escrito es un número válido, para que la
            // vista previa responda mientras se teclea; lo que no vale se deja
            // en pantalla sin tocar el valor.
            const n = Number(t.replace(",", "."));
            if (t.trim() !== "" && Number.isFinite(n)) onCambio(acotar(n));
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setTexto(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setTexto(null); e.currentTarget.blur(); }
            if (e.key === "ArrowUp") { e.preventDefault(); empujar(1); }
            if (e.key === "ArrowDown") { e.preventDefault(); empujar(-1); }
          }}
          className={`input ${ancho} py-1 text-center text-[11px] tabular-nums`}
        />
        <button
          type="button" disabled={disabled || valor >= max} onClick={() => empujar(1)}
          className="rounded border border-border px-1.5 py-1 leading-none hover:bg-surface-2 disabled:opacity-30"
          aria-label={`Subir ${etiqueta}`}
        >+</button>
        {sufijo && <span className="ml-0.5 text-[10px] opacity-70">{sufijo}</span>}
      </span>
    </label>
  );
}

/** Dibuja A, destinos, pausas y posición viva sin contaminar ninguna exportación. */
function pintarGuiaRuta(c: CanvasRenderingContext2D, spr: SpriteEnCapa, plano: Plano, tiempo: number) {
  if (!spr.trayectoria && !spr.ruta?.pasos.length) return;
  const puntos: { x: number; y: number; etiqueta: string; pausas: number[] }[] = [
    { x: spr.x, y: spr.y, etiqueta: "A", pausas: [] },
  ];
  if (spr.ruta?.pasos.length) {
    spr.ruta.pasos.forEach((paso, i) => {
      if (paso.tipo === "mover") {
        const previo = puntos[puntos.length - 1];
        puntos.push({
          x: paso.x ?? previo.x,
          y: paso.y ?? previo.y,
          etiqueta: String(i + 1),
          pausas: [],
        });
      } else {
        puntos[puntos.length - 1].pausas.push(paso.segundos);
      }
    });
  } else if (spr.trayectoria) {
    puntos.push({ x: spr.trayectoria.x, y: spr.trayectoria.y, etiqueta: "B", pausas: [] });
  }

  const px = (x: number) => plano.x0 + x * plano.w;
  const py = (y: number) => plano.y0 + y * plano.h;
  const u = Math.max(1, Math.min(2.5, plano.w / 850));
  c.save();
  c.globalAlpha = 0.92;
  c.lineWidth = 2 * u;
  c.strokeStyle = "#22d3c5";
  c.setLineDash([7 * u, 5 * u]);
  c.beginPath();
  puntos.forEach((p, i) => {
    if (i) c.lineTo(px(p.x), py(p.y));
    else c.moveTo(px(p.x), py(p.y));
  });
  c.stroke();
  if (spr.ruta?.bucle && puntos.length > 1) {
    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];
    if (primero.x !== ultimo.x || primero.y !== ultimo.y) {
      c.strokeStyle = "#f59e0b";
      c.setLineDash([2 * u, 7 * u]);
      c.beginPath();
      c.moveTo(px(ultimo.x), py(ultimo.y));
      c.lineTo(px(primero.x), py(primero.y));
      c.stroke();
    }
  }

  c.setLineDash([]);
  c.font = `600 ${11 * u}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const p of puntos) {
    const x = px(p.x), y = py(p.y);
    c.fillStyle = "#071415";
    c.strokeStyle = "#5eead4";
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(x, y, 9 * u, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#ccfbf1";
    c.fillText(p.etiqueta, x, y + 0.5 * u);
    if (p.pausas.length) {
      c.fillStyle = "rgba(7,20,21,.9)";
      c.fillRect(x + 11 * u, y - 10 * u, 44 * u, 17 * u);
      c.fillStyle = "#fbbf24";
      c.textAlign = "left";
      c.fillText(`⏸ ${p.pausas.reduce((a, b) => a + b, 0).toFixed(1)}s`, x + 14 * u, y - 1 * u);
      c.textAlign = "center";
    }
  }

  const actual = estadoSpriteEn(spr, tiempo);
  c.strokeStyle = "#fb923c";
  c.lineWidth = 3 * u;
  c.beginPath();
  c.arc(px(actual.x), py(actual.y), 14 * u, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

function Barra({ etiqueta, valor, min = 0, max, paso, onCambio, formato }: {
  etiqueta: string; valor: number; min?: number; max: number; paso: number;
  onCambio: (v: number) => void; formato: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="w-16 shrink-0">{etiqueta}</span>
      <RangoPreciso valor={valor} min={min} max={max} paso={paso}
        onCambio={onCambio} etiqueta={etiqueta} />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}

/**
 * Los mandos de una capa que es un sprite.
 *
 * Un sprite recién metido cae en el centro y a un quinto de alto, que casi
 * nunca es donde va. Sin sitio, tamaño y sentido de la marcha, la biblioteca
 * serviría para mirar los bichos y para nada más.
 *
 * Lo de «cruza» está aquí y no en un panel de movimiento aparte porque es lo
 * que se quiere el 90% de las veces: un pájaro entra por un lado y sale por el
 * otro. Los demás movimientos se afinan luego, con el resto de la escena.
 */
function MandosSprite({
  spr, mov, onSpr, onMov, onAtras, onAdelante, puedeAtras, puedeAdelante,
  corriendo, rutaVisible, onReproducir, onPausar, onReiniciar, onRutaVisible,
}: {
  spr: SpriteEnCapa;
  mov?: MovCapa;
  onSpr: (p: Partial<SpriteEnCapa>) => void;
  onMov: (m: MovCapa | undefined) => void;
  onAtras: () => void;
  onAdelante: () => void;
  puedeAtras: boolean;
  puedeAdelante: boolean;
  corriendo: boolean;
  rutaVisible: boolean;
  onReproducir: () => void;
  onPausar: () => void;
  onReiniciar: () => void;
  onRutaVisible: (visible: boolean) => void;
}) {
  const modo = spr.ruta ? "ruta" : spr.trayectoria ? "trayectoria" : (mov?.tipo ?? "");
  const [pasoAbierto, setPasoAbierto] = useState<number | null>(0);

  function guardarPasos(pasos: PasoRutaSprite[]) {
    onSpr({ ruta: { ...spr.ruta!, pasos } });
  }

  function cambiarPaso(i: number, patch: Partial<PasoRutaSprite>) {
    guardarPasos(spr.ruta!.pasos.map((p, j) => (i === j ? { ...p, ...patch } : p)));
  }

  function moverPaso(i: number, d: -1 | 1) {
    const j = i + d;
    if (!spr.ruta || j < 0 || j >= spr.ruta.pasos.length) return;
    const pasos = [...spr.ruta.pasos];
    [pasos[i], pasos[j]] = [pasos[j], pasos[i]];
    guardarPasos(pasos);
  }

  function ultimoDestino() {
    let x = spr.x;
    let y = spr.y;
    for (const p of spr.ruta?.pasos ?? []) {
      if (p.tipo === "mover") { x = p.x ?? x; y = p.y ?? y; }
    }
    return { x, y };
  }

  function destinoAntes(i: number) {
    let x = spr.x;
    let y = spr.y;
    for (const p of spr.ruta?.pasos.slice(0, i) ?? []) {
      if (p.tipo === "mover") { x = p.x ?? x; y = p.y ?? y; }
    }
    return { x, y };
  }

  function elegirMovimiento(t: string) {
    if (!t) {
      onSpr({ trayectoria: undefined, ruta: undefined });
      onMov(undefined);
      onRutaVisible(false);
      return;
    }
    if (t === "trayectoria") {
      onMov(undefined);
      onSpr({
        ruta: undefined,
        trayectoria: {
          x: spr.x < 0.9 ? 1.2 : -0.2,
          y: spr.y,
          segundos: 4,
        },
      });
      onRutaVisible(true);
      onReiniciar();
      return;
    }
    if (t === "ruta") {
      const bx = spr.x < 0.9 ? 1.2 : -0.2;
      onMov(undefined);
      onSpr({
        trayectoria: undefined,
        ruta: {
          bucle: true,
          pasos: [
            { tipo: "mover", x: bx, y: spr.y, segundos: 4, espejo: bx < spr.x },
            { tipo: "pausa", segundos: 1, espejo: bx < spr.x },
            { tipo: "mover", x: spr.x, y: spr.y, segundos: 4, espejo: bx >= spr.x },
          ],
        },
      });
      onRutaVisible(true);
      onReiniciar();
      return;
    }
    onSpr({ trayectoria: undefined, ruta: undefined });
    onRutaVisible(false);
    // Valores de salida que ya se ven bien: un pájaro que cruza en unos ocho
    // segundos, o un balanceo corto. Luego se afinan aquí mismo.
    if (t === "deriva") onMov({ tipo: "deriva", x: 0.12, y: 0, bucle: true });
    else onMov({ tipo: t as MovCapa["tipo"], amplitud: 0.04, segundos: 3.5 });
    onReiniciar();
  }

  return (
    <div className="space-y-1.5 rounded-md border border-accent/25 bg-accent/5 p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-accent">
          Sprite · {spr.fotogramas} fotogramas
        </span>
        <button
          type="button"
          onClick={() => onSpr({ espejo: !spr.espejo })}
          className={`ml-auto rounded border px-1 py-0.5 text-[9px] ${
            spr.espejo ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
          }`}
          title="Mirar al otro lado"
        >
          ⇄ espejo
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <button type="button" onClick={onReproducir} disabled={corriendo}
          className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35" title="Reproducir este sprite">
          <Play className="h-3 w-3" /> Play
        </button>
        <button type="button" onClick={onPausar} disabled={!corriendo}
          className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35" title="Detener este sprite donde está">
          <Square className="h-3 w-3" /> Stop
        </button>
        <button type="button" onClick={onReiniciar}
          className="btn-ghost justify-center px-1 py-1 text-[9px]" title="Volver al punto A y reproducir">
          <RotateCcw className="h-3 w-3" /> Desde A
        </button>
        <button type="button" onClick={() => onRutaVisible(!rutaVisible)}
          disabled={!spr.trayectoria && !spr.ruta}
          className={`btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35 ${rutaVisible ? "border-accent text-accent" : ""}`}
          title="Mostrar puntos y recorrido en la vista">
          <MapPinned className="h-3 w-3" /> Ruta
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="w-16 shrink-0">Se ancla a</span>
        <select
          className="input min-w-0 flex-1 py-0.5 text-[10px]"
          value={spr.espacio === "pantalla" ? "pantalla" : "capa"}
          onChange={(e) => onSpr({ espacio: e.target.value as SpriteEnCapa["espacio"] })}
        >
          <option value="pantalla">Lienzo · independiente de cámara</option>
          <option value="capa">Su capa · sigue las transiciones</option>
        </select>
      </label>
      <p className="text-[9px] leading-snug text-muted">
        {spr.espacio === "pantalla"
          ? "Su ruta no cambia con paneos, zooms ni fundidos de cámara."
          : "Hereda cámara y profundidad: sirve si forma parte del decorado 2.5D."}
      </p>
      <Barra etiqueta={spr.trayectoria || spr.ruta ? "A · X" : "Izq · der"} valor={spr.x} min={-0.5} max={1.5} paso={0.01}
        onCambio={(v) => { onSpr({ x: v }); if (spr.trayectoria || spr.ruta) onReiniciar(); }} formato={(v) => v.toFixed(2)} />
      <Barra etiqueta={spr.trayectoria || spr.ruta ? "A · Y" : "Arr · abj"} valor={spr.y} min={-0.5} max={1.5} paso={0.01}
        onCambio={(v) => { onSpr({ y: v }); if (spr.trayectoria || spr.ruta) onReiniciar(); }} formato={(v) => v.toFixed(2)} />
      <Barra etiqueta="Tamaño" valor={spr.alto} min={0.01} max={2} paso={0.01}
        onCambio={(v) => onSpr({ alto: v })} formato={(v) => `${Math.round(v * 100)}%`} />
      <Barra etiqueta="Velocidad" valor={spr.fps} min={1} max={30} paso={1}
        onCambio={(v) => onSpr({ fps: Math.round(v) })} formato={(v) => `${v}/s`} />
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="w-16 shrink-0">Se mueve</span>
        <select
          className="input min-w-0 flex-1 py-0.5 text-[10px]"
          value={modo}
          onChange={(e) => elegirMovimiento(e.target.value)}
        >
          <option value="">— quieto en su sitio —</option>
          <option value="trayectoria">Punto A → punto B</option>
          <option value="ruta">Ruta por pasos · mover, pausar y volver</option>
          {MOVS_CAPA.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      {(spr.trayectoria || spr.ruta) && (
        <label className="flex items-center gap-1 text-[9px] text-muted">
          <input type="checkbox" checked={spr.sincronizar !== false}
            onChange={(e) => onSpr({ sincronizar: e.target.checked })} />
          Reiniciar junto con la cámara y sus transiciones
        </label>
      )}
      {spr.trayectoria && (
        <div className="space-y-1 rounded border border-border/70 bg-surface/40 p-1">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-fg">Destino B</span>
            <button
              type="button"
              onClick={() => {
                const b = spr.trayectoria!;
                onSpr({
                  x: b.x,
                  y: b.y,
                  trayectoria: { ...b, x: spr.x, y: spr.y },
                });
                onReiniciar();
              }}
              className="ml-auto rounded border border-border px-1 py-0.5 text-[9px] text-muted hover:text-fg"
              title="Intercambiar punto A y punto B"
            >
              ⇄ intercambiar A/B
            </button>
          </div>
          <Barra etiqueta="B · X" valor={spr.trayectoria.x} min={-0.5} max={1.5} paso={0.01}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, x: v } }); onReiniciar(); }}
            formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="B · Y" valor={spr.trayectoria.y} min={-0.5} max={1.5} paso={0.01}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, y: v } }); onReiniciar(); }}
            formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="Duración" valor={spr.trayectoria.segundos} min={0.2} max={30} paso={0.1}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, segundos: v } }); onReiniciar(); }}
            formato={(v) => `${v.toFixed(1)}s`} />
          <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!spr.trayectoria.bucle}
                onChange={(e) => {
                  onSpr({ trayectoria: { ...spr.trayectoria!, bucle: e.target.checked } });
                  onReiniciar();
                }}
              />
              Repetir recorrido
            </label>
            <button type="button" onClick={onReiniciar} className="ml-auto rounded border border-border px-1.5 py-0.5 hover:text-fg">
              Probar desde A
            </button>
          </div>
        </div>
      )}
      {spr.ruta && (
        <div className="space-y-1.5 rounded border border-accent/30 bg-surface/40 p-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-fg">Ruta por pasos</span>
            <span className="ml-auto text-[8px] text-muted">A es la posición inicial</span>
          </div>
          {spr.ruta.pasos.map((paso, i) => (
            <div key={i} className="space-y-1 rounded border border-border/70 bg-surface-2/45 p-1">
              <div className="flex items-center gap-1">
                <span className="chip bg-surface text-[8px] text-muted">{i + 1}</span>
                <select
                  className="input min-w-0 flex-1 py-0.5 text-[9px]"
                  value={paso.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as PasoRutaSprite["tipo"];
                    if (tipo === "pausa") cambiarPaso(i, { tipo: "pausa" });
                    else cambiarPaso(i, { tipo: "mover", ...destinoAntes(i) });
                  }}
                >
                  <option value="mover">Mover a un punto</option>
                  <option value="pausa">Detenerse aquí</option>
                </select>
                <button type="button" onClick={() => moverPaso(i, -1)} disabled={i === 0}
                  className="rounded border border-border p-0.5 text-muted disabled:opacity-25" aria-label="Subir paso">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => moverPaso(i, 1)} disabled={i === spr.ruta!.pasos.length - 1}
                  className="rounded border border-border p-0.5 text-muted disabled:opacity-25" aria-label="Bajar paso">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => guardarPasos(spr.ruta!.pasos.filter((_, j) => i !== j))}
                  disabled={spr.ruta!.pasos.length === 1}
                  className="rounded border border-border p-0.5 text-muted hover:text-danger disabled:opacity-25" aria-label="Borrar paso">
                  <Trash2 className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setPasoAbierto((v) => v === i ? null : i)}
                  className="rounded border border-border p-0.5 text-muted hover:text-fg"
                  aria-label={pasoAbierto === i ? "Cerrar ajustes del paso" : "Editar paso"}>
                  <ChevronDown className={`h-3 w-3 transition-transform ${pasoAbierto === i ? "rotate-180" : ""}`} />
                </button>
              </div>
              {pasoAbierto === i && (
                <div className="space-y-1 border-t border-border/50 pt-1">
                  {paso.tipo === "mover" && (
                    <>
                      <Barra etiqueta="Destino X" valor={paso.x ?? destinoAntes(i).x} min={-0.5} max={1.5} paso={0.01}
                        onCambio={(v) => cambiarPaso(i, { x: v })} formato={(v) => v.toFixed(2)} />
                      <Barra etiqueta="Destino Y" valor={paso.y ?? destinoAntes(i).y} min={-0.5} max={1.5} paso={0.01}
                        onCambio={(v) => cambiarPaso(i, { y: v })} formato={(v) => v.toFixed(2)} />
                    </>
                  )}
                  <Barra etiqueta={paso.tipo === "mover" ? "Duración" : "Espera"}
                    valor={paso.segundos} min={0.1} max={120} paso={0.1}
                    onCambio={(v) => cambiarPaso(i, { segundos: v })} formato={(v) => `${v.toFixed(1)}s`} />
                  <label className="flex items-center gap-1 text-[8px] text-muted">
                    <input type="checkbox" checked={paso.espejo ?? spr.espejo ?? false}
                      onChange={(e) => cambiarPaso(i, { espejo: e.target.checked })} />
                    Mirar al lado contrario durante este paso
                  </label>
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => {
              const p = ultimoDestino();
              guardarPasos([...spr.ruta!.pasos, {
                tipo: "mover", x: Math.min(1.5, p.x + 0.2), y: p.y, segundos: 2,
              }]);
            }} className="btn-ghost px-1.5 py-0.5 text-[8px]">
              <Plus className="h-3 w-3" /> Destino
            </button>
            <button type="button" onClick={() => guardarPasos([
              ...spr.ruta!.pasos, { tipo: "pausa", segundos: 1 },
            ])} className="btn-ghost px-1.5 py-0.5 text-[8px]">
              <Plus className="h-3 w-3" /> Pausa
            </button>
            <label className="ml-auto flex items-center gap-1 text-[8px] text-muted">
              <input type="checkbox" checked={!!spr.ruta.bucle}
                onChange={(e) => onSpr({ ruta: { ...spr.ruta!, bucle: e.target.checked } })} />
              Repetir ruta
            </label>
          </div>
          <p className="text-[8px] leading-snug text-muted">
            Stop congela el objeto para colocarlo. La línea y el punto actual se actualizan al mover cada control.
            Todo se guarda en <code>montaje.json</code> como <code>spr.ruta.pasos</code>, así que la IA también puede definirlo completo.
          </p>
        </div>
      )}
      {mov?.tipo === "deriva" && (
        <div className="space-y-1">
          <Barra etiqueta="Horizontal" valor={mov.x ?? 0} min={-1.5} max={1.5} paso={0.02}
            onCambio={(v) => onMov({ ...mov, x: v })}
            formato={(v) => (v === 0 ? "—" : `${v > 0 ? "→" : "←"}${Math.abs(v).toFixed(2)}`)} />
          <Barra etiqueta="Vertical" valor={mov.y ?? 0} min={-1.5} max={1.5} paso={0.02}
            onCambio={(v) => onMov({ ...mov, y: v })}
            formato={(v) => (v === 0 ? "—" : `${v > 0 ? "↓" : "↑"}${Math.abs(v).toFixed(2)}`)} />
          <label className="flex items-center gap-1 text-[9px] text-muted">
            <input type="checkbox" checked={mov.bucle !== false} onChange={(e) => onMov({ ...mov, bucle: e.target.checked })} />
            Reaparecer por el borde contrario
          </label>
        </div>
      )}
      {mov && mov.tipo !== "deriva" && (
        <div className="space-y-1">
          <Barra etiqueta="Amplitud" valor={mov.amplitud ?? 0.04} min={0.01} max={0.3} paso={0.01}
            onCambio={(v) => onMov({ ...mov, amplitud: v })} formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="Ciclo" valor={mov.segundos ?? 3.5} min={0.3} max={20} paso={0.1}
            onCambio={(v) => onMov({ ...mov, segundos: v })} formato={(v) => `${v.toFixed(1)}s`} />
        </div>
      )}
      <div className="flex items-center gap-1 border-t border-border/60 pt-1 text-[9px] text-muted">
        <span>Orden: quién lo tapa</span>
        <button type="button" onClick={onAtras} disabled={!puedeAtras}
          className="ml-auto rounded border border-border px-1.5 py-0.5 hover:text-fg disabled:opacity-30">
          ↑ detrás
        </button>
        <button type="button" onClick={onAdelante} disabled={!puedeAdelante}
          className="rounded border border-border px-1.5 py-0.5 hover:text-fg disabled:opacity-30">
          ↓ delante
        </button>
      </div>
    </div>
  );
}

/** «Derecha → + Acercarse», para que en la cola se vea que hace dos cosas. */
function nombreMov(p: { mov: MovCola; mov2?: MovCola }) {
  const uno = MOV_COLA.find((o) => o.id === p.mov)?.label ?? p.mov;
  if (!p.mov2) return uno;
  const dos = MOV_COLA.find((o) => o.id === p.mov2)?.label ?? p.mov2;
  return `${uno} + ${dos}`;
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
