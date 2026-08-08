"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Download, AlertTriangle, Play, Pause } from "lucide-react";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { cortarHoja, nombreSprite, type Fotograma } from "@/lib/lab/sprites";
import { zip, bajar } from "@/lib/lab/exportar";

// Fabricar un sprite animado: un bicho, varios fotogramas, fondo fuera.
//
// LA IDEA, que es lo que lo hace barato: los N fotogramas van en UNA sola
// imagen. Ocho llamadas serían ocho veces el precio y ocho pájaros distintos,
// porque cada llamada empieza de cero; en una sola, el modelo los ve todos a la
// vez y los hace del mismo bicho. En calidad baja, un pájaro aleteando cuesta
// lo mismo que una imagen suelta: $0.005, y se reutiliza para siempre.

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

export function GenerarSprite() {
  const [que, setQue] = useState("");
  const [n, setN] = useState(6);
  const [forma, setForma] = useState<"tira" | "columna">("tira");
  const [calidad, setCalidad] = useState<"low" | "medium" | "high">("low");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Fotograma[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fps, setFps] = useState(10);
  const [andando, setAndando] = useState(true);

  async function generar() {
    if (que.trim().length < 3) return;
    setError(null); setAviso(null); setFotos([]);
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
      setFotos(hoja.fotogramas);
      setPaso(null);
      setAviso(
        `${hoja.fotogramas.length} fotogramas listos`
        + (hoja.descartados ? ` · ${hoja.descartados} salieron vacíos y se tiraron` : "")
        + ` · ${hoja.fotogramas[0].ancho}×${hoja.fotogramas[0].alto}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setPaso(null);
    }
  }

  async function descargar() {
    if (!fotos.length) return;
    const base = nombreSprite(que);
    const archivos: { nombre: string; datos: Uint8Array<ArrayBuffer> }[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const b = await (await fetch(fotos[i].url)).arrayBuffer();
      archivos.push({
        nombre: `${String(i + 1).padStart(2, "0")}-${base}.png`,
        datos: new Uint8Array(b),
      });
    }
    archivos.push({
      nombre: "sprite.json",
      datos: new TextEncoder().encode(JSON.stringify({
        version: 1, nombre: base, que, fotogramas: fotos.length, fps,
        ancho: fotos[0].ancho, alto: fotos[0].alto,
      }, null, 2)),
    });
    archivos.push({
      nombre: "leeme.txt",
      datos: new TextEncoder().encode(
        `Sprite «${base}» (${fotos.length} fotogramas, ${fps} por segundo).\n`
        + "PNG con transparencia, todos del mismo tamaño y alineados entre sí.\n"
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
            que una imagen suelta. Se paga una vez y se reutiliza en todos los videos.
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

      {!!fotos.length && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Vista fotos={fotos} fps={fps} andando={andando} />
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
                <button onClick={() => void descargar()} className="btn-ghost text-xs">
                  <Download className="h-3.5 w-3.5 text-accent" /> Descargar · ZIP
                </button>
              </div>
            </div>
          </div>

          {/* La tira, para ver de un vistazo si algún fotograma salió mal. */}
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-2">
            {fotos.map((f, i) => (
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

/** El sprite en marcha, sobre un tablero de ajedrez para ver la transparencia. */
function Vista({ fotos, fps, andando }: { fotos: Fotograma[]; fps: number; andando: boolean }) {
  const [i, setI] = useState(0);
  const imgs = useRef<HTMLImageElement[]>([]);
  const lienzo = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all(fotos.map((f) => new Promise<HTMLImageElement>((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = f.url;
    }))).then((cargadas) => { if (vivo) imgs.current = cargadas; });
    return () => { vivo = false; };
  }, [fotos]);

  useEffect(() => {
    if (!andando || fotos.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % fotos.length), 1000 / Math.max(1, fps));
    return () => clearInterval(t);
  }, [andando, fps, fotos.length]);

  useEffect(() => {
    const cv = lienzo.current;
    const im = imgs.current[i];
    if (!cv || !im) return;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    // Tablero: sin él, un sprite oscuro sobre fondo oscuro parece que no está.
    const p = 8;
    for (let y = 0; y < cv.height; y += p) {
      for (let x = 0; x < cv.width; x += p) {
        c.fillStyle = ((x / p + y / p) % 2 === 0) ? "#171d20" : "#0f1416";
        c.fillRect(x, y, p, p);
      }
    }
    const e = Math.min(cv.width / im.naturalWidth, cv.height / im.naturalHeight);
    const w = im.naturalWidth * e, h = im.naturalHeight * e;
    c.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }, [i, fotos]);

  return (
    <canvas
      ref={lienzo}
      width={160}
      height={160}
      className="shrink-0 rounded-lg border border-border"
      aria-label="Vista previa del sprite"
    />
  );
}
