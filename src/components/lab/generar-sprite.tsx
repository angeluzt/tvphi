"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2, Sparkles, Download, AlertTriangle, Play, Pause, Library, Check,
} from "lucide-react";
import { pedirJson, pedirJsonCrudo } from "@/lib/pedir-json";
import { cortarHoja, nombreSprite, tiraDeFotogramas, type Fotograma } from "@/lib/lab/sprites";
import { zip, bajar } from "@/lib/lab/exportar";
import { VistaSprite } from "./vista-sprite";
import { EditorSprite } from "./editor-sprite";
import { pesoLegible, type SpriteMeta } from "@/lib/lab/biblioteca";

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
}

export function GenerarSprite({ onGuardado }: { onGuardado?: (s: SpriteMeta) => void }) {
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
  const revisionTira = useRef(0);

  // Cada correccion crea una URL nueva para la vista previa. La anterior deja
  // de hacer falta en cuanto React cambia de imagen.
  useEffect(() => {
    const url = hecho?.url;
    return () => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [hecho?.url]);

  async function generar() {
    if (que.trim().length < 3) return;
    setError(null); setAviso(null); setHecho(null); setGuardado(false);
    setPaso("Dibujando la hoja…");
    try {
      const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/sprite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que: que.trim(), fotogramas: n, forma, calidad }),
      });
      if (!r.ok) throw new Error(j.error || "No se pudo");

      setPaso("Recortando los fotogramas…");
      const hoja = await cortarHoja({
        dataUrl: `data:image/png;base64,${j.imagen}`,
        fotogramas: j.fotogramas ?? n,
        forma: j.forma ?? forma,
        croma: j.croma,
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
      });
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
    if (!hecho || guardando) return;
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
    if (!hecho) return;
    const base = nombreSprite(nombre || que);
    const fotos = hecho.fotos;
    const archivos: { nombre: string; datos: Uint8Array<ArrayBuffer> }[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const b = await (await fetch(fotos[i].url)).arrayBuffer();
      archivos.push({
        nombre: `${String(i + 1).padStart(2, "0")}-${base}.png`,
        datos: new Uint8Array(b),
      });
    }
    archivos.push({
      nombre: `tira-${base}.png`,
      datos: new Uint8Array(await hecho.blob.arrayBuffer()),
    });
    archivos.push({
      nombre: "sprite.json",
      datos: new TextEncoder().encode(JSON.stringify({
        version: 1, nombre: base, que, fotogramas: fotos.length, fps,
        ancho: hecho.ancho, alto: hecho.alto,
      }, null, 2)),
    });
    archivos.push({
      nombre: "leeme.txt",
      datos: new TextEncoder().encode(
        `Sprite «${base}» (${fotos.length} fotogramas, ${fps} por segundo).\n`
        + "PNG con transparencia, todos del mismo tamaño y alineados entre sí.\n"
        + "«tira-…png» los lleva a todos en fila, que es como los guarda la app.\n"
        + "Hechos con el laboratorio de TVPHI en una sola llamada, para poder reutilizarlos.\n",
      ),
    });
    bajar(zip(archivos), `sprite-${base}.zip`);
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

      <button onClick={() => void generar()} disabled={!!paso || que.trim().length < 3}
        className="btn-brand w-full text-sm disabled:opacity-40">
        {paso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {paso ?? "Fabricar el sprite"}
      </button>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {aviso && <p className="text-[11px] text-accent">{aviso}</p>}

      {hecho && (
        <>
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
                <button onClick={() => void descargar()} disabled={actualizando} className="btn-ghost text-xs">
                  <Download className="h-3.5 w-3.5 text-accent" /> Descargar · ZIP
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
              disabled={guardando || guardado || actualizando || !nombre.trim()}
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
