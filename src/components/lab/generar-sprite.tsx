"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2, Sparkles, Download, AlertTriangle, Play, Pause, Library, Check, FolderOpen,
} from "lucide-react";
import { pedirJson, pedirJsonCrudo } from "@/lib/pedir-json";
import {
  celdasSpritePorDefecto, cortarHoja, fotogramasDeTira, nombreSprite, tiraDeFotogramas,
  type CeldaSprite, type Fotograma,
} from "@/lib/lab/sprites";
import { cargarImagen } from "@/lib/lab/quitar-fondo";
import { zip, bajar } from "@/lib/lab/exportar";
import { leerZip } from "@/lib/story/zip";
import { VistaSprite } from "./vista-sprite";
import { EditorSprite } from "./editor-sprite";
import { EditorCortesSprite } from "./editor-cortes-sprite";
import { EditorHojaSprite } from "./editor-hoja-sprite";
import { esPng, pesoLegible, type SpriteMeta } from "@/lib/lab/biblioteca";
import {
  ARCHIVO_HOJA_SPRITE, ARCHIVO_META_SPRITE, ARCHIVO_TIRA_SPRITE,
  archivosProyectoSprite, crearProyectoSprite, normalizarProyectoSprite,
} from "@/lib/lab/sprite-proyecto";

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
    croma: string;
    celdas: CeldaSprite[];
  };
}

export function GenerarSprite({ onGuardado, puedeGenerar = true }: {
  onGuardado?: (s: SpriteMeta) => void;
  /** Importar y editar un ZIP no necesita IA y debe seguir disponible sin clave. */
  puedeGenerar?: boolean;
}) {
  const [que, setQue] = useState("");
  const [n, setN] = useState(6);
  const [forma, setForma] = useState<"tira" | "columna">("tira");
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
  const [actualizando, setActualizando] = useState(false);
  const [cortesPendientes, setCortesPendientes] = useState(false);
  const [hojaPendiente, setHojaPendiente] = useState(false);
  const revisionTira = useRef(0);
  const edicionPendiente = cortesPendientes || hojaPendiente;

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
    setError(null); setAviso(null); setHecho(null); setGuardado(false);
    setPaso("Dibujando la hoja…");
    try {
      const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/sprite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que: que.trim(), fotogramas: n, forma, calidad }),
      });
      if (!r.ok) throw new Error(j.error || "No se pudo");

      setPaso("Preparando la hoja original…");
      const dataUrl = `data:image/png;base64,${j.imagen}`;
      const blobHoja = await (await fetch(dataUrl)).blob();
      const imagenHoja = await cargarImagen(dataUrl);
      const formaHoja = (j.forma ?? forma) as "tira" | "columna";
      const cuantos = j.fotogramas ?? n;
      const celdas = celdasSpritePorDefecto(
        imagenHoja.naturalWidth, imagenHoja.naturalHeight, cuantos, formaHoja,
      );

      setPaso("Recortando los fotogramas…");
      const hoja = await cortarHoja({
        dataUrl,
        fotogramas: cuantos,
        forma: formaHoja,
        croma: j.croma,
        celdas,
      });
      if (!hoja.fotogramas.length) {
        throw new Error(
          "La hoja salió sin nada recortable: probablemente el modelo no pintó el magenta. "
          + "Vuelve a intentarlo, o pide algo con una silueta más clara.",
        );
      }

      // La tira se compone AQUÍ, nada más cortar, y es lo único que se enseña y
      // se guarda a partir de este punto: así lo que se ve en la vista previa
      // es exactamente lo que quedará en la biblioteca, byte a byte.
      const tira = await tiraDeFotogramas(hoja.fotogramas);
      setHecho({
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
          croma: j.croma || "#FF00FF",
          celdas: hoja.celdas,
        },
      });
      setCortesPendientes(false);
      setHojaPendiente(false);
      setNombre(nombreSprite(que));
      setPaso(null);
      setAviso(
        `${hoja.fotogramas.length} fotogramas listos`
        + (hoja.descartados ? ` · ${hoja.descartados} salieron vacíos y se tiraron` : "")
        + ` · ${tira.ancho}×${tira.alto} · ${pesoLegible(tira.blob.size)}`,
      );
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
      setHojaPendiente(false);
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
      setCortesPendientes(false);
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
          nombre: nombre.trim() || nombreSprite(que),
          que: que.trim(),
          fotogramas: hecho.fotos.length,
          fps,
          ancho: hecho.ancho,
          alto: hecho.alto,
          tira: b64,
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

  async function descargar() {
    if (!hecho || edicionPendiente) return;
    const base = nombreSprite(nombre || que);
    const proyecto = crearProyectoSprite({
      nombre: nombre.trim() || base,
      que: que.trim() || base,
      fps,
      forma: hecho.hoja.forma,
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
          croma: proyecto.croma,
          celdas: proyecto.celdas,
        },
      });
      // Las URL ya pertenecen al estado; el efecto las liberará al reemplazarlo.
      urlHoja = null;
      urlTira = null;
      setQue(proyecto.que);
      setNombre(proyecto.nombre);
      setFps(proyecto.fps);
      setForma(proyecto.forma);
      setN(proyecto.celdas.length);
      setGuardado(false);
      setCortesPendientes(false);
      setHojaPendiente(false);
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
          <input type="range" min={2} max={12} value={n}
            onChange={(e) => setN(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Cómo se reparten</span>
          <select value={forma} onChange={(e) => setForma(e.target.value as any)}
            className="input mt-1 w-full py-1 text-xs">
            <option value="tira">En fila (vuela, camina)</option>
            <option value="columna">En columna (cae)</option>
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

          <EditorCortesSprite
            hojaUrl={hecho.hoja.url}
            anchoHoja={hecho.hoja.ancho}
            altoHoja={hecho.hoja.alto}
            forma={hecho.hoja.forma}
            celdas={hecho.hoja.celdas}
            procesando={actualizando}
            bloqueado={hojaPendiente}
            onAplicar={aplicarCortes}
            onPendiente={setCortesPendientes}
          />

          <div className="flex flex-wrap items-center gap-3">
            <VistaSprite tira={hecho.url} fotogramas={hecho.fotos.length} fps={fps} andando={andando} />
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block">
                <span className="text-xs text-muted">Velocidad: {fps} por segundo</span>
                <input type="range" min={2} max={24} value={fps}
                  onChange={(e) => setFps(Number(e.target.value))} className="mt-1 w-full" />
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

          <EditorSprite
            key={hecho.edicionId}
            fotosIniciales={hecho.fotos}
            onChange={actualizarFotogramas}
          />

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
                onChange={(e) => { setNombre(e.target.value); setGuardado(false); }}
                aria-label="Nombre en la biblioteca"
              />
            </label>
            <button
              onClick={() => void guardar()}
              disabled={guardando || guardado || actualizando || edicionPendiente || !nombre.trim()}
              className="btn-brand text-xs disabled:opacity-40"
            >
              {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : guardado ? <Check className="h-3.5 w-3.5" />
                  : <Library className="h-3.5 w-3.5" />}
              {guardado ? "Guardado" : "Guardar en la biblioteca"}
            </button>
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
    </div>
  );
}
