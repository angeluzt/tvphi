"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Play, Pause, Crosshair, Download, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  Package, FolderOpen, Loader2, ListPlus, ListOrdered,
  Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut,
  MapPinned, Plus, RotateCcw, Square, Lock, LockOpen, ChevronsUp, ChevronsDown,
  Paintbrush, MoreHorizontal,
} from "lucide-react";
import { bajar } from "@/lib/lab/exportar";
import { bajarMontajeZip, leerMontajeZip } from "@/lib/lab/montaje-zip";
import { CROMA, prepararCapa } from "@/lib/lab/quitar-fondo";
import { desplazamientoCapa, normalizarMov, MOVS_CAPA, type MovCapa } from "@/lib/lab/movimiento-capa";
import { copiarPlanoBucle, moverPlano, planoCentrado } from "@/lib/lab/plano-movimiento";
import {
  cajaSprite, estadoSpriteEn, fotogramaEn, normalizarSprite, pintarSprite, spriteSigueCamara,
  type AnimLigada, type PasoRutaSprite, type Plano, type SpriteEnCapa,
} from "@/lib/lab/sprite-capa";
import { ajustarSpriteALaEscena, superficiesDeEscena } from "@/lib/lab/navegacion-escena";
import type { Escena, SuperficieNavegable } from "@/lib/lab/escena";
import {
  ANIM_OPCIONES, MOV_COLA, vistaAnim, estadoNeutro, clonarEstado, pasoPorDefecto,
  planificarCola, interpolarTramo, escalaPerspectiva, visibilidadPorAvance,
  acotarAvance, acotarPan, panPerspectiva, seCombinan, segundosPosibles,
  type AnimParalaje, type MovCola, type PasoSecuencia, type VistaCamara, type EstadoCamara,
  type DesdePaso, type FadeAccion, type FadeCapa, type Tramo,
} from "@/lib/lab/anim-paralaje";
import { RangoPreciso } from "./rango-preciso";
import { EditorCromaCapa, type CromaCorregido } from "./editor-croma-capa";
import { HerramientasCapa } from "./herramientas-capa";
import { BarraTransporte } from "./barra-transporte";
import { PestanasMontaje, PanelMontajeCaja, type PanelMontaje } from "./paneles-montaje";
import {
  aEntradaVfx, claveEfectos, nombreEfecto, normalizarEfectos, type EfectoEscena,
} from "@/lib/lab/efectos-escena";
import { VfxScene } from "@/lib/story/vfx";
import { PanelEfectos } from "./panel-efectos";
import { Palanca, Flecha, Num, Barra } from "./controles-basicos";
import { pintarGuiaRuta } from "@/lib/lab/guia-ruta";
import { pintarCapas } from "@/lib/lab/pintar-escena";
import { MandosMovimientoCapa, movimientoInicial } from "./mandos-movimiento";
import { MandosSprite } from "./mandos-sprite";
import { PanelGrupo } from "./panel-grupo";
import {
  profundidadesEscalonadas, movimientoParaGrupo, repartirPorCandado, resumenDelGrupo,
} from "@/lib/lab/grupo-capas";
import { VistaPreviaFlotante } from "./vista-previa-flotante";
import { InspectorRapido, ParalajeGlobalSimple, type ModoEdicionCanvas } from "./inspector-rapido";
import {
  borrarBorradorMontaje, guardarBorradorMontaje, imgADataUrl, leerBorradorMontaje,
} from "@/lib/lab/borrador-montaje";

/**
 * A qué segundo se congela la simulación de efectos para el PNG.
 *
 * A cero no hay nada emitido; tres segundos bastan para que el fuego, el humo
 * o la lluvia estén en régimen y la foto se parezca a lo que se ve.
 */
const SEGUNDOS_PNG = 3;

const ANIM_A_COLA: Partial<Record<AnimParalaje, MovCola>> = {
  "izq-der": "der",
  "der-izq": "izq",
  "arriba-abajo": "abajo",
  "abajo-arriba": "arriba",
  acercar: "acercar",
  alejar: "alejar",
  atravesar: "atravesar",
  diagonal: "der",
  "dolly-izq": "acercar",
  orbita: "der",
  suave: "der",
};

// Paso 2: apilar las capas ya generadas y moverlas con profundidad.
//
// La primera imagen manda: fija el tamaño del lienzo y se toma como fondo
// opaco. Las siguientes deben ser PNG con transparencia. Cada una lleva su
// profundidad, y al mover la cámara cada capa se desplaza en proporción: el
// fondo casi nada, el primer plano mucho. Eso es lo que da la sensación de que
// la escena tiene fondo, con imágenes que son planas.

interface CapaImg {
  id: string;
  /** Id estable del mapa/ZIP, usado para ligar un actor a su vía o superficie. */
  clave: string;
  nombre: string;
  img: HTMLImageElement;
  depth: number;
  visible: boolean;
  escala: number;
  opacidad: number;
  bloqueada?: boolean;
  via?: "transparente" | "croma" | "opaca";
  vacio?: number;
  /** Movimiento propio, además del de la cámara. */
  mov?: MovCapa;
  /**
   * Si la capa es un sprite: `img` es la TIRA entera y esto dice cómo leerla.
   * Sin esto, la imagen se pinta a pantalla completa, como siempre.
   */
  spr?: SpriteEnCapa;
  /**
   * Las tiras de las animaciones ligadas del sprite, por clave.
   *
   * Van fuera de `spr` porque `spr` se serializa tal cual al ZIP y al
   * borrador, y una imagen del DOM ahí dentro no sobrevive a un JSON.stringify.
   * `spr.anims` guarda los datos; esto guarda los píxeles.
   */
  tiras?: Record<string, HTMLImageElement>;
}

export interface Semilla {
  /** Id semántico de la capa; no cambia al generar su PNG. */
  id?: string;
  nombre: string;
  url: string;
  /** Ajustes decididos por el mapa/director; ausentes conservan el reparto clásico. */
  depth?: number;
  escala?: number;
  opacidad?: number;
  via?: CapaImg["via"];
  vacio?: number;
  mov?: MovCapa;
  spr?: SpriteEnCapa;
  bloqueada?: boolean;
}

let contador = 0;
let pasoSeq = 0;

