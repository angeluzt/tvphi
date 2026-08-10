"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Loader2, Sparkles, Download, AlertTriangle, Play, Pause, Library, Check, FolderOpen, UserRound, Pencil, Plus,
  Search, RefreshCw, ChevronLeft, ChevronRight, Trash2,
} from "lucide-react";
import { pedirJson, pedirJsonCrudo } from "@/lib/pedir-json";
import {
  celdasSpriteEnRejilla, cortarHoja, fotogramasDeTira, nombreSprite, tiraDeFotogramas,
  type CeldaSprite, type Fotograma,
} from "@/lib/lab/sprites";
import { cargarImagen } from "@/lib/lab/quitar-fondo";
import { pngBase64ABlob } from "@/lib/lab/png-base64";
import { zip, bajar } from "@/lib/lab/exportar";
import { leerZip } from "@/lib/story/zip";
import { VistaSprite } from "./vista-sprite";
import { EditorSprite } from "./editor-sprite";
import { EditorCortesSprite } from "./editor-cortes-sprite";
import { EditorHojaSprite } from "./editor-hoja-sprite";
import {
  esPng, nombreCorto, pesoLegible, resumenPrompt,
  type AccionSprite, type AnclajeSprite, type DireccionSprite,
  type SpriteMeta, type VistaSprite as TipoVistaSprite,
} from "@/lib/lab/biblioteca";
import {
  ARCHIVO_HOJA_SPRITE, ARCHIVO_META_SPRITE, ARCHIVO_TIRA_SPRITE,
  archivosProyectoSprite, crearProyectoSprite, normalizarProyectoSprite,
} from "@/lib/lab/sprite-proyecto";
import { RangoPreciso } from "./rango-preciso";
import type {
  AnimacionPersonajeSprite, PersonajeSprite, ProyectoAnimacionSprite,
} from "@/lib/lab/personajes-sprite";

// Fabricar un sprite animado: un bicho, varios fotogramas, fondo fuera.
//
// LA IDEA, que es lo que lo hace barato: los N fotogramas van en UNA sola
// imagen. Ocho llamadas serían ocho veces el precio y ocho pájaros distintos,
// porque cada llamada empieza de cero; en una sola, el modelo los ve todos a la
// vez y los hace del mismo bicho. En calidad baja, un pájaro aleteando cuesta
// lo mismo que una imagen suelta: $0.005, y se reutiliza para siempre.
//
// Y «para siempre» solo es verdad si se guarda. De ahí el botón de la
// biblioteca: un ZIP bajado se pierde, y desde el móvil ni se baja.

const IDEAS = [
  "bird flying, wings flapping",
  "bat flying",
  "butterfly flying",
  "fish swimming",
  "spider descending on a thread",
  "sailing boat rocking on waves",
  "horse galloping, side view",
  "person walking, side view silhouette",
  "candle flame flickering",
  "flag waving in the wind",
];

/** Atajos para pedir una animación nueva sobre un personaje ya guardado. */
const ANIM_RAPIDAS: { accion: AccionSprite; label: string; que: string; anclaje?: AnclajeSprite }[] = [
  { accion: "caminar", label: "Caminar", que: "walking cycle, side view", anclaje: "pies" },
  { accion: "correr", label: "Correr", que: "running cycle, side view", anclaje: "pies" },
  { accion: "volar", label: "Volar", que: "flying, wings flapping", anclaje: "centro" },
  { accion: "otro", label: "Saltar", que: "jumping up and landing", anclaje: "pies" },
  { accion: "flotar", label: "Flotar", que: "hovering gently in place", anclaje: "centro" },
  { accion: "nadar", label: "Nadar", que: "swimming cycle, side view", anclaje: "centro" },
  { accion: "caer", label: "Caer", que: "falling downward", anclaje: "centro" },
  { accion: "quieto", label: "Quieto", que: "idle breathing pose", anclaje: "pies" },
];

const POR_PAGINA = 6;

const blobABase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const f = new FileReader();
  f.onload = () => res(String(f.result).replace(/^data:[^,]+,/, ""));
  f.onerror = () => rej(new Error("No se pudo leer la imagen."));
  f.readAsDataURL(blob);
});

/** Lo que queda tras cortar la hoja: los fotogramas y la tira ya pegada. */
interface Hecho {
  /** Cambia solo cuando se fabrica una hoja nueva; mantiene vivo su editor. */
  edicionId: number;
  fotos: Fotograma[];
  /** La tira, para verla y para guardarla. */
  url: string;
  blob: Blob;
  ancho: number;
  alto: number;
  descartados: number;
  /** La hoja de trabajo previa al corte y cómo se divide antes de limpiar. */
  hoja: {
    /** Permanece estable mientras se edita la misma hoja. */
    sesionId: number;
    url: string;
    blob: Blob;
    ancho: number;
    alto: number;
    forma: "tira" | "columna";
    columnas: number;
    filas: number;
    croma: string;
    celdas: CeldaSprite[];
    originalBlob: Blob;
  };
}

export type GenerarSpriteHandle = {
  /** Abre una animación ya guardada (plantilla completa) para editarla. */
  abrirAnimacion: (animationId: string) => Promise<void>;
  /** Prepara el taller para añadir otra animación al mismo personaje. */
  nuevaAnimacionDePersonaje: (characterId: string) => Promise<void>;
};