export function Compositor({ semilla, sprite, colaInicial, efectosIniciales, escena, onEscena, puedeIa }: {
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
  /** Efectos escritos por la IA. Igual que la cola: se copian una vez. */
  efectosIniciales?: EfectoEscena[];
  /** El mapa de formas, para que viaje dentro del ZIP del proyecto. */
  escena?: unknown;
  /** Al importar un ZIP que trae mapa, se devuelve para reponerlo en su pestaña. */
  onEscena?: (e: unknown) => void;
  /** Regenerar capa con /api/story/ia/lab/capa (admins con OpenAI). */
  puedeIa?: boolean;
}) {
  const [capas, setCapas] = useState<CapaImg[]>([]);
  const [moviendo, setMoviendo] = useState(true);
  const [fuerza, setFuerza] = useState(55);
  const [anim, setAnim] = useState<AnimParalaje>("quieto");
  // Borrador del paso a añadir a la cola
  const [borrador, setBorrador] = useState(() => pasoPorDefecto({ id: "borrador", mov: "der", durMs: 4000, distancia: 55 }));
  const [cola, setCola] = useState<PasoSecuencia[]>([]);
  const relojRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  /** Cada sprite puede pararse y reanudarse sin congelar cámara ni animales vecinos. */
  const relojesSpriteRef = useRef(new Map<string, { inicio: number; pausa?: number }>());
  /**
   * Las capas normales también tienen reloj individual.
   *
   * Antes todas dependían de `relojRef`: la IA podía dar movimiento propio a
   * un tren, pero la persona no podía pausarlo ni probarlo desde el inicio. Un
   * reloj por capa hace que sus mandos se comporten igual que los del sprite y
   * no congela el resto del montaje mientras se ajusta una sola cosa.
   */
  const relojesCapaRef = useRef(new Map<string, { inicio: number; pausa?: number }>());
  const [, refrescarRelojes] = useState(0);
  const [rutaVisibleId, setRutaVisibleId] = useState<string | null>(null);
  /** Una sola capa abierta evita repetir todos sus controles en una lista interminable. */
  const [capaActivaId, setCapaActivaId] = useState<string | null>(null);
  const [editandoCromaId, setEditandoCromaId] = useState<string | null>(null);
  const [previewAbierta, setPreviewAbierta] = useState(false);
  // Qué grupo de mandos se está viendo. Los dos existen siempre en el árbol:
  // el que no toca se esconde, para no perder focos ni arrastres a medias.
  const [panel, setPanel] = useState<PanelMontaje>("elemento");
  /** Dentro de «Elemento»: animar (lo de siempre), varias a la vez, o la imagen. */
  const [subPanel, setSubPanel] = useState<"animar" | "grupo" | "imagen">("animar");
  /**
   * Las capas marcadas para trabajar EN BLOQUE.
   *
   * Va aparte de `capaActivaId` a propósito. La activa es «la que estoy
   * editando» y solo puede haber una; el grupo es «sobre estas quiero actuar»
   * y sobrevive mientras se pasea por ellas de una en una para comprobar cómo
   * han quedado. Fundirlos obligaría a rehacer la selección cada vez que se
   * mira una capa.
   */
  const [grupo, setGrupo] = useState<string[]>([]);
  const [grupoFondo, setGrupoFondo] = useState(0.15);
  const [grupoFrente, setGrupoFrente] = useState(0.85);
  const [desacompasarGrupo, setDesacompasarGrupo] = useState(true);
  // La fila de acciones secundarias, plegada por defecto.
  const [masAcciones, setMasAcciones] = useState(false);
  // Los efectos del motor colgados de la escena.
  //
  // La IA lleva tres versiones devolviéndolos y viajaban dentro del ZIP, pero
  // no había ni estado que los guardara ni línea que los pintara: se pagaba el
  // token de pedirlos y se tiraban. El motor (VfxScene) es el mismo que usan
  // las historias; aquí solo se le da de comer.
  const [efectos, setEfectos] = useState<EfectoEscena[]>([]);
  const efectosRef = useRef<EfectoEscena[]>([]);
  efectosRef.current = efectos;
  // La simulación vive en un ref: es estado del dibujo, no de React, y meterla
  // en el árbol provocaría un render por fotograma.
  const vfxRef = useRef<VfxScene | null>(null);
  // Qué efecto se está a punto de colocar. Mientras haya uno, el siguiente
  // toque en la escena lo planta ahí en vez de mover la cámara.
  const [efectoPendiente, setEfectoPendiente] = useState<string | null>(null);
  const [modoEdicion, setModoEdicion] = useState<ModoEdicionCanvas>(null);
  const [moverTodo, setMoverTodo] = useState(false);
  const [volverRuta, setVolverRuta] = useState(true);
  const [voltearDefault, setVoltearDefault] = useState(true);
  const [pausaSegInspector, setPausaSegInspector] = useState(1.5);
  const [paralajeDurSeg, setParalajeDurSeg] = useState(4);
  const [paralajePausaSeg, setParalajePausaSeg] = useState(1);
  const [progresoUi, setProgresoUi] = useState(0);
  // La cola de la IA se copia UNA vez y ya es tuya: si se volviera a copiar en
  // cada render, cualquier retoque a mano se perdería al respirar.
  const colaIaRef = useRef<PasoSecuencia[] | null>(null);
  useEffect(() => {
    if (!colaInicial?.length || colaIaRef.current === colaInicial) return;
    colaIaRef.current = colaInicial;
    setCola(colaInicial.map((p, i) => ({ ...p, id: `p${++pasoSeq}-${i}` })));
  }, [colaInicial]);

  // Los efectos de la IA, igual que la cola: se copian UNA vez y a partir de
  // ahí son tuyos. Si se recopiaran, borrar uno a mano lo haría reaparecer.
  const efectosIaRef = useRef<EfectoEscena[] | undefined>(undefined);
  useEffect(() => {
    if (!efectosIniciales?.length || efectosIaRef.current === efectosIniciales) return;
    efectosIaRef.current = efectosIniciales;
    setEfectos(efectosIniciales);
  }, [efectosIniciales]);
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
  const [borradorInfo, setBorradorInfo] = useState<string | null>(null);
  const borradorListo = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  // El lienzo grande. NO es una copia del pequeño: el bucle de dibujo apunta a
  // uno o a otro según cuál se esté viendo.
  //
  // Antes la vista grande espejaba el lienzo incrustado con un drawImage por
  // fotograma. Como el incrustado se dimensiona con el ancho de su caja —en un
  // móvil, 320 px— la «vista previa a pantalla completa» era ese cuadro de 320
  // px estirado: borroso, y sin más detalle del que ya se veía. Pintar
  // directamente en el que está delante cuesta lo mismo y sale nítido.
  const canvasPreview = useRef<HTMLCanvasElement>(null);
  const cajaPreview = useRef<HTMLDivElement>(null);
  const previewAbiertaRef = useRef(false);
  // El bucle de dibujo vive en refs y no ve el estado de React. Sin esto, al
  // abrir la vista grande se seguiría pintando en el lienzo pequeño y la grande
  // se quedaría en negro.
  previewAbiertaRef.current = previewAbierta;
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
  const progresoUiRef = useRef(0);
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

  const indiceActivo = capas.findIndex((c) => c.id === capaActivaId);
  const capaActiva = indiceActivo >= 0 ? capas[indiceActivo] : null;
  const capaEditandoCroma = editandoCromaId
    ? capas.find((c) => c.id === editandoCromaId) ?? null
    : null;
  const referenciaActiva = capaActiva?.mov?.referenciaCapaId
    ? capas.find((c) => c.clave === capaActiva.mov?.referenciaCapaId)
    : undefined;
  let superficies: SuperficieNavegable[] = [];
  try {
    if (escena && typeof escena === "object" && Array.isArray((escena as Escena).layers)) {
      superficies = superficiesDeEscena(escena as Escena);
    }
  } catch {
    // Un mapa viejo o parcial no debe tumbar el montaje: simplemente deja la
    // ruta libre hasta que haya una superficie válida.
  }
  useEffect(() => {
    if (!capas.length) {
      if (capaActivaId !== null) setCapaActivaId(null);
      return;
    }
    if (!capas.some((c) => c.id === capaActivaId)) {
      setCapaActivaId(capas[capas.length - 1].id);
    }
  }, [capas, capaActivaId]);
  useEffect(() => {
    if (rutaVisibleId && rutaVisibleId !== capaActivaId) setRutaVisibleId(null);
  }, [capaActivaId, rutaVisibleId]);
  // Una capa borrada tiene que salir del grupo o «Separarlas» contaría
  // fantasmas y el número del panel dejaría de cuadrar con la lista.
  useEffect(() => {
    setGrupo((g) => {
      const vivos = g.filter((id) => capas.some((c) => c.id === id));
      return vivos.length === g.length ? g : vivos;
    });
  }, [capas]);

  /** ¿Hay un montaje auto-guardado tras una recarga? */
  const [borradorPendiente, setBorradorPendiente] = useState<Awaited<ReturnType<typeof leerBorradorMontaje>>>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const b = await leerBorradorMontaje();
        if (!vivo) return;
        if (b?.capas?.length && !semilla?.length) setBorradorPendiente(b);
      } catch { /* IndexedDB puede fallar en modo privado */ }
      finally { borradorListo.current = true; }
    })();
    return () => { vivo = false; };
  // Solo al montar: semilla que llegue después manda sobre el borrador.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!borradorListo.current || !capas.length) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const packed = [];
          for (const c of capasRef.current) {
            packed.push({
              clave: c.clave,
              nombre: c.nombre,
              depth: c.depth,
              escala: c.escala,
              opacidad: c.opacidad,
              bloqueada: c.bloqueada,
              via: c.via,
              vacio: c.vacio,
              mov: c.mov,
              spr: c.spr,
              dataUrl: await imgADataUrl(c.img),
              ...(await tirasADataUrls(c.tiras)),
            });
          }
          await guardarBorradorMontaje({
            version: 1,
            guardadoEn: Date.now(),
            width: tam.current.w,
            height: tam.current.h,
            capas: packed,
            escena,
            cola: colaRef.current,
          });
          setBorradorInfo(
            `Autoguardado en este navegador · ${new Date().toLocaleTimeString()}. Descarga el ZIP para respaldarlo.`,
          );
        } catch {
          setBorradorInfo("No se pudo autoguardar en este navegador. Usa «Descargar todo · ZIP».");
        }
      })();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [capas, cola, escena]);

  async function recuperarBorrador() {
    const b = borradorPendiente;
    if (!b?.capas?.length) return;
    setBorradorPendiente(null);
    try {
      const nuevas: CapaImg[] = [];
      for (const c of b.capas) {
        const img = await cargar(c.dataUrl);
        const base = hacerCapa(c.nombre, img);
        nuevas.push({
          ...base,
          clave: c.clave || base.id,
          depth: c.depth, escala: c.escala, opacidad: c.opacidad,
          bloqueada: c.bloqueada, via: c.via, vacio: c.vacio,
          mov: normalizarMov(c.mov), spr: normalizarSprite(c.spr),
          tiras: await cargarTiras(c.tiras),
        });
      }
      relojesSpriteRef.current.clear();
      relojesCapaRef.current.clear();
      const ahora = performance.now();
      nuevas.forEach((c) => {
        if (c.spr) relojesSpriteRef.current.set(c.id, { inicio: ahora });
        else if (c.mov) relojesCapaRef.current.set(c.id, { inicio: ahora });
      });
      tam.current = { w: b.width || nuevas[0].img.naturalWidth, h: b.height || nuevas[0].img.naturalHeight };
      setCapas(nuevas);
      setCapaActivaId(nuevas[nuevas.length - 1].id);
      if (Array.isArray(b.cola) && b.cola.length) {
        setCola((b.cola as PasoSecuencia[]).map((p, i) => pasoPorDefecto({ ...p, id: `b${++pasoSeq}-${i}` })));
      }
      if (b.escena) onEscena?.(b.escena);
      setAviso(`Recuperado el montaje autoguardado (${nuevas.length} capas). Descarga el ZIP si quieres un respaldo portable.`);
    } catch (e) {
      setAviso((e as Error).message || "No se pudo recuperar el borrador.");
    }
  }

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

  function tiempoMovimientoCapa(id: string, ahora = performance.now()) {
    let r = relojesCapaRef.current.get(id);
    if (!r) {
      r = { inicio: relojRef.current || ahora };
      relojesCapaRef.current.set(id, r);
    }
    return r.pausa !== undefined ? r.pausa : Math.max(0, (ahora - r.inicio) / 1000);
  }

  function movimientoCapaCorriendo(id: string) {
    return relojesCapaRef.current.get(id)?.pausa === undefined;
  }

  function pausarMovimientoCapa(id: string) {
    const ahora = performance.now();
    const segundos = tiempoMovimientoCapa(id, ahora);
    relojesCapaRef.current.set(id, { inicio: ahora - segundos * 1000, pausa: segundos });
    refrescarRelojes((n) => n + 1);
  }

  function reproducirMovimientoCapa(id: string) {
    const ahora = performance.now();
    const r = relojesCapaRef.current.get(id);
    const segundos = r?.pausa ?? (r ? Math.max(0, (ahora - r.inicio) / 1000) : 0);
    relojesCapaRef.current.set(id, { inicio: ahora - segundos * 1000 });
    refrescarRelojes((n) => n + 1);
  }

  function reiniciarMovimientoCapa(id: string, reproducir = true) {
    const ahora = performance.now();
    relojesCapaRef.current.set(id, reproducir ? { inicio: ahora } : { inicio: ahora, pausa: 0 });
    refrescarRelojes((n) => n + 1);
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

  /** Las capas normales siempre han compartido fotograma cero con la cámara. */
  function reiniciarMovimientosCapa() {
    const ahora = performance.now();
    for (const capa of capasRef.current) {
      if (!capa.spr && capa.mov) relojesCapaRef.current.set(capa.id, { inicio: ahora });
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
    setCapaActivaId(nuevas[nuevas.length - 1].id);
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
        efectos,
        capas: capas.map((c) => ({
          clave: c.clave, nombre: c.nombre, depth: c.depth, escala: c.escala, opacidad: c.opacidad,
          bloqueada: c.bloqueada, via: c.via, vacio: c.vacio, mov: c.mov, spr: c.spr, img: c.img,
          tiras: c.tiras,
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
      let cromasCorregidos = 0;
      for (const c of pack.capas) {
        let fuente = c.url;
        let via = c.via;
        let vacio = c.vacio;
        // Los proyectos viejos pueden declarar «croma» y aun contener una
        // plancha rosa. Se vuelven a revisar al importar; esto corrige de forma
        // automática justamente el ZIP de vegetación que destapó el problema.
        if (!c.spr && c.via === "croma") {
          const limpia = await prepararCapa(c.url, false, CROMA);
          if (!limpia.problema && limpia.vacio > (c.vacio ?? 0) + 0.002) {
            fuente = limpia.url;
            via = limpia.via;
            vacio = limpia.vacio;
            cromasCorregidos++;
          }
        }
        const img = await cargar(fuente);
        nuevas.push({
          ...hacerCapa(c.nombre, img),
          ...(c.clave ? { clave: c.clave } : {}),
          depth: c.depth, escala: c.escala, opacidad: c.opacidad, via, vacio,
          bloqueada: c.bloqueada,
          mov: normalizarMov(c.mov),
          spr: normalizarSprite(c.spr),
          tiras: await cargarTiras(c.tiras),
        });
      }
      if (!nuevas.length) throw new Error("El ZIP no trae capas.");
      relojesSpriteRef.current.clear();
      relojesCapaRef.current.clear();
      const ahora = performance.now();
      relojRef.current = ahora;
      nuevas.forEach((c) => {
        if (c.spr) relojesSpriteRef.current.set(c.id, { inicio: ahora });
        else if (c.mov) relojesCapaRef.current.set(c.id, { inicio: ahora });
      });
      tam.current = {
        w: pack.width || nuevas[0].img.naturalWidth,
        h: pack.height || nuevas[0].img.naturalHeight,
      };
      if (!pack.width || !pack.height) {
        tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      }
      setRutaVisibleId(null);
      setCapas(nuevas);
      setCapaActivaId(nuevas[nuevas.length - 1].id);

      // Y lo demás, si el ZIP lo trae (los v1 no).
      const partes = [`${nuevas.length} capas`];
      if (cromasCorregidos) partes.push(`${cromasCorregidos} fondos corregidos`);
      if (Array.isArray(pack.cola) && pack.cola.length) {
        setCola((pack.cola as PasoSecuencia[]).map((p, i) => pasoPorDefecto({ ...p, id: `z${++pasoSeq}-${i}` })));
        partes.push(`${pack.cola.length} pasos de cámara`);
      }
      if (pack.escena) {
        onEscena?.(pack.escena);
        partes.push("el mapa");
      }
      // Los efectos viajaban en el ZIP desde la versión 2 y al importar nadie
      // los leía: volvías con el montaje y la cámara, y la escena sin humo.
      const fx = normalizarEfectos(pack.efectos);
      if (fx.efectos.length) {
        setEfectos(fx.efectos);
        partes.push(`${fx.efectos.length} efecto${fx.efectos.length === 1 ? "" : "s"}`);
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
    setBorradorPendiente(null);
    let vivo = true;
    (async () => {
      const nuevas: CapaImg[] = [];
      const ajustes: Semilla[] = [];
      for (const s of semilla) {
        try {
          nuevas.push({
            ...hacerCapa(s.nombre, await cargar(s.url)),
            ...(s.id ? { clave: s.id } : {}),
            via: s.via, vacio: s.vacio, mov: s.mov, spr: s.spr, bloqueada: s.bloqueada,
          });
          ajustes.push(s);
        } catch {}
      }
      if (!vivo || !nuevas.length) return;
      relojesSpriteRef.current.clear();
      relojesCapaRef.current.clear();
      tam.current = { w: nuevas[0].img.naturalWidth, h: nuevas[0].img.naturalHeight };
      const finales = repartirProfundidad(nuevas).map((c, i) => ({
        ...c,
        ...(Number.isFinite(ajustes[i]?.depth) ? { depth: Math.max(0, Math.min(1, ajustes[i].depth!)) } : {}),
        ...(Number.isFinite(ajustes[i]?.escala) ? { escala: Math.max(0.05, Math.min(4, ajustes[i].escala!)) } : {}),
        ...(Number.isFinite(ajustes[i]?.opacidad) ? { opacidad: Math.max(0, Math.min(1, ajustes[i].opacidad!)) } : {}),
      }));
      const ahora = performance.now();
      finales.forEach((c) => {
        if (c.spr) relojesSpriteRef.current.set(c.id, { inicio: ahora });
        else if (c.mov) relojesCapaRef.current.set(c.id, { inicio: ahora });
      });
      setCapas(finales);
      const actorActivo = [...finales].reverse().find((c) => c.spr);
      const activa = actorActivo ?? finales[finales.length - 1];
      setCapaActivaId(activa.id);
      setRutaVisibleId(actorActivo?.spr?.ruta?.pasos.length ? actorActivo.id : null);
      setAviso(
        `Montaje cargado: ${finales.length} capas`
        + (finales.some((c) => c.spr) ? ` y ${finales.filter((c) => c.spr).length} actores animados.` : "."),
      );
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
          ...(sprite.id ? { clave: sprite.id } : {}),
          mov: sprite.mov,
          spr: {
            ...sprite.spr,
            espacio: sprite.spr.espacio ?? "pantalla",
            sincronizar: sprite.spr.sincronizar !== false,
          },
        };
        relojesSpriteRef.current.set(nueva.id, { inicio: performance.now() });
        setRutaVisibleId(nueva.id);
        setCapaActivaId(nueva.id);
        setCapas((prev) => [...prev, { ...nueva, depth: prev.length ? 0.5 : 0 }]);
        // Empieza en A al entrar al montaje; si se conserva el reloj de la
        // sesión, una trayectoria corta aparecería ya terminada en B.
        relojRef.current = performance.now();
        reiniciarMovimientosCapa();
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

  /**
   * En qué lienzo toca pintar y de qué ancho.
   *
   * Solo uno está delante en cada momento: la vista grande tapa la página
   * entera. El tope de ancho sube con ella porque ahí sí hay sitio para
   * aprovecharlo; en el incrustado, pasar de 1200 es gastar píxeles que nadie
   * ve.
   */
  function destinoDibujo(): { cv: HTMLCanvasElement; ancho: number } | null {
    if (previewAbiertaRef.current && canvasPreview.current) {
      const disponible = cajaPreview.current?.clientWidth ?? 900;
      return { cv: canvasPreview.current, ancho: Math.max(320, Math.min(1920, disponible)) };
    }
    if (!canvas.current) return null;
    return {
      cv: canvas.current,
      ancho: Math.max(320, Math.min(1200, caja.current?.clientWidth ?? 900)),
    };
  }

  function pintar(dt: number) {
    const destino = destinoDibujo();
    if (!destino) return;
    const cv = destino.cv;
    const ancho = destino.ancho;
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
            reiniciarMovimientosCapa();
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
        reiniciarMovimientosCapa();
        reiniciarSpritesSincronizados();
        anotarPose();
        setAviso("Terminada. La cámara vuelve al inicio que fijaste: dale otra vez y hace lo mismo.");
        vista = vistaDesdeEstado(estadoRef.current);
      } else {
        if (idx !== pasoActivoRef.current) { pasoActivoRef.current = idx; setPasoActivo(idx); }
        const { vista: v, estado } = interpolarTramo(planRef.current[idx], pasoMsRef.current, metaCapas());
        vista = v;
        estadoRef.current = estado;
        const total = planRef.current.reduce((a, t) => a + t.durMs, 0);
        if (total > 0) {
          let hecho = pasoMsRef.current;
          for (let i = 0; i < idx; i++) hecho += planRef.current[i].durMs;
          const frac = Math.min(1, hecho / total);
          if (Math.abs(frac - progresoUiRef.current) > 0.004) {
            progresoUiRef.current = frac;
            setProgresoUi(frac);
          }
        }
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
    let guiaRuta: { spr: SpriteEnCapa; plano: Plano; tiempo: number } | null = null;
    // Las capas las pinta un módulo aparte, el MISMO que usa «Montaje PNG».
    // Antes había dos dibujantes y se habían separado: el del PNG no pintaba
    // efectos ni el movimiento propio de las capas.
    const guia = pintarCapas(c, {
      capas,
      vista,
      w, h,
      idFondo,
      rutaVisibleId,
      // Cada capa lleva su reloj: un sprite y una capa con «mov» no comparten
      // el mismo, y por eso el tiempo se pide por capa en vez de pasarlo suelto.
      tiempoDeCapa: (capa) => (capa.spr
        ? tiempoSprite(capa.id, ahora)
        : tiempoMovimientoCapa(capa.id, ahora)),
    });
    // Los efectos del motor, ENCIMA de las capas.
    //
    // Van al final porque son lo que ocurre en el aire delante de la escena:
    // el humo tapa la pared, no al revés. `VfxScene` deja el lienzo como
    // estaba, así que no se lleva por delante lo ya pintado.
    // El reloj general de la escena: los efectos son del ambiente, no de una
    // capa concreta, así que no siguen el reloj individual de ninguna.
    pintarEfectos(c, w, h, vista, (performance.now() - relojRef.current) / 1000);

    // Guía solo en la vista previa. Nunca entra al PNG ni al ZIP.
    if (guia) pintarGuiaRuta(c, guia.spr, guia.plano, guia.tiempo);
  }

  /**
   * Pintar los efectos colgados de la escena.
   *
   * LA PARTE QUE IMPORTA es dónde cae cada uno, y depende de su espacio:
   *
   *   · «encuadre» → sus coordenadas YA son de pantalla. La lluvia cae sobre la
   *     cámara: no se desplaza al panear ni crece al acercarse. Se le pasa
   *     zoom 1 aunque la cámara esté encima de la escena.
   *
   *   · «imagen» → está pegado a un sitio de la escena, así que hay que llevar
   *     ese punto por la MISMA transformación que sufre una capa a su
   *     profundidad. Es lo que hace que una hoguera se quede en su suelo al
   *     panear, y que crezca al acercarse en vez de flotar despegada.
   */
  function pintarEfectos(
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    vista: VistaCamara,
    reloj: number,
    /**
     * Una simulación distinta de la que está en pantalla.
     *
     * La exportación la necesita: si reutilizara la de la vista previa,
     * `seek` a un tiempo anterior la rebobinaría —está escrito así a
     * propósito, para poder retroceder— y exportar dejaría la escena de
     * pantalla reiniciada. El PNG se lleva la suya y no toca nada.
     */
    propia?: VfxScene,
  ) {
    const lista = efectosRef.current;
    if (!lista.length) return;
    if (!propia && !vfxRef.current) vfxRef.current = new VfxScene();
    const escenaVfx = propia ?? vfxRef.current!;

    // El zoom que se le declara al motor sale de los efectos PEGADOS: es lo que
    // reescala las partículas ya vivas para que sigan a la cámara en vez de
    // quedarse del tamaño con el que nacieron.
    const pegado = lista.find((e) => e.espacio === "imagen");
    const zoom = pegado
      ? vista.zoom * vista.zoomCapa(pegado.depth)
      : 1;

    const entradas = lista.map((e) => {
      if (e.espacio === "encuadre") {
        return aEntradaVfx(e, { x: e.x, y: e.y, x2: e.x2, y2: e.y2 });
      }
      // El plano de una capa a esa profundidad, igual que en el bucle de
      // arriba: escala por perspectiva y desplazamiento por paneo.
      const esc = vista.zoom * vista.zoomCapa(e.depth);
      const pan = vista.panCapa(e.depth);
      const dw = w * esc, dh = h * esc;
      const x0 = -(dw - w) / 2 + vista.ox * pan * w;
      const y0 = -(dh - h) / 2 + vista.oy * pan * h;
      const aPantalla = (u: number, v: number) => ({
        x: (x0 + u * dw) / w,
        y: (y0 + v * dh) / h,
      });
      const a = aPantalla(e.x, e.y);
      const b = aPantalla(e.x2, e.y2);
      return aEntradaVfx(e, { x: a.x, y: a.y, x2: b.x, y2: b.y });
    });

    escenaVfx.setSize(w, h);
    escenaVfx.setZoomScale(zoom);
    // La clave NO lleva la posición: si la llevara, mover la cámara reiniciaría
    // las partículas en cada fotograma y solo se vería el primer instante del
    // efecto, una y otra vez.
    escenaVfx.seek(claveEfectos(lista), entradas, Math.max(0, reloj));
    escenaVfx.draw(c, 1);
  }

  /**
   * El montaje como PNG.
   *
   * Usa EL MISMO dibujante que la vista previa, con la cámara donde la tengas
   * puesta. Antes tenía su propia copia del bucle, más simple, y se había
   * separado: exportaba sin efectos, sin el movimiento propio de las capas y
   * sin la posición de la cámara. O sea, una imagen que no era la que estabas
   * viendo, sin avisar de nada.
   *
   * Los relojes se congelan en cero: un PNG es un instante, así que cada sprite
   * sale en su primer fotograma y cada recorrido, en su punto de partida.
   */
  async function exportarPng() {
    if (!capas.length) return;
    const out = document.createElement("canvas");
    out.width = tam.current.w;
    out.height = tam.current.h;
    const c = out.getContext("2d");
    if (!c) return;

    const vista = vistaDesdeEstado(estadoRef.current);
    pintarCapas(c, {
      capas,
      vista,
      w: out.width,
      h: out.height,
      idFondo: capas.find((x) => x.visible && !x.spr)?.id,
      // Sin guía: es una ayuda para colocar, no parte de la escena.
      rutaVisibleId: null,
      tiempoDeCapa: () => 0,
    });
    // Los efectos también, que era justo lo que faltaba.
    //
    // En su propia simulación y adelantada unos segundos: a tiempo cero no hay
    // ni una partícula emitida todavía, así que un PNG de una hoguera saldría
    // sin fuego. Con el humo ya subiendo es la foto que uno espera.
    pintarEfectos(c, out.width, out.height, vista, SEGUNDOS_PNG, new VfxScene());

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
    reiniciarMovimientosCapa();
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
    reiniciarMovimientosCapa();
    reiniciarSpritesSincronizados();
    refrescarRelojes((n) => n + 1);
    setPose({ ox: 0, oy: 0, avance: 0 });
    progresoUiRef.current = 0;
    setProgresoUi(0);
    setAviso("Cámara al centro. La animación vuelve a empezar desde aquí.");
  }

  /**
   * Reproducir la escena. UNA sola cosa, siempre la misma.
   *
   * Antes esto hacía dos cosas distintas según el estado: con cola de cámara
   * arrancaba la secuencia, y sin cola encendía el vaivén de reposo —que no es
   * «la escena», es un paseo automático— y además abría la vista grande a la
   * fuerza. Así que darle al play mostraba cosas distintas según lo que
   * hubieras hecho antes, que es justo lo que hacía imposible testear.
   *
   * Ahora reproducir significa siempre: TODO desde el fotograma cero —cámara si
   * hay cola, movimiento de capas, rutas y ciclos de sprites—, en el lienzo que
   * estés mirando. La vista grande se abre cuando tú lo pidas, no sola.
   */
  function toggleReproduccion() {
    if (enSecuencia || moviendo) {
      pararSecuencia();
      setMoviendo(false);
      return;
    }
    reproducirTodo();
  }

  /** Todo a cero y a andar. Es lo que hace el botón grande de play. */
  function reproducirTodo() {
    encima.current = false;
    retenerPoseRef.current = false;
    progresoUiRef.current = 0;
    setProgresoUi(0);
    if (cola.length) {
      // iniciarSecuencia ya pone los relojes de capas y sprites a cero.
      iniciarSecuencia();
      return;
    }
    // Sin cola de cámara la escena sigue teniendo vida propia: capas que se
    // mueven y sprites que ciclan. Se reinician para que empiece por el
    // principio y no por donde se hubiera quedado.
    relojRef.current = performance.now();
    reiniciarMovimientosCapa();
    reiniciarSpritesSincronizados();
    refrescarRelojes((n) => n + 1);
    setMoviendo(true);
    setAviso(
      capas.some((c) => c.mov || c.spr)
        ? "Reproduciendo la escena."
        : "No hay nada animado todavía: dale movimiento a una capa o mete un sprite.",
    );
  }

  function seekCola(frac: number) {
    if (!cola.length) {
      progresoUiRef.current = frac;
      setProgresoUi(frac);
      return;
    }
    if (!enSecuencia) iniciarSecuencia();
    planificar();
    const plan = planRef.current;
    if (!plan.length) return;
    const total = plan.reduce((a, t) => a + t.durMs, 0);
    let alvo = Math.max(0, Math.min(1, frac)) * total;
    let idx = 0;
    estadoRef.current = clonarEstado(inicioRef.current);
    while (idx < plan.length && alvo >= plan[idx].durMs) {
      alvo -= plan[idx].durMs;
      estadoRef.current = clonarEstado(plan[idx].destino);
      idx++;
    }
    if (idx >= plan.length) {
      idx = plan.length - 1;
      alvo = plan[idx].durMs;
    }
    pasoActivoRef.current = idx;
    setPasoActivo(idx);
    pasoMsRef.current = alvo;
    progresoUiRef.current = frac;
    setProgresoUi(frac);
    anotarPose();
  }

  function saltarPaso(delta: -1 | 1) {
    if (!cola.length) return;
    if (!enSecuencia && !planRef.current.length) {
      iniciarSecuencia();
      return;
    }
    planificar();
    const n = planRef.current.length;
    if (!n) return;
    const next = Math.max(0, Math.min(n - 1, pasoActivoRef.current + delta));
    let hecho = 0;
    for (let i = 0; i < next; i++) hecho += planRef.current[i].durMs;
    const total = planRef.current.reduce((a, t) => a + t.durMs, 0);
    seekCola(total > 0 ? hecho / total : 0);
  }

  function aplicarParalajeACola() {
    const mov = ANIM_A_COLA[anim];
    if (!mov) {
      setAviso("Elige un tipo de paralaje distinto de «Quieto».");
      return;
    }
    const pasos: PasoSecuencia[] = [
      pasoPorDefecto({
        id: `p${++pasoSeq}`,
        mov,
        durMs: Math.round(paralajeDurSeg * 1000),
        distancia: fuerza,
      }),
    ];
    if (paralajePausaSeg > 0) {
      pasos.push(pasoPorDefecto({
        id: `p${++pasoSeq}`,
        mov: "esperar",
        durMs: Math.round(paralajePausaSeg * 1000),
        distancia: 0,
      }));
    }
    setCola((c) => [...c, ...pasos]);
    setAviso(`Paralaje añadido a la cola (${pasos.length} paso${pasos.length === 1 ? "" : "s"}).`);
  }

  /**
   * Dónde se ha tocado, en 0..1 sobre la escena.
   *
   * Se mide contra el CANVAS, no contra su caja: en la vista grande el lienzo
   * lleva `object-contain`, así que la caja tiene bandas negras a los lados y
   * usarla desplazaría todo lo que se coloque. El rectángulo del canvas es el
   * de la imagen de verdad.
   */
  function coordsEnLienzo(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const el = (previewAbiertaRef.current ? canvasPreview.current : canvas.current) ?? caja.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }

  /**
   * Los pasos que describen el VIAJE DE IDA, y que por tanto se conservan al
   * reconstruir la ruta.
   *
   * Los «voltear» no están porque se vuelven a poner solos según el sentido de
   * cada tramo. Los «cambiar» SÍ: son decisiones que tomó la persona —«aquí
   * saluda»— y tirarlos cada vez que se toca la escena para añadir un punto
   * borraría el trabajo sin decir nada.
   */
  const esPasoDeIda = (p: PasoRutaSprite) =>
    p.tipo === "mover" || p.tipo === "pausa" || p.tipo === "cambiar";

  function aplicarVolverRuta(pasos: PasoRutaSprite[], spr: SpriteEnCapa): PasoRutaSprite[] {
    if (!volverRuta || pasos.length < 1) return pasos.slice(0, 24);
    const ida = pasos.filter(esPasoDeIda);
    const vuelta: PasoRutaSprite[] = [];
    let x = spr.x;
    let y = spr.y;
    const puntos: { x: number; y: number; segundos: number; suavizado?: "lineal" | "suave" }[] = [{ x, y, segundos: 1 }];
    for (const p of ida) {
      if (p.tipo === "mover") {
        x = p.x ?? x;
        y = p.y ?? y;
        puntos.push({ x, y, segundos: p.segundos, suavizado: p.suavizado });
      }
    }
    for (let i = puntos.length - 2; i >= 0; i--) {
      if (voltearDefault) vuelta.push({ tipo: "voltear", segundos: 0.1 });
      vuelta.push({
        tipo: "mover",
        x: puntos[i].x,
        y: puntos[i].y,
        segundos: puntos[i + 1]?.segundos ?? 1.2,
        suavizado: puntos[i + 1]?.suavizado ?? "suave",
      });
    }
    return [...ida, ...vuelta].slice(0, 24);
  }

  /**
   * Un punto más en la ruta de una capa normal.
   *
   * Los puntos se guardan como DESPLAZAMIENTO respecto al sitio de la capa, no
   * como posición absoluta: una capa a pantalla completa no tiene «un sitio»
   * donde esté, tiene el centro del cuadro, así que se mide desde ahí. Tocar en
   * el centro y tocar en la esquina dan (0,0) y (0.5,0.5).
   */
  function anadirPuntoRutaCapa(capa: CapaImg, nx: number, ny: number) {
    const previos = capa.mov?.tipo === "ruta" ? (capa.mov.pasos ?? []) : [];
    const pasos = [...previos, {
      x: Math.round((nx - 0.5) * 1000) / 1000,
      y: Math.round((ny - 0.5) * 1000) / 1000,
      segundos: 1.5,
      suavizado: "suave" as const,
    }];
    const mov = normalizarMov({
      tipo: "ruta",
      pasos,
      bucle: capa.mov?.bucle ?? false,
      volver: capa.mov?.volver ?? volverRuta,
      espacio: capa.mov?.espacio,
      referenciaCapaId: capa.mov?.referenciaCapaId,
    });
    if (!mov) {
      setAviso("Ese punto coincide con el sitio de la capa: no habría movimiento.");
      return;
    }
    upd(capa.id, { mov });
    setRutaVisibleId(capa.id);
    reiniciarMovimientoCapa(capa.id);
    setAviso(`Punto ${pasos.length} en la ruta de «${capa.nombre}».`);
  }

  function anadirPuntoRuta(nx: number, ny: number) {
    const capa = capasRef.current.find((c) => c.id === capaActivaId);
    if (!capa || capa.bloqueada) return;
    // Una capa normal también puede tener ruta. Antes esto solo valía para
    // sprites y tocar la escena con un fondo o una nube seleccionada no hacía
    // nada, sin decir por qué.
    if (!capa.spr) { anadirPuntoRutaCapa(capa, nx, ny); return; }
    const spr = capa.spr;
    const nucleo = [...(spr.ruta?.pasos ?? []).filter(esPasoDeIda)];
    let lx = spr.x;
    let ly = spr.y;
    for (const p of nucleo) {
      if (p.tipo === "mover") { lx = p.x ?? lx; ly = p.y ?? ly; }
    }
    const espejo = spr.vista === "lateral" && Math.abs(nx - lx) >= 0.005
      ? ((nx > lx) !== (spr.direccionBase !== "izquierda"))
      : !!spr.espejo;
    nucleo.push({ tipo: "mover", x: nx, y: ny, segundos: 1.2, suavizado: "suave", espejo });
    const finales = aplicarVolverRuta(nucleo, spr);
    upd(capa.id, {
      spr: {
        ...spr,
        ruta: { pasos: finales, bucle: !!spr.ruta?.bucle || volverRuta },
        trayectoria: undefined,
        espejo,
      },
    });
    setRutaVisibleId(capa.id);
    setAviso(`Punto ${nucleo.filter((p) => p.tipo === "mover").length} en la ruta de «${capa.nombre}».`);
  }

  function anadirPausaRuta() {
    const capa = capasRef.current.find((c) => c.id === capaActivaId);
    if (!capa?.spr || capa.bloqueada) return;
    const spr = capa.spr;
    const nucleo = [...(spr.ruta?.pasos ?? []).filter(esPasoDeIda)];
    nucleo.push({ tipo: "pausa", segundos: pausaSegInspector });
    const finales = aplicarVolverRuta(nucleo, spr);
    upd(capa.id, { spr: { ...spr, ruta: { pasos: finales, bucle: !!spr.ruta?.bucle || volverRuta }, trayectoria: undefined } });
    setAviso(`Pausa de ${pausaSegInspector}s en «${capa.nombre}».`);
  }

  function colocarSeleccion(nx: number, ny: number) {
    const ids = moverTodo
      ? capasRef.current.filter((c) => !c.bloqueada).map((c) => c.id)
      : capaActivaId ? [capaActivaId] : [];
    if (!ids.length) return;
    setCapas((cs) => cs.map((c) => {
      if (!ids.includes(c.id)) return c;
      if (c.spr) {
        const dx = nx - c.spr.x;
        const dy = ny - c.spr.y;
        const spr = { ...c.spr, x: nx, y: ny };
        if (c.spr.ruta?.pasos.length) {
          spr.ruta = {
            ...c.spr.ruta,
            pasos: c.spr.ruta.pasos.map((p) => (p.tipo === "mover"
              ? { ...p, x: (p.x ?? c.spr!.x) + dx, y: (p.y ?? c.spr!.y) + dy }
              : p)),
          };
        }
        if (c.spr.trayectoria) {
          spr.trayectoria = {
            ...c.spr.trayectoria,
            x: c.spr.trayectoria.x + dx,
            y: c.spr.trayectoria.y + dy,
          };
        }
        return { ...c, spr };
      }
      // Capa de imagen: desplazamiento local rápido
      return {
        ...c,
        mov: {
          tipo: "trayectoria",
          desdeX: 0,
          desdeY: 0,
          x: (nx - 0.5) * 0.35,
          y: (ny - 0.5) * 0.35,
          segundos: 0.01,
          bucle: false,
          volver: false,
        },
      };
    }));
  }

  /**
   * Copiar la animación de la capa activa a todas las demás.
   *
   * Las BLOQUEADAS se saltan: para eso está el candado —«no me toques esta»— y
   * un «aplicar a todas» que ignorara el bloqueo lo convertiría en un adorno.
   *
   * A las que ya tienen movimiento se les desfasa un poco el ciclo. Cinco capas
   * meciéndose exactamente a la vez no parecen cinco cosas vivas, parecen una
   * sola imagen temblando.
   */
  function aplicarMovimientoATodas() {
    const origen = capasRef.current.find((c) => c.id === capaActivaId);
    if (!origen?.mov) {
      setAviso("Esta capa no tiene animación que copiar.");
      return;
    }
    // Las cuentas se hacen AQUÍ, no dentro del actualizador de estado: el
    // actualizador corre durante el render siguiente, así que el mensaje se
    // armaba con los contadores todavía a cero y siempre decía «0 capas».
    const otras = capasRef.current.filter((c) => c.id !== origen.id);
    const destino = otras.filter((c) => !c.bloqueada);
    const puestas = destino.length;
    const saltadas = otras.length - puestas;
    if (!puestas) {
      setAviso(saltadas
        ? `Las otras ${saltadas} capas están bloqueadas: quita el candado para aplicarles la animación.`
        : "No hay otras capas a las que aplicársela.");
      return;
    }
    const ciclico = origen.mov.tipo === "flotar" || origen.mov.tipo === "vaiven" || origen.mov.tipo === "pulso";
    const desfases = new Map(destino.map((c, i) => [c.id, Math.round(((i + 1) * 0.37 % 1) * 100) / 100]));
    setCapas((cs) => cs.map((c) => {
      if (c.id === origen.id || c.bloqueada) return c;
      return {
        ...c,
        mov: normalizarMov({
          ...origen.mov,
          ...(ciclico ? { desfase: desfases.get(c.id) } : {}),
        }),
      };
    }));
    reiniciarMovimientosCapa();
    setAviso(
      `Animación aplicada a ${puestas} capa${puestas === 1 ? "" : "s"}`
      + (saltadas ? ` · ${saltadas} bloqueada${saltadas === 1 ? "" : "s"}, sin tocar` : "")
      + ".",
    );
  }

  // ── Animaciones ligadas del actor ─────────────────────────────────────────

  /**
   * Colgarle otra animación al actor. Los datos van a `spr.anims` y los píxeles
   * a `tiras`, porque `spr` se serializa a JSON y una imagen del DOM no cabe.
   */
  function ligarAnimacion(id: string, anim: AnimLigada, img: HTMLImageElement) {
    setCapas((cs) => cs.map((c) => {
      if (c.id !== id || !c.spr) return c;
      return {
        ...c,
        spr: { ...c.spr, anims: [...(c.spr.anims ?? []), anim] },
        tiras: { ...(c.tiras ?? {}), [anim.clave]: img },
      };
    }));
    setAviso(
      `«${anim.clave}» ligada · ${anim.fotogramas} cuadros. Añade un paso «Cambio» a la ruta para usarla.`,
    );
  }

  /**
   * Desligarla, y de paso limpiar los pasos que la llamaban.
   *
   * Dejarlos apuntando a una clave que ya no existe sería una espera invisible
   * en la ruta: el actor se quedaría clavado unos segundos sin motivo visible.
   */
  function desligarAnimacion(id: string, clave: string) {
    setCapas((cs) => cs.map((c) => {
      if (c.id !== id || !c.spr) return c;
      const tiras = { ...(c.tiras ?? {}) };
      delete tiras[clave];
      const pasos = (c.spr.ruta?.pasos ?? [])
        .filter((p) => !(p.tipo === "cambiar" && p.anim === clave))
        .map((p) => (p.anim === clave ? { ...p, anim: undefined } : p));
      return {
        ...c,
        spr: {
          ...c.spr,
          anims: (c.spr.anims ?? []).filter((a) => a.clave !== clave),
          ...(c.spr.ruta ? { ruta: { ...c.spr.ruta, pasos } } : {}),
        },
        tiras: Object.keys(tiras).length ? tiras : undefined,
      };
    }));
    setAviso(`«${clave}» desligada. Los pasos que la usaban vuelven a la animación de la capa.`);
  }

  // ── El grupo: varias capas a la vez ───────────────────────────────────────
  //
  // Todo lo de aquí abajo pasa por `repartirPorCandado` antes de tocar nada.
  // El candado es la única forma de decir «esta no» sin sacarla del grupo, y
  // si una acción en bloque se lo saltara dejaría de significar nada justo
  // donde más falta hace.

  /**
   * Profundidades escalonadas entre las capas marcadas: esto ES el paralaje.
   *
   * Se escalona en el orden de la PILA, no en el que se marcaron. La pila ya
   * dice qué está detrás de qué —es lo que se ve—, y escalonar por el orden de
   * los clics daría un fondo delante de un primer plano en cuanto alguien
   * marcara de abajo arriba.
   */
  function separarGrupo() {
    const { destino, bloqueadas } = repartirPorCandado(capasRef.current, grupo);
    if (!destino.length) {
      setAviso(resumenDelGrupo(0, bloqueadas.length, "separarlas"));
      return;
    }
    const depths = profundidadesEscalonadas(destino.map((c) => c.id), grupoFondo, grupoFrente);
    setCapas((cs) => cs.map((c) => (depths.has(c.id) ? { ...c, depth: depths.get(c.id)! } : c)));
    setAviso(
      resumenDelGrupo(destino.length, bloqueadas.length, "paralaje repartido")
      + ` De ${grupoFondo.toFixed(2)} a ${grupoFrente.toFixed(2)}.`,
    );
  }

  /** La misma profundidad para todas: se mueven como si fueran un solo dibujo. */
  function juntarGrupo() {
    const { destino, bloqueadas } = repartirPorCandado(capasRef.current, grupo);
    if (!destino.length) {
      setAviso(resumenDelGrupo(0, bloqueadas.length, "juntarlas"));
      return;
    }
    const d = Math.round(grupoFondo * 100) / 100;
    const ids = new Set(destino.map((c) => c.id));
    setCapas((cs) => cs.map((c) => (ids.has(c.id) ? { ...c, depth: d } : c)));
    setAviso(resumenDelGrupo(destino.length, bloqueadas.length, `misma profundidad (${d.toFixed(2)})`));
  }

  /** La animación de la capa activa, copiada a las marcadas. */
  function copiarMovAlGrupo() {
    const origen = capasRef.current.find((c) => c.id === capaActivaId);
    if (!origen?.mov) {
      setAviso("La capa que estás editando no tiene animación que copiar.");
      return;
    }
    // La de origen se queda como está: ya tiene el movimiento, y desfasarla
    // movería justo la que se acaba de dejar a gusto.
    const { destino, bloqueadas } = repartirPorCandado(
      capasRef.current, grupo.filter((id) => id !== origen.id),
    );
    if (!destino.length) {
      setAviso(resumenDelGrupo(0, bloqueadas.length, "copiarles la animación"));
      return;
    }
    const movs = movimientoParaGrupo(origen.mov, destino.map((c) => c.id), {
      desfasar: desacompasarGrupo,
    });
    setCapas((cs) => cs.map((c) => (movs.has(c.id) ? { ...c, mov: movs.get(c.id) } : c)));
    reiniciarMovimientosCapa();
    setAviso(resumenDelGrupo(destino.length, bloqueadas.length, "animación copiada"));
  }

  /** Dejar quietas las marcadas, sean sprites o capas normales. */
  function quitarMovDelGrupo() {
    const { destino, bloqueadas } = repartirPorCandado(capasRef.current, grupo);
    if (!destino.length) {
      setAviso(resumenDelGrupo(0, bloqueadas.length, "dejarlas quietas"));
      return;
    }
    const ids = new Set(destino.map((c) => c.id));
    setCapas((cs) => cs.map((c) => (ids.has(c.id)
      ? { ...c, mov: undefined, ...(c.spr ? { spr: { ...c.spr, ruta: undefined, trayectoria: undefined } } : {}) }
      : c)));
    setAviso(resumenDelGrupo(destino.length, bloqueadas.length, "quietas"));
  }

  /** Bloquear o soltar de golpe. Este SÍ pasa por encima del candado: es él. */
  function bloquearGrupo(bloquear: boolean) {
    const ids = new Set(grupo);
    if (!ids.size) { setAviso("No hay capas en el grupo."); return; }
    setCapas((cs) => cs.map((c) => (ids.has(c.id) ? { ...c, bloqueada: bloquear } : c)));
    setAviso(`${ids.size} capa${ids.size === 1 ? "" : "s"} ${bloquear ? "bloqueada" : "suelta"}${ids.size === 1 ? "" : "s"}.`);
  }

  function verGrupo(visible: boolean) {
    const { destino, bloqueadas } = repartirPorCandado(capasRef.current, grupo);
    if (!destino.length) {
      setAviso(resumenDelGrupo(0, bloqueadas.length, visible ? "mostrarlas" : "ocultarlas"));
      return;
    }
    const ids = new Set(destino.map((c) => c.id));
    setCapas((cs) => cs.map((c) => (ids.has(c.id) ? { ...c, visible } : c)));
    setAviso(resumenDelGrupo(destino.length, bloqueadas.length, visible ? "visibles" : "ocultas"));
  }

  /** Quitar la ruta de la capa activa y dejarla quieta. */
  function borrarRutaCapa() {
    const capa = capasRef.current.find((c) => c.id === capaActivaId);
    if (!capa) return;
    if (capa.spr) {
      upd(capa.id, { spr: { ...capa.spr, ruta: undefined, trayectoria: undefined } });
    } else {
      upd(capa.id, { mov: undefined });
    }
    setAviso(`«${capa.nombre}» se queda quieta.`);
  }

  /** Cuántos puntos tiene lo seleccionado, sea sprite o capa. */
  function puntosDeLaRuta(): number {
    const capa = capas.find((c) => c.id === capaActivaId);
    if (!capa) return 0;
    if (capa.spr) return (capa.spr.ruta?.pasos ?? []).filter((p) => p.tipo === "mover").length;
    return capa.mov?.tipo === "ruta" ? (capa.mov.pasos ?? []).length : 0;
  }

  /**
   * Dejar el lienzo a la vista antes de pedir que lo toquen.
   *
   * La cabecera del sitio es pegajosa y flota por encima: si el lienzo ha
   * quedado alto, su parte de arriba está DEBAJO de la cabecera y los toques
   * ahí se los queda ella. En un móvil eso es un tercio del lienzo muerto, sin
   * ninguna pista de por qué. Se centra en pantalla y el problema desaparece.
   */
  function acercarLienzo() {
    caja.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** Meter un efecto del catálogo en el sitio que se toque. */
  function anadirEfecto(kind: string, nx: number, ny: number) {
    const { efectos: nuevos, avisos } = normalizarEfectos([{ id: kind, x: nx, y: ny }]);
    if (!nuevos.length) {
      setAviso(avisos[0] ?? "Ese efecto no está en el catálogo.");
      return;
    }
    const fx = { ...nuevos[0], id: `fx${Date.now().toString(36)}` };
    setEfectos((prev) => [...prev, fx]);
    setAviso(
      `${nombreEfecto(fx.kind)} en la escena`
      + (fx.espacio === "encuadre" ? " · llena el cuadro, no sigue a la cámara." : "."),
    );
  }

  function quitarEfecto(id: string) {
    setEfectos((prev) => prev.filter((e) => e.id !== id));
  }

  function movCapaRapido(tipo: string) {
    if (!capaActivaId) return;
    if (!tipo) {
      upd(capaActivaId, { mov: undefined });
      return;
    }
    if (tipo === "ruta") {
      // Una ruta sin puntos no existe todavía: no hay nada que guardar. Lo que
      // se hace es dejar el lienzo esperando toques, que es como se construye.
      // Guardar aquí un `mov` vacío sería guardar un movimiento que no mueve.
      setModoEdicion("punto");
      acercarLienzo();
      setAviso("Toca la escena para ir marcando por dónde pasa. Cada toque, un tramo.");
      return;
    }
    if (tipo === "trayectoria") {
      upd(capaActivaId, {
        mov: normalizarMov({
          tipo: "trayectoria",
          desdeX: 0, desdeY: 0,
          x: 0.25, y: 0,
          segundos: 4, bucle: true, volver: true, suavizado: "suave",
        }),
      });
      return;
    }
    if (tipo === "deriva") {
      upd(capaActivaId, { mov: normalizarMov({ tipo: "deriva", x: 0.08, y: 0, bucle: true }) });
      return;
    }
    upd(capaActivaId, {
      mov: normalizarMov({ tipo: tipo as MovCapa["tipo"], amplitud: 0.03, segundos: 4 }),
    });
  }

  const upd = (id: string, p: Partial<CapaImg>) =>
    setCapas((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  async function aplicarCorreccionCroma(id: string, resultado: CromaCorregido) {
    const img = await cargar(resultado.url);
    upd(id, { img, via: "croma", vacio: resultado.vacio });
    setEditandoCromaId(null);
    setAviso(
      `Fondo corregido: ${resultado.eliminados.toLocaleString("es-MX")} píxeles limpiados · `
      + `${Math.round(resultado.vacio * 1000) / 10}% transparente.`,
    );
  }
  const mover = (i: number, d: -1 | 1) =>
    setCapas((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length || cs[i]?.bloqueada) return cs;
      const n = [...cs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const moverAlExtremo = (id: string, extremo: "fondo" | "frente") =>
    setCapas((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      if (i < 0 || cs[i].bloqueada) return cs;
      const n = [...cs];
      const [capa] = n.splice(i, 1);
      n.splice(extremo === "fondo" ? 0 : n.length, 0, capa);
      return n;
    });
  const eliminarCapa = (id: string) => {
    const capa = capasRef.current.find((c) => c.id === id);
    if (!capa || capa.bloqueada) return;
    relojesSpriteRef.current.delete(id);
    relojesCapaRef.current.delete(id);
    if (rutaVisibleId === id) setRutaVisibleId(null);
    setCapas((cs) => cs
      .filter((c) => c.id !== id)
      .map((c) => c.mov?.referenciaCapaId === capa.clave
        ? { ...c, mov: { ...c.mov, referenciaCapaId: undefined } }
        : c));
  };

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
        {/* Lo de menos uso, plegado.
            Eran siete botones en fila: en un móvil, cuatro filas de mandos
            ANTES de ver el lienzo. Y «Mover cámara» sobraba desde que el
            transporte tiene su propio play, justo debajo de la vista. */}
        <button
          type="button"
          onClick={() => setMasAcciones((v) => !v)}
          className="btn-ghost text-xs"
          aria-expanded={masAcciones}
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-accent" />
          {masAcciones ? "Menos" : "Más acciones"}
        </button>
      </div>

      <div className={masAcciones ? "flex flex-wrap items-center gap-2" : "hidden"}>
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
          relojesCapaRef.current.clear();
          setRutaVisibleId(null);
          setCapas([]);
          setBorradorInfo(null);
          void borrarBorradorMontaje();
          setAviso("Vacío.");
        }} disabled={!capas.length} className="btn-ghost text-xs text-danger">
          <Trash2 className="h-3.5 w-3.5" /> Vaciar
        </button>
        {capas.some((c) => !c.spr && c.mov) && (
          <button
            type="button"
            onClick={() => {
              setCapas((prev) => prev.map((c) => (c.spr ? c : { ...c, mov: undefined })));
              relojesCapaRef.current.clear();
              setAviso("Capas de decorado quietas. Los sprites conservan su animación.");
            }}
            className="btn-ghost text-xs"
            title="Quita flotar/deriva de islas, suelo, etc.; no toca sprites"
          >
            Congelar decorado
          </button>
        )}
      </div>

      {borradorPendiente && !capas.length && (
        <div className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-[11px] text-fg">
          Hay un montaje autoguardado
          ({borradorPendiente.capas.length} capas · {new Date(borradorPendiente.guardadoEn).toLocaleString()}).
          {" "}
          <button type="button" className="text-accent underline" onClick={() => void recuperarBorrador()}>
            Recuperarlo
          </button>
          {" · "}
          <button type="button" className="text-muted underline" onClick={() => {
            setBorradorPendiente(null);
            void borrarBorradorMontaje();
          }}>
            Descartar
          </button>
        </div>
      )}
      {borradorInfo && capas.length > 0 && (
        <p className="text-[10px] text-muted">{borradorInfo}</p>
      )}

      {/* `minmax(0,…)` en las DOS pistas, no solo en la ancha.
          Sin el 0, una pista de grid no puede encoger por debajo de su
          contenido: un sprite con nombre largo estiraba la columna de capas a
          454 px dentro de una ventana de 390, la página cogía scroll
          horizontal y todo parecía «hacerse gigante». El `min-w-0` de las
          tarjetas es lo que deja que los `truncate` de dentro funcionen. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="card order-2 min-w-0 space-y-2 self-start p-3 lg:order-1 lg:sticky lg:top-2">
          <div className="flex items-center gap-2">
            <span className="label">Capas · vista compacta</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{capas.length}</span>
          </div>
          {!!capas.length && (
            <p className="text-[10px] text-muted">
              Toca el nombre para editarla; marca la casilla para meterla en el grupo y aplicarle
              paralaje o animación en bloque. Arriba queda detrás; abajo, delante.
            </p>
          )}
          {!capas.length && (
            <p className="text-[11px] text-muted">
              La primera imagen fija el tamaño y hace de fondo. Las siguientes tienen que ser PNG
              con transparencia. Encadena acercar → pan → fade para controlar la toma a mano.
            </p>
          )}
          <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-0.5">
            {capas.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-1 rounded-lg border p-1 ${
                c.id === capaActivaId ? "border-accent bg-accent/10" : "border-border bg-surface-2/50"
              }`}>
                {/* Marcar aquí es lo que construye el grupo. Vive en la lista
                    de siempre a propósito: si solo estuviera dentro de la
                    pestaña «Grupo», nadie descubriría que se puede trabajar
                    con varias capas a la vez. */}
                <input
                  type="checkbox"
                  checked={grupo.includes(c.id)}
                  onChange={() => setGrupo((g) => (g.includes(c.id) ? g.filter((x) => x !== c.id) : [...g, c.id]))}
                  className="ml-0.5 h-3 w-3 shrink-0 accent-accent"
                  title="Trabajar con esta capa en grupo"
                  aria-label={`${grupo.includes(c.id) ? "Quitar" : "Añadir"} ${c.nombre} del grupo`}
                />
                <button type="button" onClick={() => setCapaActivaId(c.id)}
                  className="min-w-0 flex-1 truncate px-1 py-1 text-left text-[11px] font-medium"
                  title={c.nombre}>
                  <span className={c.visible ? "" : "text-muted line-through"}>{c.nombre}</span>
                  {c.spr && <span className="ml-1 text-[8px] text-accent">sprite</span>}
                </button>
                <button type="button" onClick={() => upd(c.id, { bloqueada: !c.bloqueada })}
                  className={c.bloqueada ? "text-gold" : "text-muted hover:text-fg"}
                  title={c.bloqueada ? "Desbloquear capa" : "Bloquear capa"}
                  aria-label={`${c.bloqueada ? "Desbloquear" : "Bloquear"} ${c.nombre}`}>
                  {c.bloqueada ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || c.bloqueada}
                  className="text-muted hover:text-fg disabled:opacity-25" title="Una capa hacia detrás"
                  aria-label={`Mover ${c.nombre} detrás`}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === capas.length - 1 || c.bloqueada}
                  className="text-muted hover:text-fg disabled:opacity-25" title="Una capa hacia delante"
                  aria-label={`Mover ${c.nombre} delante`}><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => upd(c.id, { visible: !c.visible })}
                  disabled={c.bloqueada} className="text-muted hover:text-fg disabled:opacity-25"
                  aria-label={`${c.visible ? "Ocultar" : "Mostrar"} ${c.nombre}`}>
                  {c.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 space-y-2 lg:order-2">
          {/* La vista previa, arriba y pegada. Antes vivía debajo de toda la
              cola: para tocar un paso había que bajar, y se editaba a ciegas.
              Ahora se queda a la vista mientras se ajusta lo de abajo. */}
          {/* Pegada solo a partir de tablet. En un móvil la pantalla no da para
              tener la vista previa fija Y los controles: se comía los botones de
              abajo y no se podía ni añadir un paso a la cola. */}
          <div className="space-y-2 rounded-xl border border-border bg-surface p-2">
            <div className="space-y-2 rounded-lg bg-surface">
              <div className="sticky top-1 z-30 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/95 p-1.5 shadow-lg shadow-black/40 backdrop-blur">
                <span className="hidden text-[10px] text-muted sm:inline">Editando</span>
                <select value={capaActivaId ?? ""} onChange={(e) => setCapaActivaId(e.target.value || null)}
                  className="input min-w-0 flex-1 py-1 text-[11px]" aria-label="Capa activa">
                  {!capas.length && <option value="">Sin capas</option>}
                  {capas.map((c) => (
                    <option key={c.id} value={c.id}>{c.bloqueada ? "🔒 " : ""}{c.nombre}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setCapaActivaId(capas[indiceActivo - 1]?.id ?? capaActivaId)}
                  disabled={indiceActivo <= 0} className="rounded border border-border p-1 text-muted disabled:opacity-25"
                  title="Capa anterior" aria-label="Capa anterior"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setCapaActivaId(capas[indiceActivo + 1]?.id ?? capaActivaId)}
                  disabled={indiceActivo < 0 || indiceActivo >= capas.length - 1}
                  className="rounded border border-border p-1 text-muted disabled:opacity-25"
                  title="Capa siguiente" aria-label="Capa siguiente"><ChevronDown className="h-3.5 w-3.5" /></button>
                {capaActiva && (
                  <button type="button" onClick={() => upd(capaActiva.id, { bloqueada: !capaActiva.bloqueada })}
                    className={`rounded border p-1 ${capaActiva.bloqueada ? "border-gold text-gold" : "border-border text-muted"}`}
                    title={capaActiva.bloqueada ? "Desbloquear esta capa" : "Bloquear esta capa"}
                    aria-label={capaActiva.bloqueada ? "Desbloquear esta capa" : "Bloquear esta capa"}>
                    {capaActiva.bloqueada ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            <div
              ref={caja}
              // «touch-none» es lo que hace que en el móvil se pueda arrastrar:
              // sin ello el navegador se queda el gesto para desplazar la página
              // y el dedo no mueve nada.
              className={`z-20 touch-none overflow-hidden rounded-lg border border-border bg-black shadow-lg shadow-black/40 sm:sticky sm:top-12 ${
                modoEdicion === "punto" ? "cursor-crosshair"
                  : modoEdicion === "colocar" ? "cursor-move"
                  : enSecuencia ? "" : arrastrando ? "cursor-grabbing" : "cursor-grab"
              }`}
              // Colocar la cámara a mano: se arrastra la escena y cada capa se
              // mueve con su paralaje, así que se ve dónde va a quedar todo
              // ANTES de animar. Es la única forma de decir «empieza desde
              // abajo»: con los números a ciegas no hay manera de acertar.
              onPointerDown={(e) => {
                if (enSecuencia || !capas.length) return;
                const xy = coordsEnLienzo(e);
                if (efectoPendiente && xy) {
                  e.preventDefault();
                  anadirEfecto(efectoPendiente, xy.x, xy.y);
                  setEfectoPendiente(null);
                  return;
                }
                if (modoEdicion === "punto" && xy) {
                  e.preventDefault();
                  anadirPuntoRuta(xy.x, xy.y);
                  return;
                }
                if (modoEdicion === "colocar" && xy) {
                  e.preventDefault();
                  dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                  colocarSeleccion(xy.x, xy.y);
                  arrastreRef.current = { x: e.clientX, y: e.clientY };
                  setArrastrando(true);
                  return;
                }
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
                if (modoEdicion === "colocar" && arrastreRef.current && dedos.current.has(e.pointerId)) {
                  const xy = coordsEnLienzo(e);
                  if (xy) colocarSeleccion(xy.x, xy.y);
                  arrastreRef.current = { x: e.clientX, y: e.clientY };
                  return;
                }
                if (modoEdicion === "punto") return;
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
            {/* El transporte, PEGADO a la vista. Antes vivía al final de todos
                los mandos: para darle al play había que bajar hasta abajo, y
                desde ahí ya no se veía lo que estabas reproduciendo. */}
            <BarraTransporte
              reproduciendo={enSecuencia || (moviendo && !retenerPoseRef.current && anim !== "quieto")}
              progreso={progresoUi}
              disabled={!capas.length}
              onPlayPause={toggleReproduccion}
              onReset={() => {
                pararSecuencia();
                centrarTodo();
              }}
              onSeek={seekCola}
              onPaso={saltarPaso}
              onAbrirPreview={() => {
                setPreviewAbierta(true);
                if (!enSecuencia && cola.length) iniciarSecuencia();
              }}
            />
            <PestanasMontaje
              activo={panel}
              onCambiar={setPanel}
              contador={capaActiva?.nombre ?? null}
            />
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
            </div>

            <PanelMontajeCaja activo={panel === "elemento"}>
            {capaActiva && (
              <div className={`space-y-2 rounded-lg border p-2 ${
                capaActiva.bloqueada ? "border-gold/50 bg-gold/5" : "border-accent/35 bg-accent/5"
              }`}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{capaActiva.nombre}</p>
                    <p className="text-[9px] text-muted">
                      Capa {indiceActivo + 1} de {capas.length} · {indiceActivo === 0 ? "al fondo" : indiceActivo === capas.length - 1 ? "al frente" : "entre otras capas"}
                    </p>
                  </div>
                  {capaActiva.bloqueada && <span className="chip bg-gold/15 text-[9px] text-gold">bloqueada</span>}
                  <button type="button" onClick={() => upd(capaActiva.id, { bloqueada: !capaActiva.bloqueada })}
                    className="btn-ghost px-2 py-1 text-[10px]">
                    {capaActiva.bloqueada ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {capaActiva.bloqueada ? "Desbloquear" : "Bloquear"}
                  </button>
                </div>

                <fieldset disabled={!!capaActiva.bloqueada} className="space-y-2 disabled:opacity-60">
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                    <button type="button" onClick={() => moverAlExtremo(capaActiva.id, "fondo")}
                      disabled={indiceActivo === 0} className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-25"
                      title="Enviar detrás de todas"><ChevronsUp className="h-3 w-3" /> Al fondo</button>
                    <button type="button" onClick={() => mover(indiceActivo, -1)} disabled={indiceActivo <= 0}
                      className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-25">
                      <ChevronUp className="h-3 w-3" /> Detrás</button>
                    <button type="button" onClick={() => mover(indiceActivo, 1)} disabled={indiceActivo >= capas.length - 1}
                      className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-25">
                      <ChevronDown className="h-3 w-3" /> Delante</button>
                    <button type="button" onClick={() => moverAlExtremo(capaActiva.id, "frente")}
                      disabled={indiceActivo === capas.length - 1} className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-25"
                      title="Enviar delante de todas"><ChevronsDown className="h-3 w-3" /> Al frente</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => upd(capaActiva.id, { visible: !capaActiva.visible })}
                      className="btn-ghost px-2 py-1 text-[10px]">
                      {capaActiva.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {capaActiva.visible ? "Visible" : "Oculta"}
                    </button>
                    {!capaActiva.spr && indiceActivo > 0 && (
                      <button type="button" onClick={() => setEditandoCromaId(capaActiva.id)}
                        className="btn-ghost px-2 py-1 text-[10px]">
                        <Paintbrush className="h-3.5 w-3.5 text-accent" /> Corregir fondo
                      </button>
                    )}
                    <button type="button" onClick={() => eliminarCapa(capaActiva.id)}
                      className="btn-ghost ml-auto px-2 py-1 text-[10px] text-danger">
                      <Trash2 className="h-3.5 w-3.5" /> Borrar capa
                    </button>
                  </div>

                  {/* Dos grupos, no cuatro bloques apilados.
                      Antes se montaban a la vez el inspector, los mandos de
                      movimiento, los del sprite Y las herramientas de imagen:
                      2.199 px de alto en un móvil, con la vista previa fuera
                      de pantalla en cuanto tocabas algo. «Imagen» es lo que
                      casi nunca se usa —sustituir, regenerar, exportar— así
                      que deja de estorbar por defecto. */}
                  <div className="flex gap-1" role="tablist" aria-label="Qué editar de esta capa">
                    {([
                      ["animar", "Animar"],
                      ["grupo", grupo.length ? `Grupo · ${grupo.length}` : "Grupo"],
                      ["imagen", "Imagen"],
                    ] as const).map(([id, et]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={subPanel === id}
                        onClick={() => setSubPanel(id)}
                        className={`flex-1 rounded-md border px-2 py-1 text-[10px] ${
                          subPanel === id
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border text-muted hover:bg-surface-2"
                        }`}
                      >
                        {et}
                      </button>
                    ))}
                  </div>

                  <div className={subPanel === "grupo" ? "" : "hidden"}>
                    <PanelGrupo
                      capas={capas.map((c) => ({
                        id: c.id, nombre: c.nombre, depth: c.depth,
                        visible: c.visible, bloqueada: c.bloqueada, tieneMov: !!c.mov,
                      }))}
                      seleccion={grupo}
                      onSeleccion={setGrupo}
                      fondo={grupoFondo}
                      frente={grupoFrente}
                      onFondo={setGrupoFondo}
                      onFrente={setGrupoFrente}
                      onEscalonar={separarGrupo}
                      onJuntas={juntarGrupo}
                      nombreOrigen={capaActiva?.mov ? capaActiva.nombre : null}
                      puedeCopiar={!!capaActiva?.mov}
                      desacompasar={desacompasarGrupo}
                      onDesacompasar={setDesacompasarGrupo}
                      onCopiarMov={copiarMovAlGrupo}
                      onQuitarMov={quitarMovDelGrupo}
                      onBloquear={bloquearGrupo}
                      onVisible={verGrupo}
                    />
                  </div>

                  <div className={subPanel === "animar" ? "space-y-2" : "hidden"}>
                  <InspectorRapido
                    esSprite={!!capaActiva.spr}
                    modo={modoEdicion}
                    onModo={(m) => { setModoEdicion(m); if (m) acercarLienzo(); }}
                    moverTodo={moverTodo}
                    onMoverTodo={setMoverTodo}
                    volverRuta={volverRuta}
                    onVolverRuta={(v) => {
                      setVolverRuta(v);
                      const capa = capasRef.current.find((c) => c.id === capaActivaId);
                      if (!capa?.spr) return;
                      const nucleo = (capa.spr.ruta?.pasos ?? []).filter(esPasoDeIda);
                      if (!nucleo.length) return;
                      const finales = v ? aplicarVolverRuta(nucleo, capa.spr) : nucleo;
                      upd(capa.id, {
                        spr: { ...capa.spr, ruta: { pasos: finales, bucle: v || !!capa.spr.ruta?.bucle } },
                      });
                    }}
                    voltearDefault={voltearDefault}
                    onVoltearDefault={setVoltearDefault}
                    pausaSeg={pausaSegInspector}
                    onPausaSeg={setPausaSegInspector}
                    onAddPausa={anadirPausaRuta}
                    onMovCapa={movCapaRapido}
                    onAplicarATodas={aplicarMovimientoATodas}
                    puedeAplicarATodas={!!capaActiva.mov && capas.length > 1}
                    onBorrarRuta={borrarRutaCapa}
                    puntosRuta={puntosDeLaRuta()}
                    movCapaTipo={capaActiva.mov?.tipo ?? ""}
                    bloqueada={capaActiva.bloqueada}
                  />

                  {capaActiva.via && (
                    <p className={`text-[10px] ${capaActiva.via === "opaca" && indiceActivo > 0 ? "text-gold" : "text-muted"}`}>
                      {capaActiva.via === "transparente" && "Vino con transparencia"}
                      {capaActiva.via === "croma" && "Se le quitó el color de fondo"}
                      {capaActiva.via === "opaca" && (indiceActivo === 0 ? "Fondo opaco" : "Opaca: tapará las capas de atrás")}
                      {typeof capaActiva.vacio === "number" ? ` · ${Math.round(capaActiva.vacio * 100)}% vacío` : ""}
                    </p>
                  )}
                  <div className="grid gap-1 sm:grid-cols-3">
                    <Barra etiqueta="Profundidad" valor={referenciaActiva?.depth ?? capaActiva.depth} max={1} paso={0.01}
                      disabled={!!referenciaActiva}
                      onCambio={(v) => upd(capaActiva.id, { depth: v })} formato={(v) => v.toFixed(2)} />
                    <Barra etiqueta="Zoom capa" valor={capaActiva.escala} min={1} max={1.4} paso={0.01}
                      onCambio={(v) => upd(capaActiva.id, { escala: v })} formato={(v) => `${Math.round((v - 1) * 100)}%`} />
                    <Barra etiqueta="Opacidad" valor={capaActiva.opacidad} max={1} paso={0.01}
                      onCambio={(v) => upd(capaActiva.id, { opacidad: v })} formato={(v) => `${Math.round(v * 100)}%`} />
                  </div>
                  <details className="rounded-lg border border-border/70 bg-surface-2/30 p-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-muted">Más opciones de movimiento</summary>
                    <div className="mt-2 space-y-2">
                  {!capaActiva.spr && (
                    <MandosMovimientoCapa
                      mov={capaActiva.mov}
                      referencias={capas
                        .filter((c) => c.id !== capaActiva.id && !c.spr)
                        .map((c) => ({ id: c.clave, nombre: c.nombre }))}
                      onMov={(m) => {
                        const ref = m?.referenciaCapaId
                          ? capas.find((c) => c.clave === m.referenciaCapaId)
                          : undefined;
                        upd(capaActiva.id, { mov: m, ...(ref ? { depth: ref.depth } : {}) });
                      }}
                      corriendo={movimientoCapaCorriendo(capaActiva.id)}
                      onReproducir={() => reproducirMovimientoCapa(capaActiva.id)}
                      onPausar={() => pausarMovimientoCapa(capaActiva.id)}
                      onReiniciar={() => reiniciarMovimientoCapa(capaActiva.id)}
                    />
                  )}
                  {capaActiva.spr && (
                    <MandosSprite
                      spr={capaActiva.spr}
                      mov={capaActiva.mov}
                      superficies={superficies}
                      onSpr={(p) => {
                        let siguiente = { ...capaActiva.spr!, ...p };
                        const superficie = siguiente.superficieId
                          ? superficies.find((s) => s.id === siguiente.superficieId)
                          : undefined;
                        if (superficie && (
                          p.x !== undefined || p.trayectoria !== undefined
                          || p.ruta !== undefined || p.superficieId !== undefined
                        )) {
                          siguiente = ajustarSpriteALaEscena(siguiente, superficie);
                        }
                        upd(capaActiva.id, {
                          spr: siguiente,
                          ...(superficie?.depth !== undefined ? { depth: superficie.depth } : {}),
                        });
                      }}
                      onMov={(m) => upd(capaActiva.id, { mov: m })}
                      onLigarAnim={(anim, img) => ligarAnimacion(capaActiva.id, anim, img)}
                      onDesligarAnim={(clave) => desligarAnimacion(capaActiva.id, clave)}
                      corriendo={spriteCorriendo(capaActiva.id)}
                      rutaVisible={rutaVisibleId === capaActiva.id}
                      onReproducir={() => reproducirSprite(capaActiva.id)}
                      onPausar={() => pausarSprite(capaActiva.id)}
                      onReiniciar={() => reiniciarSprite(capaActiva.id)}
                      onRutaVisible={(visible) => setRutaVisibleId(visible ? capaActiva.id : null)}
                    />
                  )}
                    </div>
                  </details>
                  </div>
                  <div className={subPanel === "imagen" ? "space-y-2" : "hidden"}>
                  <HerramientasCapa
                    nombre={capaActiva.nombre}
                    clave={capaActiva.clave}
                    esSprite={!!capaActiva.spr}
                    esFondo={indiceActivo === 0}
                    formato={tam.current.w >= tam.current.h ? "16:9" : tam.current.h > tam.current.w * 1.2 ? "9:16" : "1:1"}
                    escena={escena}
                    puedeIa={puedeIa}
                    obtenerPng={() => new Promise((res) => {
                      const cv = document.createElement("canvas");
                      cv.width = capaActiva.img.naturalWidth || capaActiva.img.width;
                      cv.height = capaActiva.img.naturalHeight || capaActiva.img.height;
                      cv.getContext("2d")!.drawImage(capaActiva.img, 0, 0);
                      cv.toBlob((b) => res(b), "image/png");
                    })}
                    onNombre={(n) => upd(capaActiva.id, { nombre: n || capaActiva.nombre })}
                    onImagen={(r) => {
                      void (async () => {
                        try {
                          const img = await cargar(r.url);
                          upd(capaActiva.id, {
                            img,
                            via: r.via,
                            vacio: r.vacio,
                            ...(capaActiva.spr ? { spr: undefined } : {}),
                          });
                          setAviso(`«${capaActiva.nombre}» actualizada.`);
                        } catch {
                          setAviso("No se pudo aplicar la nueva imagen a la capa.");
                        }
                      })();
                    }}
                  />
                  </div>
                </fieldset>
              </div>
            )}
            </PanelMontajeCaja>
            <PanelMontajeCaja activo={panel === "camara"}>
            <PanelEfectos
              efectos={efectos}
              pendiente={efectoPendiente}
              onPendiente={(k) => { setEfectoPendiente(k); if (k) acercarLienzo(); }}
              onQuitar={quitarEfecto}
            />
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
            </PanelMontajeCaja>
          </div>

          <PanelMontajeCaja activo={panel === "camara"}>
          <ParalajeGlobalSimple
            anim={anim}
            onAnim={(a) => {
              setAnim(a);
              if (!enSecuencia) pasoMsRef.current = 0;
              retenerPoseRef.current = false;
            }}
            fuerza={fuerza}
            onFuerza={setFuerza}
            durSeg={paralajeDurSeg}
            onDurSeg={setParalajeDurSeg}
            pausaSeg={paralajePausaSeg}
            onPausaSeg={setParalajePausaSeg}
            onAplicarCola={aplicarParalajeACola}
          />

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
          {anim === "quieto" && !enSecuencia && (
            <p className="text-[10px] text-muted">
              Cámara fija: el dragón u otros sprites sí se mueven; islas y cielo se quedan quietos
              salvo que les hayas puesto movimiento propio (usa «Congelar decorado» para quitárselo).
            </p>
          )}
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
          </PanelMontajeCaja>
        </div>
      </div>
      {capaEditandoCroma && (
        <EditorCromaCapa
          key={`${capaEditandoCroma.id}-${capaEditandoCroma.img.src}`}
          nombre={capaEditandoCroma.nombre}
          url={capaEditandoCroma.img.src}
          colorInicial={CROMA}
          onCerrar={() => setEditandoCromaId(null)}
          onAplicar={(resultado) => aplicarCorreccionCroma(capaEditandoCroma.id, resultado)}
        />
      )}

      <VistaPreviaFlotante
        abierto={previewAbierta}
        canvasRef={canvasPreview}
        cajaRef={cajaPreview}
        titulo={cola.length ? `Vista previa · ${cola.length} pasos de cámara` : "Vista previa"}
        reproduciendo={enSecuencia || moviendo}
        progreso={progresoUi}
        onCerrar={() => setPreviewAbierta(false)}
        onPlayPause={toggleReproduccion}
        onReset={() => { pararSecuencia(); centrarTodo(); }}
        onSeek={seekCola}
        onPaso={saltarPaso}
      />
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

/**
 * Las tiras ligadas, de URL a imagen.
 *
 * Una que no cargue se DESCARTA en vez de tumbar la importación entera: el
 * dibujante ya cae a la tira de partida, así que se pierde un cambio de
 * animación y se conserva el resto del montaje. Al revés —perder el proyecto
 * porque falta un PNG secundario— sería mucho peor.
 */
async function cargarTiras(
  urls: Record<string, string> | undefined,
): Promise<Record<string, HTMLImageElement> | undefined> {
  const entradas = Object.entries(urls ?? {});
  if (!entradas.length) return undefined;
  const out: Record<string, HTMLImageElement> = {};
  for (const [clave, url] of entradas) {
    try { out[clave] = await cargar(url); } catch { /* se pinta la de partida */ }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Y al revés, para el autoguardado, que solo sabe de texto. */
async function tirasADataUrls(
  tiras: Record<string, HTMLImageElement> | undefined,
): Promise<{ tiras?: Record<string, string> }> {
  const entradas = Object.entries(tiras ?? {});
  if (!entradas.length) return {};
  const out: Record<string, string> = {};
  for (const [clave, img] of entradas) out[clave] = await imgADataUrl(img);
  return { tiras: out };
}

function hacerCapa(nombre: string, img: HTMLImageElement): CapaImg {
  const id = `c${++contador}`;
  return {
    id, clave: id, nombre, img,
    depth: 0, visible: true, escala: 1, opacidad: 1,
  };
}

function repartirProfundidad(cs: CapaImg[]): CapaImg[] {
  return cs.map((c, i) => {
    const d = cs.length === 1 ? 0 : (i / (cs.length - 1)) ** 1.4;
    return { ...c, depth: Math.round(d * 100) / 100, escala: 1 + d * 0.12 };
  });
}