export const GenerarSprite = forwardRef<GenerarSpriteHandle, {
  onGuardado?: (s: SpriteMeta) => void;
  /** Importar y editar un ZIP no necesita IA y debe seguir disponible sin clave. */
  puedeGenerar?: boolean;
  puedePublicar?: boolean;
}>(function GenerarSprite({ onGuardado, puedeGenerar = true, puedePublicar = true }, ref) {
  const [que, setQue] = useState("");
  const [n, setN] = useState(6);
  const [forma, setForma] = useState<"tira" | "columna">("tira");
  const [distribucion,setDistribucion]=useState<"equilibrada"|"fila"|"columna">("equilibrada");
  const [vista, setVista] = useState<TipoVistaSprite>("lateral");
  const [direccion, setDireccion] = useState<DireccionSprite>("derecha");
  const [accion, setAccion] = useState<AccionSprite>("otro");
  const [anclaje, setAnclaje] = useState<AnclajeSprite>("centro");
  const [calidad, setCalidad] = useState<"low" | "medium" | "high">("low");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fps, setFps] = useState(10);
  const [andando, setAndando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [guardadoPrivado, setGuardadoPrivado] = useState(false);
  const [personajes, setPersonajes] = useState<PersonajeSprite[]>([]);
  const [personajeId, setPersonajeId] = useState("");
  const [busquedaBiblio, setBusquedaBiblio] = useState("");
  const [paginaBiblio, setPaginaBiblio] = useState(0);
  const [cargandoPersonajes, setCargandoPersonajes] = useState(true);
  const [errorPersonajes, setErrorPersonajes] = useState<string | null>(null);
  const [animacionId, setAnimacionId] = useState<string | null>(null);
  /** "" = cuadro maestro del personaje; si no, id de animación de la que se parte. */
  const [refAnimacionId, setRefAnimacionId] = useState("");
  const [refCuadro, setRefCuadro] = useState<"primero" | "ultimo" | "medio">("ultimo");
  const [nombrePersonaje, setNombrePersonaje] = useState("");
  const [descripcionPersonaje, setDescripcionPersonaje] = useState("");
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  // Qué se está borrando ahora mismo y qué está esperando un «seguro que sí».
  // Un id solo: no tiene sentido confirmar dos borrados a la vez.
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [cortesPendientes, setCortesPendientes] = useState(false);
  const [hojaPendiente, setHojaPendiente] = useState(false);
  const [editorActivo, setEditorActivo] = useState<"hoja" | "cortes" | "fotogramas">("hoja");
  const revisionTira = useRef(0);
  const edicionPendiente = cortesPendientes || hojaPendiente;
  const personajeSeleccionado = personajes.find((p) => personajeId && p.spriteId === personajeId) ?? null;

  const terminoBiblio = busquedaBiblio.trim().toLocaleLowerCase("es");
  const personajesFiltrados = personajes.filter((p) => {
    if (!terminoBiblio) return true;
    const haystack = [
      p.nombre,
      p.descripcion,
      p.prompt,
      ...p.animaciones.map((a) => `${a.nombre} ${a.que} ${a.accion}`),
    ].join(" ").toLocaleLowerCase("es");
    return haystack.includes(terminoBiblio);
  });
  const totalPaginas = Math.max(1, Math.ceil(personajesFiltrados.length / POR_PAGINA));
  const paginaClamped = Math.min(paginaBiblio, totalPaginas - 1);
  const personajesPagina = personajesFiltrados.slice(paginaClamped * POR_PAGINA, paginaClamped * POR_PAGINA + POR_PAGINA);

  function seleccionarPersonaje(p: PersonajeSprite | null) {
    setPersonajeId(p?.spriteId ?? "");
    setAnimacionId(null);
    setRefAnimacionId("");
    setRefCuadro("ultimo");
    setGuardadoPrivado(false);
    setNombrePersonaje(p?.nombre ?? "");
    setDescripcionPersonaje(p?.descripcion ?? "");
  }

  function nuevaAnimacion(
    p: PersonajeSprite,
    rapida?: (typeof ANIM_RAPIDAS)[number],
    desdeAnimacionId?: string,
  ) {
    seleccionarPersonaje(p);
    setHecho(null);
    setGuardado(false);
    setAnimacionId(null);
    setRefAnimacionId(desdeAnimacionId ?? "");
    setRefCuadro("ultimo");
    if (rapida) {
      setAccion(rapida.accion);
      if (rapida.anclaje) setAnclaje(rapida.anclaje);
      setQue(rapida.que);
      setNombre(`${p.nombre} · ${rapida.label}`);
    } else {
      setQue("");
      setNombre("");
      setAccion("otro");
    }
    const base = desdeAnimacionId
      ? p.animaciones.find((a) => a.id === desdeAnimacionId)
      : null;
    setAviso(
      base
        ? `Nueva animación para «${p.nombre}» partiendo de «${base.nombre}» (último cuadro). Describe el siguiente movimiento y fabrica.`
        : `Nueva animación para «${p.nombre}»${rapida ? ` · ${rapida.label}` : ""}. Describe el movimiento y fabrica.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function renombrarPersonaje(p: PersonajeSprite) {
    const nombre = nombreEdit.trim();
    if (!p.spriteId || !nombre || nombre === p.nombre) {
      setRenombrandoId(null);
      return;
    }
    try {
      await pedirJson("/api/story/sprite-characters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personajeId: p.spriteId, nombre }),
      });
      setPersonajes((lista) => lista.map((x) => (x.id === p.id ? { ...x, nombre } : x)));
      if (personajeId === p.spriteId) setNombrePersonaje(nombre);
      setRenombrandoId(null);
      setAviso(`Renombrado a «${nombre}».`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /**
   * Borrar una animación suelta.
   *
   * Se pide confirmación en la UI antes de llegar aquí: no hay papelera, y
   * rehacer la animación cuesta otra llamada pagada.
   */
  async function borrarAnimacion(p: PersonajeSprite, a: AnimacionPersonajeSprite) {
    setBorrandoId(a.id);
    setErrorPersonajes(null);
    try {
      await pedirJson(`/api/story/sprite-characters/animations/${a.id}`, { method: "DELETE" });
      setPersonajes((lista) => lista.map((x) => (
        x.id === p.id ? { ...x, animaciones: x.animaciones.filter((y) => y.id !== a.id) } : x
      )));
      // Si era la que estaba abierta en el taller, se suelta: seguir editando
      // algo que ya no existe acaba en un guardado que falla sin explicar nada.
      if (animacionId === a.id) setAnimacionId(null);
      setConfirmarBorrado(null);
      setAviso(`Animación «${a.nombre}» borrada.`);
    } catch (e) {
      setErrorPersonajes((e as Error).message);
    } finally {
      setBorrandoId(null);
    }
  }

  /** Borrar el personaje entero. Se lleva todas sus animaciones por delante. */
  async function borrarPersonaje(p: PersonajeSprite) {
    setBorrandoId(p.id);
    setErrorPersonajes(null);
    try {
      await pedirJson(`/api/story/sprite-characters/${p.id}`, { method: "DELETE" });
      setPersonajes((lista) => lista.filter((x) => x.id !== p.id));
      if (personajeId === p.spriteId || personajeId === p.id) {
        setPersonajeId("");
        setAnimacionId(null);
      }
      setConfirmarBorrado(null);
      setAviso(`«${p.nombre}» y sus ${p.animaciones.length} animaciones, borrados.`);
    } catch (e) {
      setErrorPersonajes((e as Error).message);
    } finally {
      setBorrandoId(null);
    }
  }

  async function releerPersonajes() {
    setCargandoPersonajes(true);
    setErrorPersonajes(null);
    try {
      const j = await pedirJson("/api/story/sprite-characters");
      const lista = (j.personajes ?? []) as PersonajeSprite[];
      setPersonajes(lista);
      return lista;
    } catch (e) {
      setErrorPersonajes((e as Error).message || "No se pudieron cargar tus sprites.");
      return [] as PersonajeSprite[];
    } finally {
      setCargandoPersonajes(false);
    }
  }
  useEffect(() => { void releerPersonajes(); }, []);
  useEffect(() => { setPaginaBiblio(0); }, [busquedaBiblio]);

  // Cada correccion crea una URL nueva para la vista previa. La anterior deja
  // de hacer falta en cuanto React cambia de imagen.
  useEffect(() => {
    const url = hecho?.url;
    return () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [hecho?.url]);

  // La hoja vive mientras el proyecto esté abierto. Solo se libera al generar
  // o importar otra, nunca al aplicar un corte: esa es la fuente recuperable.
  useEffect(() => {
    const url = hecho?.hoja.url;
    return () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [hecho?.hoja.url]);

  async function generar() {
    if (!puedeGenerar || que.trim().length < 3) return;
    setError(null); setAviso(null); setHecho(null); setGuardado(false);setGuardadoPrivado(false);setAnimacionId(null);
    setPaso("Dibujando la hoja…");
    try {
      const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/sprite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          que: que.trim(),
          fotogramas: n,
          forma: distribucion === "columna" || (distribucion === "equilibrada" && accion === "caer") ? "columna" : "tira",
          distribucion, vista, direccion, accion, calidad,
          personajeId: personajeId || undefined,
          referenciaAnimacionId: refAnimacionId || undefined,
          referenciaCuadro: refAnimacionId ? refCuadro : undefined,
        }),
      });
      if (!r.ok) throw new Error(j.error || "No se pudo");

      // Si el servidor ya persistió, enganchamos IDs ya (antes del recorte local).
      const pidGuardado = typeof j.personajeId === "string" ? j.personajeId : null;
      const aidGuardado = typeof j.animacionId === "string" ? j.animacionId : null;
      if (pidGuardado) setPersonajeId(pidGuardado);
      if (aidGuardado) setAnimacionId(aidGuardado);
      if (j.guardadoEnDb && aidGuardado) setGuardadoPrivado(true);

      setPaso("Preparando la hoja original…");
      // Nunca fetch("data:…"): con PNGs grandes tira "Failed to fetch" tras un 200.
      const blobHoja = pngBase64ABlob(j.imagen);
      const urlHojaSrc = URL.createObjectURL(blobHoja);
      let imagenHoja: HTMLImageElement;
      try {
        imagenHoja = await cargarImagen(urlHojaSrc);
      } finally {
        URL.revokeObjectURL(urlHojaSrc);
      }
      const formaHoja = (j.forma ?? forma) as "tira" | "columna";
      const cuantos = j.fotogramas ?? n;
      const columnas=Number(j.columnas)||(formaHoja==="columna"?1:cuantos),filas=Number(j.filas)||(formaHoja==="columna"?cuantos:1);
      const celdas=celdasSpriteEnRejilla(imagenHoja.naturalWidth,imagenHoja.naturalHeight,cuantos,{columnas,filas});

      setPaso("Recortando los fotogramas…");
      const urlParaCorte = URL.createObjectURL(blobHoja);
      let hoja: Awaited<ReturnType<typeof cortarHoja>>;
      try {
        hoja = await cortarHoja({
          dataUrl: urlParaCorte,
          fotogramas: cuantos,
          forma: formaHoja,
          croma: j.croma,
          celdas,
        });
      } finally {
        URL.revokeObjectURL(urlParaCorte);
      }
      if (!hoja.fotogramas.length) {
        throw new Error(
          "La hoja salió sin nada recortable: probablemente el modelo no pintó el magenta. "
          + "Vuelve a intentarlo, o pide algo con una silueta más clara."
          + (j.guardadoEnDb ? " (La hoja bruta sí quedó guardada en tu taller.)" : ""),
        );
      }

      // La tira se compone AQUÍ, nada más cortar, y es lo único que se enseña y
      // se guarda a partir de este punto: así lo que se ve en la vista previa
      // es exactamente lo que quedará en la biblioteca, byte a byte.
      const tira = await tiraDeFotogramas(hoja.fotogramas);
      const hechoLocal = {
        edicionId: Date.now(),
        fotos: hoja.fotogramas,
        url: URL.createObjectURL(tira.blob),
        blob: tira.blob,
        ancho: tira.ancho,
        alto: tira.alto,
        descartados: hoja.descartados,
        hoja: {
          sesionId: Date.now(),
          url: URL.createObjectURL(blobHoja),
          blob: blobHoja,
          ancho: imagenHoja.naturalWidth,
          alto: imagenHoja.naturalHeight,
          forma: formaHoja,
          columnas,filas,
          croma: j.croma || "#FF00FF",
          celdas: hoja.celdas,
          originalBlob:blobHoja,
        },
      };
      setHecho(hechoLocal);
      setCortesPendientes(false);
      setHojaPendiente(false);
      setEditorActivo("hoja");
      // Nombre VISIBLE, no de archivo: `nombreSprite` da un slug con
      // guiones, que se lee fatal en una lista. Para archivos sigue valiendo.
      const nom = nombreCorto(que);
      setNombre(nom);
      const nomPers = personajeId || pidGuardado ? nombrePersonaje.trim() || nom : nom;
      if (!personajeId && !pidGuardado) {
        setNombrePersonaje(nom);
        setDescripcionPersonaje(que.trim());
      }

      // Refinar el borrador del servidor (o guardar si falló el autoguardado)
      // con la tira ya limpia/recortada — lo que se ve = lo que queda en DB.
      setPaso("Guardando en tu taller…");
      let refinadoOk = !!j.guardadoEnDb;
      try {
        const refBlob = await (await fetch(hechoLocal.fotos[0].url)).blob();
        const [hojaOriginal, hojaTrabajo, tiraB64, referencia] = await Promise.all([
          blobABase64(hechoLocal.hoja.originalBlob),
          blobABase64(hechoLocal.hoja.blob),
          blobABase64(hechoLocal.blob),
          blobABase64(refBlob),
        ]);
        const guard = await pedirJson("/api/story/sprite-characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personajeId: pidGuardado || personajeId || undefined,
            animacionId: aidGuardado || undefined,
            nombrePersonaje: nomPers,
            descripcionPersonaje: (descripcionPersonaje.trim() || que.trim()).slice(0, 600),
            nombre: nom,
            que: que.trim(),
            fotogramas: hechoLocal.fotos.length,
            fps,
            vista,
            direccion,
            accion,
            anclaje,
            croma: hechoLocal.hoja.croma,
            columnas: hechoLocal.hoja.columnas,
            filas: hechoLocal.hoja.filas,
            anchoHoja: hechoLocal.hoja.ancho,
            altoHoja: hechoLocal.hoja.alto,
            ancho: hechoLocal.ancho,
            alto: hechoLocal.alto,
            celdas: hechoLocal.hoja.celdas,
            hojaOriginal,
            hojaTrabajo,
            tira: tiraB64,
            referencia: (pidGuardado || personajeId) ? undefined : referencia,
          }),
        });
        setPersonajeId(guard.personajeId);
        setAnimacionId(guard.animacionId);
        setGuardadoPrivado(true);
        refinadoOk = true;
        await releerPersonajes();
      } catch (ge) {
        // El POST de refinado es enorme; a veces el proxy lo corta ("Failed to fetch").
        // Si el servidor ya guardó el borrador, NO es pérdida: el taller tiene la hoja.
        if (!j.guardadoEnDb) throw ge;
        refinadoOk = true;
        setGuardadoPrivado(true);
        void releerPersonajes();
        setAviso(
          "Sprite guardado en el taller. El recorte fino no se alcanzó a subir "
          + "(petición grande o red); ábrelo y pulsa Guardar si quieres actualizar la tira limpia.",
        );
      }

      setPaso(null);
      setAviso((prev) => prev ?? (
        `${hoja.fotogramas.length} fotogramas listos`
        + (refinadoOk ? " · guardado en el taller" : "")
        + (j.referenciaDe ? ` · partió de «${j.referenciaDe}»` : j.referenciaUsada ? " · con cuadro maestro" : "")
        + (hoja.descartados ? ` · ${hoja.descartados} salieron vacíos y se tiraron` : "")
        + ` · rejilla ${columnas}×${filas} · ${tira.ancho}×${tira.alto} · ${pesoLegible(tira.blob.size)}`
        + (j.errorGuardado && !aidGuardado ? ` · aviso: ${j.errorGuardado}` : "")
      ));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setPaso(null);
    }
  }

  /** Reemplaza la hoja PRE-CORTE por su versión corregida y vuelve a dividirla. */
  async function aplicarHoja(blobHoja: Blob) {
    if (!hecho || actualizando || cortesPendientes) return;
    const revision = ++revisionTira.current;
    const urlHoja = URL.createObjectURL(blobHoja);
    let aceptada = false;
    setActualizando(true);
    setError(null);
    try {
      const cortada = await cortarHoja({
        dataUrl: urlHoja,
        fotogramas: hecho.hoja.celdas.length,
        forma: hecho.hoja.forma,
        croma: hecho.hoja.croma,
        celdas: hecho.hoja.celdas,
      });
      if (!cortada.fotogramas.length) {
        throw new Error("La hoja corregida no contiene ningún fotograma visible.");
      }
      const tira = await tiraDeFotogramas(cortada.fotogramas);
      if (revision !== revisionTira.current) return;
      setHecho((prev) => prev ? {
        ...prev,
        edicionId: Date.now(),
        fotos: cortada.fotogramas,
        url: URL.createObjectURL(tira.blob),
        blob: tira.blob,
        ancho: tira.ancho,
        alto: tira.alto,
        descartados: cortada.descartados,
        hoja: {
          ...prev.hoja,
          url: urlHoja,
          blob: blobHoja,
          celdas: cortada.celdas,
        },
      } : prev);
      aceptada = true;
      setGuardado(false);
      setGuardadoPrivado(false);
      setHojaPendiente(false);
      setEditorActivo("cortes");
      setAviso(
        `Hoja corregida · ${cortada.fotogramas.length} fotogramas recortados de nuevo`
        + (cortada.descartados ? ` · ${cortada.descartados} celdas vacías` : ""),
      );
    } catch (e) {
      setError((e as Error).message || "No se pudo aplicar la hoja corregida.");
      throw e;
    } finally {
      if (!aceptada) URL.revokeObjectURL(urlHoja);
      if (revision === revisionTira.current) setActualizando(false);
    }
  }

  /** Vuelve a cortar desde la hoja de trabajo, antes de cualquier edición fina. */
  async function aplicarCortes(celdas: CeldaSprite[]) {
    if (!hecho || actualizando || hojaPendiente) return;
    const revision = ++revisionTira.current;
    setActualizando(true);
    setError(null);
    try {
      const cortada = await cortarHoja({
        dataUrl: hecho.hoja.url,
        fotogramas: celdas.length,
        forma: hecho.hoja.forma,
        croma: hecho.hoja.croma,
        celdas,
      });
      if (!cortada.fotogramas.length) {
        throw new Error("Esos cortes no contienen ningún fotograma visible.");
      }
      const tira = await tiraDeFotogramas(cortada.fotogramas);
      if (revision !== revisionTira.current) return;
      setHecho((prev) => prev ? {
        ...prev,
        // Remonta el editor fino: sus borrados pertenecían a los cortes viejos.
        edicionId: Date.now(),
        fotos: cortada.fotogramas,
        url: URL.createObjectURL(tira.blob),
        blob: tira.blob,
        ancho: tira.ancho,
        alto: tira.alto,
        descartados: cortada.descartados,
        hoja: { ...prev.hoja, celdas: cortada.celdas },
      } : prev);
      setGuardado(false);
      setGuardadoPrivado(false);
      setCortesPendientes(false);
      setEditorActivo("fotogramas");
      setAviso(
        `${cortada.fotogramas.length} fotogramas recortados desde la hoja original`
        + (cortada.descartados ? ` · ${cortada.descartados} celdas vacías` : ""),
      );
    } catch (e) {
      setError((e as Error).message || "No se pudieron aplicar los cortes.");
      throw e;
    } finally {
      if (revision === revisionTira.current) setActualizando(false);
    }
  }

  /** Rehace la tira despues de mover, borrar o reordenar un fotograma. */
  async function actualizarFotogramas(fotos: Fotograma[]) {
    const revision = ++revisionTira.current;
    setActualizando(true);
    try {
      const tira = await tiraDeFotogramas(fotos);
      if (revision !== revisionTira.current) return;
      const url = URL.createObjectURL(tira.blob);
      setHecho((prev) => prev ? {
        ...prev,
        fotos,
        url,
        blob: tira.blob,
        ancho: tira.ancho,
        alto: tira.alto,
      } : prev);
      setGuardado(false);
      setGuardadoPrivado(false);
      setAviso(
        `${fotos.length} fotogramas corregidos · ${tira.ancho}×${tira.alto}`
        + ` · ${pesoLegible(tira.blob.size)}`,
      );
    } finally {
      if (revision === revisionTira.current) setActualizando(false);
    }
  }

  async function guardar() {
    if (!hecho || guardando || edicionPendiente) return;
    setGuardando(true);
    setError(null);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).replace(/^data:[^,]+,/, ""));
        fr.onerror = () => rej(new Error("No se pudo leer la tira."));
        fr.readAsDataURL(hecho.blob);
      });
      const j = await pedirJson("/api/story/lab/sprites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim() || nombreCorto(que),
          que: que.trim(),
          fotogramas: hecho.fotos.length,
          fps,
          vista,
          direccion,
          accion,
          anclaje,
          ancho: hecho.ancho,
          alto: hecho.alto,
          tira: b64,
          animationId: animacionId || undefined,
        }),
      });
      setGuardado(true);
      setAviso("Guardado en la biblioteca. Ya se puede usar en cualquier montaje.");
      if (j?.sprite) onGuardado?.(j.sprite as SpriteMeta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEnPersonaje(){if(!hecho||guardando||edicionPendiente||!nombrePersonaje.trim())return;setGuardando(true);setError(null);try{
    const refBlob=await(await fetch(hecho.fotos[0].url)).blob();const [hojaOriginal,hojaTrabajo,tira,referencia]=await Promise.all([
      blobABase64(hecho.hoja.originalBlob),blobABase64(hecho.hoja.blob),blobABase64(hecho.blob),blobABase64(refBlob)]);
    const j=await pedirJson("/api/story/sprite-characters",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      personajeId:personajeId||undefined,animacionId:animacionId||undefined,nombrePersonaje:nombrePersonaje.trim(),descripcionPersonaje:descripcionPersonaje.trim()||que.trim(),
      nombre:nombre.trim()||nombreCorto(que),que:que.trim(),fotogramas:hecho.fotos.length,fps,vista,direccion,accion,anclaje,croma:hecho.hoja.croma,
      columnas:hecho.hoja.columnas,filas:hecho.hoja.filas,anchoHoja:hecho.hoja.ancho,altoHoja:hecho.hoja.alto,ancho:hecho.ancho,alto:hecho.alto,
      celdas:hecho.hoja.celdas,hojaOriginal,hojaTrabajo,tira,referencia:personajeId?undefined:referencia})});
    setPersonajeId(j.personajeId);setAnimacionId(j.animacionId);setGuardadoPrivado(true);await releerPersonajes();
    setAviso(j.actualizada?`Cambios guardados${j.enAtlas?" y actualizados en el atlas.":"."}`:`Animación guardada${j.enAtlas?" y compactada en el atlas.":"."}`);
  }catch(e){setError((e as Error).message);}finally{setGuardando(false);}}

  /**
   * Abrir una animación guardada para corregirla.
   *
   * El JSON trae solo medidas y celdas; las tres imágenes se bajan APARTE y en
   * paralelo. Antes venían las tres en base64 dentro del mismo objeto: varios
   * megas por respuesta, y si fallaba se caía la apertura entera. Ahora cada
   * una es un binario cacheable y el navegador las pide a la vez.
   */
  async function editarAnimacion(id:string){if(paso)return;setPaso("Abriendo la animación…");setError(null);let uh:string|null=null,ut:string|null=null;try{
    const j=await pedirJson(`/api/story/sprite-characters/animations/${id}`),a=j.animacion as ProyectoAnimacionSprite;
    const bajar=async(u:string)=>{const r=await fetch(u);if(!r.ok)throw new Error(`No se pudo bajar la imagen (${r.status}).`);return r.blob();};
    const [bo,bh,bt]=await Promise.all([bajar(a.hojaOriginalUrl),bajar(a.hojaTrabajoUrl),bajar(a.tiraUrl)]);
    uh=URL.createObjectURL(bh);ut=URL.createObjectURL(bt);const fotos=await fotogramasDeTira(ut,a.fotogramas);
    setHecho({edicionId:Date.now(),fotos,url:ut,blob:bt,ancho:a.ancho,alto:a.alto,descartados:0,hoja:{sesionId:Date.now(),url:uh,blob:bh,originalBlob:bo,
      ancho:a.anchoHoja,alto:a.altoHoja,forma:a.columnas>=a.filas?"tira":"columna",columnas:a.columnas,filas:a.filas,croma:a.croma,celdas:a.celdas}});uh=null;ut=null;
    const p=personajes.find(x=>x.spriteId===a.personajeId);setPersonajeId(a.personajeId);setAnimacionId(a.id);setNombrePersonaje(a.personajeNombre);setDescripcionPersonaje(p?.descripcion??a.que);
    setQue(a.que);setNombre(a.nombre);setN(a.fotogramas);setFps(a.fps);setVista(a.vista);setDireccion(a.direccion);setAccion(a.accion);setAnclaje(a.anclaje);
    setForma(a.columnas>=a.filas?"tira":"columna");setDistribucion(a.filas===1?"fila":a.columnas===1?"columna":"equilibrada");setGuardado(false);setGuardadoPrivado(true);
    setCortesPendientes(false);setHojaPendiente(false);setEditorActivo("hoja");setAviso("Animación abierta para corregir.");
  }catch(e){if(uh)URL.revokeObjectURL(uh);if(ut)URL.revokeObjectURL(ut);setError((e as Error).message);}finally{setPaso(null);}}

  const tallerApi = useRef({
    editarAnimacion: async (_id: string) => {},
    nuevaAnimacion: (_p: PersonajeSprite) => {},
    releerPersonajes: async () => [] as PersonajeSprite[],
  });
  tallerApi.current = { editarAnimacion, nuevaAnimacion, releerPersonajes };

  useImperativeHandle(ref, () => ({
    abrirAnimacion: (id) => tallerApi.current.editarAnimacion(id),
    nuevaAnimacionDePersonaje: async (characterId) => {
      const lista = await tallerApi.current.releerPersonajes();
      const p = lista.find((x) => x.spriteId === characterId);
      if (!p) {
        setError("No encontré ese personaje en tu taller. Quizá lo borraste o es de otra cuenta.");
        return;
      }
      tallerApi.current.nuevaAnimacion(p);
    },
  }));

  async function descargar() {
    if (!hecho || edicionPendiente) return;
    const base = nombreSprite(nombre || que);
    const proyecto = crearProyectoSprite({
      nombre: nombre.trim() || base,
      que: que.trim() || base,
      fps,
      vista,
      direccion,
      accion,
      anclaje,
      forma: hecho.hoja.forma,
      columnas:hecho.hoja.columnas,filas:hecho.hoja.filas,
      croma: hecho.hoja.croma,
      anchoHoja: hecho.hoja.ancho,
      altoHoja: hecho.hoja.alto,
      fotogramas: hecho.fotos.length,
      anchoFotograma: hecho.ancho,
      altoFotograma: hecho.alto,
      celdas: hecho.hoja.celdas,
    });
    const archivos = archivosProyectoSprite(
      proyecto,
      new Uint8Array(await hecho.hoja.blob.arrayBuffer()),
      new Uint8Array(await hecho.blob.arrayBuffer()),
    );
    bajar(zip(archivos), `sprite-${base}.zip`);
  }

  async function importarProyecto(file: File | null) {
    if (!file || paso) return;
    if (file.size > 40 * 1024 * 1024) {
      setError("Ese proyecto pesa más de 40 MB y no es seguro abrirlo en el navegador.");
      return;
    }
    setPaso("Abriendo el proyecto del sprite…");
    setError(null);
    setAviso(null);
    let urlHoja: string | null = null;
    let urlTira: string | null = null;
    try {
      const entradas = await leerZip(file);
      const porNombre = (nombre: string) => {
        const base = nombre.replace(/^.*\//, "");
        return entradas.find((e) => e.nombre === nombre || e.nombre.replace(/^.*\//, "") === base);
      };
      const metaEnt = porNombre(ARCHIVO_META_SPRITE);
      if (!metaEnt) throw new Error("El ZIP no contiene sprite.json.");
      let crudo: unknown;
      try { crudo = JSON.parse(new TextDecoder().decode(metaEnt.datos)); }
      catch { throw new Error("sprite.json está dañado."); }
      const proyecto = normalizarProyectoSprite(crudo);
      const hojaEnt = porNombre(proyecto.hoja.archivo);
      const tiraEnt = porNombre(proyecto.tira.archivo);
      if (!hojaEnt) throw new Error(`Falta ${proyecto.hoja.archivo} en el ZIP.`);
      if (!tiraEnt) throw new Error(`Falta ${proyecto.tira.archivo} en el ZIP.`);
      if (!esPng(hojaEnt.datos) || !esPng(tiraEnt.datos)) {
        throw new Error("La hoja original o la tira final no son PNG válidos.");
      }

      const blobHoja = new Blob([hojaEnt.datos.slice()], { type: "image/png" });
      const blobTira = new Blob([tiraEnt.datos.slice()], { type: "image/png" });
      urlHoja = URL.createObjectURL(blobHoja);
      urlTira = URL.createObjectURL(blobTira);
      const [imHoja, imTira, fotos] = await Promise.all([
        cargarImagen(urlHoja),
        cargarImagen(urlTira),
        fotogramasDeTira(urlTira, proyecto.tira.fotogramas),
      ]);
      if (imHoja.naturalWidth !== proyecto.hoja.ancho || imHoja.naturalHeight !== proyecto.hoja.alto) {
        throw new Error("El tamaño de la hoja original no coincide con sprite.json.");
      }
      if (
        imTira.naturalWidth !== proyecto.tira.anchoFotograma * proyecto.tira.fotogramas
        || imTira.naturalHeight !== proyecto.tira.altoFotograma
      ) {
        throw new Error("El tamaño de sprite.png no coincide con sprite.json.");
      }

      setHecho({
        edicionId: Date.now(),
        fotos,
        url: urlTira,
        blob: blobTira,
        ancho: proyecto.tira.anchoFotograma,
        alto: proyecto.tira.altoFotograma,
        descartados: Math.max(0, proyecto.celdas.length - fotos.length),
        hoja: {
          sesionId: Date.now(),
          url: urlHoja,
          blob: blobHoja,
          ancho: proyecto.hoja.ancho,
          alto: proyecto.hoja.alto,
          forma: proyecto.forma,
          columnas:proyecto.columnas,filas:proyecto.filas,
          croma: proyecto.croma,
          celdas: proyecto.celdas,
          originalBlob:blobHoja,
        },
      });
      // Las URL ya pertenecen al estado; el efecto las liberará al reemplazarlo.
      urlHoja = null;
      urlTira = null;
      setQue(proyecto.que);
      setNombre(proyecto.nombre);
      setFps(proyecto.fps);
      setVista(proyecto.vista);
      setDireccion(proyecto.direccion);
      setAccion(proyecto.accion);
      setAnclaje(proyecto.anclaje);
      setForma(proyecto.forma);
      setDistribucion(proyecto.filas===1?"fila":proyecto.columnas===1?"columna":"equilibrada");
      setN(proyecto.celdas.length);
      setAnimacionId(null);setPersonajeId("");setNombrePersonaje(proyecto.nombre);setDescripcionPersonaje(proyecto.que);
      setGuardado(false);
      setGuardadoPrivado(false);
      setCortesPendientes(false);
      setHojaPendiente(false);
      setEditorActivo("hoja");
      setAviso(`Proyecto importado · ${fotos.length} fotogramas · hoja y cortes recuperados.`);
    } catch (e) {
      if (urlHoja) URL.revokeObjectURL(urlHoja);
      if (urlTira) URL.revokeObjectURL(urlTira);
      setError((e as Error).message || "No se pudo importar el proyecto.");
    } finally {
      setPaso(null);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Fabricar un sprite animado</span>
          <span className="block text-[11px] text-muted">
            Los fotogramas salen en UNA sola imagen, así que un pájaro aleteando cuesta lo mismo
            que una imagen suelta. Guárdalo en la biblioteca y ya no se vuelve a pagar.
          </span>
        </span>
      </div>

      <div className="rounded-lg border border-accent/25 bg-accent/5 p-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <UserRound className="h-3.5 w-3.5 text-accent" /> Identidad del sprite
        </div>
        <p className="mt-1 text-[10px] text-muted">
          Solo personajes creados aquí. Las fichas de Historias no se usan para fabricar sprites.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => seleccionarPersonaje(null)}
            className={`rounded-md border px-2 py-1 text-[11px] ${!personajeSeleccionado ? "border-accent bg-accent/10 text-fg" : "border-border text-muted hover:border-accent/60"}`}
          >
            <Plus className="mr-1 inline h-3 w-3" /> Personaje nuevo
          </button>
          {personajes.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => seleccionarPersonaje(p)}
              className={`max-w-[10rem] truncate rounded-md border px-2 py-1 text-[11px] ${personajeSeleccionado?.id === p.id ? "border-accent bg-accent/10 text-fg" : "border-border text-muted hover:border-accent/60"}`}
              title={p.nombre}
            >
              {p.nombre}
            </button>
          ))}
        </div>
        {personajeSeleccionado && (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-accent">
              Seleccionado: <b className="text-fg">{personajeSeleccionado.nombre}</b>
              {" · "}{personajeSeleccionado.animaciones.length} animación{personajeSeleccionado.animaciones.length === 1 ? "" : "es"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] text-muted">
                Partir de (identidad)
                <select
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  value={refAnimacionId}
                  onChange={(e) => setRefAnimacionId(e.target.value)}
                >
                  <option value="">Cuadro maestro del personaje</option>
                  {personajeSeleccionado.animaciones.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre} · {a.accion}</option>
                  ))}
                </select>
              </label>
              <label className={`block text-[10px] text-muted ${refAnimacionId ? "" : "opacity-40"}`}>
                Fotograma de esa animación
                <select
                  className="input mt-0.5 w-full py-1 text-[11px]"
                  value={refCuadro}
                  disabled={!refAnimacionId}
                  onChange={(e) => setRefCuadro(e.target.value as "primero" | "ultimo" | "medio")}
                >
                  <option value="ultimo">Último (recomendado para encadenar)</option>
                  <option value="primero">Primero</option>
                  <option value="medio">Del medio</option>
                </select>
              </label>
            </div>
            <p className="text-[10px] text-muted">
              Ejemplo: personaje sentado → elige esa animación + último cuadro → fabrica «ponerse de pie» →
              luego parte de «ponerse de pie» para fabricar «caminar».
            </p>
          </div>
        )}
        {!personajeSeleccionado && (
          <p className="mt-2 text-[10px] text-muted">
            Sin personaje seleccionado se crea uno nuevo. Luego puedes encadenar animaciones desde cualquiera.
          </p>
        )}
        <label className="mt-2 block">
          <span className="text-[10px] text-muted">Nombre del personaje</span>
          <input
            className="input mt-1 w-full py-1 text-xs"
            value={nombrePersonaje}
            maxLength={60}
            placeholder="Lumi, el zorro astral"
            onChange={(e) => { setNombrePersonaje(e.target.value); setGuardadoPrivado(false); }}
          />
        </label>
      </div>

      <div>
        <span className="text-xs text-muted">Qué es (en inglés sale mejor)</span>
        <input
          className="input mt-1 w-full text-sm"
          value={que}
          onChange={(e) => setQue(e.target.value)}
          placeholder="bird flying, wings flapping"
          aria-label="Qué sprite"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {IDEAS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setQue(i)}
              className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-fg"
            >
              {i.split(",")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs text-muted">Fotogramas: {n}</span>
          <RangoPreciso valor={n} min={1} max={12} paso={1}
            onCambio={setN} etiqueta="fotogramas" className="mt-1" />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Cómo se reparten</span>
          <select value={distribucion} onChange={e=>{const d=e.target.value as "equilibrada"|"fila"|"columna";setDistribucion(d);if(d==="fila")setForma("tira");if(d==="columna")setForma("columna");}}
            className="input mt-1 w-full py-1 text-xs">
            <option value="equilibrada">Rejilla equilibrada</option><option value="fila">Fila exacta · 1×N</option><option value="columna">Columna exacta · N×1</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Calidad</span>
          <select value={calidad} onChange={(e) => setCalidad(e.target.value as any)}
            className="input mt-1 w-full py-1 text-xs">
            <option value="low">baja · $0.005</option>
            <option value="medium">media · $0.041</option>
            <option value="high">alta · $0.165</option>
          </select>
        </label>
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-surface-2/35 p-2 sm:grid-cols-4">
        <label className="block">
          <span className="text-[10px] text-muted">Vista</span>
          <select value={vista} onChange={(e) => {
            const v = e.target.value as TipoVistaSprite;
            setVista(v);
            if (v === "lateral" && !["derecha", "izquierda"].includes(direccion)) setDireccion("derecha");
            else if (v === "frontal") setDireccion("frente");
            else if (v === "trasera") setDireccion("espaldas");
            else if (v === "superior" && !["arriba", "abajo"].includes(direccion)) setDireccion("abajo");
            else if (v === "libre") setDireccion("ninguna");
          }} className="input mt-1 w-full py-1 text-xs">
            <option value="lateral">Lateral</option><option value="frontal">Frontal</option>
            <option value="trasera">Trasera</option><option value="superior">Desde arriba</option><option value="libre">Libre</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-muted">Apunta originalmente</span>
          <select value={direccion} onChange={(e) => setDireccion(e.target.value as DireccionSprite)} className="input mt-1 w-full py-1 text-xs">
            <option value="derecha">Derecha</option><option value="izquierda">Izquierda</option>
            <option value="frente">Frente</option><option value="espaldas">Espaldas</option>
            <option value="arriba">Arriba</option><option value="abajo">Abajo</option><option value="ninguna">Sin dirección</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-muted">Acción</span>
          <select value={accion} onChange={(e) => {
            const a = e.target.value as AccionSprite;
            setAccion(a);
            if (a === "caminar" || a === "correr") setAnclaje("pies");
          }} className="input mt-1 w-full py-1 text-xs">
            {(["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"] as const)
              .map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-muted">Punto de colocación</span>
          <select value={anclaje} onChange={(e) => setAnclaje(e.target.value as AnclajeSprite)} className="input mt-1 w-full py-1 text-xs">
            <option value="centro">Centro</option><option value="pies">Pies / apoyo</option>
          </select>
        </label>
        <p className="text-[9px] leading-snug text-muted sm:col-span-4">
          Esto queda guardado: la IA sabrá cómo orientarlo, voltearlo y apoyarlo en el escenario.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <button onClick={() => void generar()} disabled={!puedeGenerar || !!paso || que.trim().length < 3}
          className="btn-brand w-full text-sm disabled:opacity-40">
          {paso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {paso ?? (puedeGenerar ? "Fabricar el sprite" : "Fabricar · falta clave de IA")}
        </button>
        <label className={`btn-ghost cursor-pointer text-xs ${paso ? "pointer-events-none opacity-40" : ""}`}>
          <FolderOpen className="h-3.5 w-3.5 text-accent" /> Importar proyecto ZIP
          <input type="file" accept=".zip,application/zip" className="hidden"
            onChange={(e) => { void importarProyecto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {aviso && <p className="text-[11px] text-accent">{aviso}</p>}

      {hecho && (
        <>
          <div className="sticky top-2 z-30 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface/95 p-1 shadow-lg backdrop-blur">
            {([
              ["hoja", "1 · Hoja", hojaPendiente],
              ["cortes", "2 · Cortes", cortesPendientes],
              ["fotogramas", "3 · Cuadros", false],
            ] as const).map(([id, etiqueta, pendiente]) => (
              <button key={id} type="button" onClick={() => setEditorActivo(id)}
                className={editorActivo === id ? "btn-brand min-w-0 px-2 py-1.5 text-xs" : "btn-ghost min-w-0 px-2 py-1.5 text-xs"}>
                <span className="truncate">{etiqueta}</span>
                {pendiente && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" title="Cambios sin aplicar" />}
              </button>
            ))}
          </div>

          <div className={editorActivo === "hoja" ? "block" : "hidden"}>
            <EditorHojaSprite
              key={hecho.hoja.sesionId}
              hojaUrl={hecho.hoja.url}
              anchoHoja={hecho.hoja.ancho}
              altoHoja={hecho.hoja.alto}
              croma={hecho.hoja.croma}
              celdas={hecho.hoja.celdas}
              procesando={actualizando}
              bloqueado={cortesPendientes}
              onAplicar={aplicarHoja}
              onPendiente={setHojaPendiente}
            />
          </div>

          <div className={editorActivo === "cortes" ? "block" : "hidden"}>
            <EditorCortesSprite
              hojaUrl={hecho.hoja.url}
              anchoHoja={hecho.hoja.ancho}
              altoHoja={hecho.hoja.alto}
              forma={hecho.hoja.forma}
              croma={hecho.hoja.croma}
              celdas={hecho.hoja.celdas}
              procesando={actualizando}
              bloqueado={hojaPendiente}
              onAplicar={aplicarCortes}
              onPendiente={setCortesPendientes}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <VistaSprite tira={hecho.url} fotogramas={hecho.fotos.length} fps={fps} andando={andando} />
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block">
                <span className="text-xs text-muted">Velocidad: {fps} por segundo</span>
                <RangoPreciso valor={fps} min={2} max={24} paso={1}
                  onCambio={setFps} etiqueta="velocidad" className="mt-1" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAndando((v) => !v)} className="btn-ghost text-xs">
                  {andando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-accent" />}
                  {andando ? "Parar" : "Animar"}
                </button>
                <button onClick={() => void descargar()} disabled={actualizando || edicionPendiente} className="btn-ghost text-xs">
                  <Download className="h-3.5 w-3.5 text-accent" /> Descargar proyecto · ZIP
                </button>
              </div>
            </div>
          </div>

          <div className={editorActivo === "fotogramas" ? "block" : "hidden"}>
            <EditorSprite
              key={hecho.edicionId}
              fotosIniciales={hecho.fotos}
              onChange={actualizarFotogramas}
            />
          </div>

          {/* Guardarlo es el paso que hace que todo esto valga la pena: la
              velocidad que se elija arriba se guarda con él, así que el sprite
              ya llega al montaje andando como debe. */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
            <label className="min-w-[10rem] flex-1">
              <span className="text-[11px] text-muted">Nombre en la biblioteca</span>
              <input
                className="input mt-0.5 w-full py-1 text-xs"
                value={nombre}
                maxLength={60}
                onChange={(e) => { setNombre(e.target.value); setGuardado(false);setGuardadoPrivado(false); }}
                aria-label="Nombre en la biblioteca"
              />
            </label>
            <button onClick={()=>void guardarEnPersonaje()} disabled={guardando||guardadoPrivado||actualizando||edicionPendiente||!nombre.trim()||!nombrePersonaje.trim()} className="btn-brand text-xs disabled:opacity-40">
              {guardando?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:guardadoPrivado?<Check className="h-3.5 w-3.5"/>:<UserRound className="h-3.5 w-3.5"/>}
              {guardadoPrivado?"Guardado":animacionId?"Guardar correcciones":"Guardar en mi personaje"}</button>
            {puedePublicar&&(
            <button
              onClick={() => void guardar()}
              disabled={guardando || guardado || actualizando || edicionPendiente || !nombre.trim()}
              className="btn-brand text-xs disabled:opacity-40"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : guardado ? <Check className="h-3.5 w-3.5" />
                  : <Library className="h-3.5 w-3.5" />}
              {guardado ? "Publicado" : "Publicar para todos"}
            </button>
            )}
          </div>

          {/* La tira, para ver de un vistazo si algún fotograma salió mal. */}
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-2">
            {hecho.fotos.map((f, i) => (
              <span key={i} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`fotograma ${i + 1}`} className="h-16 w-auto" />
                <span className="absolute left-0 top-0 rounded-br bg-black/60 px-1 text-[9px] text-muted">
                  {i + 1}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Library className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-xs font-semibold text-fg">Biblioteca de sprites</span>
          <button type="button" onClick={() => void releerPersonajes()} className="btn-ghost ml-auto px-2 py-1 text-[10px]" title="Releer">
            {cargandoPersonajes ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted" />
          <input
            className="input w-full py-1.5 pl-7 text-xs"
            value={busquedaBiblio}
            onChange={(e) => setBusquedaBiblio(e.target.value)}
            placeholder="Buscar por nombre o prompt…"
            aria-label="Buscar en la biblioteca de sprites"
          />
        </div>

        {errorPersonajes && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-danger/35 bg-danger/5 p-2 text-[10px] text-danger">
            <span>{errorPersonajes}</span>
            <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[10px]" onClick={() => void releerPersonajes()}>
              Reintentar
            </button>
          </div>
        )}

        {!cargandoPersonajes && !personajes.length && !errorPersonajes && (
          <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted">
            Todavía no hay personajes aquí. Fabrica uno arriba y guárdalo: a partir de ahí puedes añadirle correr, volar, saltar…
          </p>
        )}

        {!cargandoPersonajes && !!personajes.length && !personajesFiltrados.length && (
          <p className="text-[11px] text-muted">Ningún sprite coincide con «{busquedaBiblio.trim()}».</p>
        )}

        <div className="space-y-2">
          {personajesPagina.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface-2/30 p-2">
              <div className="flex flex-wrap items-start gap-2">
                {p.animaciones[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.animaciones[0].tiraUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />
                ) : (
                  <UserRound className="h-10 w-12 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  {renombrandoId === p.id ? (
                    <div className="flex flex-wrap gap-1">
                      <input
                        className="input min-w-0 flex-1 py-1 text-xs"
                        value={nombreEdit}
                        maxLength={60}
                        autoFocus
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void renombrarPersonaje(p);
                          if (e.key === "Escape") setRenombrandoId(null);
                        }}
                      />
                      <button type="button" className="btn-brand px-2 py-1 text-[10px]" onClick={() => void renombrarPersonaje(p)}>
                        <Check className="h-3 w-3" />
                      </button>
                      <button type="button" className="btn-ghost px-2 py-1 text-[10px]" onClick={() => setRenombrandoId(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-xs font-semibold text-fg">{p.nombre}</span>
                      <button
                        type="button"
                        className="shrink-0 text-muted hover:text-accent"
                        title="Renombrar"
                        onClick={() => { setRenombrandoId(p.id); setNombreEdit(p.nombre); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {/* El prompt entero mata la tarjeta: los buenos son párrafos.
                      Se acota a una línea y el completo queda en el title. */}
                  <p className="mt-0.5 truncate text-[10px] text-muted" title={p.descripcion || p.prompt}>
                    {resumenPrompt(p.descripcion || p.prompt, 70) || "Sin prompt"}
                  </p>
                  <p className="text-[9px] text-muted">{p.animaciones.length} animación{p.animaciones.length === 1 ? "" : "es"}</p>
                </div>
                {/* Borrar el grupo entero. Antes no se podía: un personaje que
                    salía mal se quedaba ocupando sitio del tope para siempre. */}
                {confirmarBorrado === p.id ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <span className="text-[9px] text-danger">
                      ¿Borrar {p.animaciones.length ? `y sus ${p.animaciones.length} animaciones` : "este personaje"}?
                    </span>
                    <button
                      type="button"
                      className="rounded-md border border-danger/50 px-1.5 py-0.5 text-[10px] text-danger disabled:opacity-40"
                      disabled={borrandoId === p.id}
                      onClick={() => void borrarPersonaje(p)}
                    >
                      {borrandoId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sí"}
                    </button>
                    <button type="button" className="btn-ghost px-1.5 py-0.5 text-[10px]" onClick={() => setConfirmarBorrado(null)}>
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-border p-1 text-muted hover:border-danger/50 hover:text-danger"
                    title={`Borrar «${p.nombre}» y todas sus animaciones`}
                    onClick={() => setConfirmarBorrado(p.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className="btn-brand px-2 py-1 text-[10px]" onClick={() => nuevaAnimacion(p)}>
                  <Plus className="h-3 w-3" /> Nueva animación
                </button>
                {ANIM_RAPIDAS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted hover:border-accent hover:text-fg"
                    onClick={() => nuevaAnimacion(p, r)}
                    title={`Fabricar «${r.label}» para ${p.nombre}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {p.animaciones.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-border p-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => void editarAnimacion(a.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-90"
                      title="Abrir para editar"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.tiraUrl} alt="" className="h-9 w-14 object-contain" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px]" title={a.nombre}>
                          {nombreCorto(a.nombre)}
                        </span>
                        <span className="block truncate text-[9px] text-muted" title={a.que}>
                          {a.accion} · {resumenPrompt(a.que, 48)}
                        </span>
                      </span>
                      <Pencil className="h-3 w-3 shrink-0 text-muted" />
                    </button>
                    {confirmarBorrado === a.id ? (
                      <>
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-danger/50 px-1.5 py-1 text-[9px] text-danger disabled:opacity-40"
                          disabled={borrandoId === a.id}
                          onClick={() => void borrarAnimacion(p, a)}
                        >
                          {borrandoId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Borrar"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost shrink-0 px-1.5 py-1 text-[9px]"
                          onClick={() => setConfirmarBorrado(null)}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-ghost shrink-0 px-1.5 py-1 text-[9px]"
                          title="Fabricar la siguiente animación partiendo del último cuadro de esta"
                          onClick={() => nuevaAnimacion(p, undefined, a.id)}
                        >
                          <Plus className="h-3 w-3" /> Partir de aquí
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-border p-1 text-muted hover:border-danger/50 hover:text-danger"
                          title={`Borrar la animación «${a.nombre}»`}
                          onClick={() => setConfirmarBorrado(a.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!p.animaciones.length && (
                  <p className="text-[10px] text-muted">Todavía no tiene animaciones.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {personajesFiltrados.length > POR_PAGINA && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40"
              disabled={paginaClamped <= 0}
              onClick={() => setPaginaBiblio((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <span className="tabular-nums">
              {paginaClamped + 1} / {totalPaginas}
              {" · "}{personajesFiltrados.length} resultado{personajesFiltrados.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40"
              disabled={paginaClamped >= totalPaginas - 1}
              onClick={() => setPaginaBiblio((p) => Math.min(totalPaginas - 1, p + 1))}
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
