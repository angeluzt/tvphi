"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RefreshCw, Repeat } from "lucide-react";
import { armarApng, leerPng } from "@/lib/story/apng";
import { duracionLoop, indiceLoop, type LoopImagen } from "@/lib/story/medio";

/**
 * Visor de fotogramas de una escena o lámina, al estilo mesa de luz.
 *
 * ENSEÑA EXACTAMENTE LO QUE VA A HACER EL VÍDEO. Antes avanzaba con un módulo
 * suelto —0,1,2,…,n-1,0— mientras el motor ya iba y volvía, así que la vista
 * previa mentía justo en lo que se estaba mirando: el tirón del cierre se veía
 * aquí y no en el vídeo, o al revés. Ahora los dos preguntan a `indiceLoop`.
 */
export function MesaLuz({
  loop,
  urls,
  onFps,
  onVaiven,
  onRegenerar,
  regenerando,
}: {
  loop: LoopImagen;
  /**
   * Una URL por fotograma, EN EL MISMO ORDEN que `loop.imageIds`. `null` es un
   * cuadro que no está en este navegador: su hueco se conserva porque el índice
   * de la miniatura es lo que viaja al regenerar.
   */
  urls: (string | null)[];
  onFps: (fps: number) => void;
  onVaiven?: (v: boolean) => void;
  onRegenerar?: (indice: number) => void;
  regenerando?: number | null;
}) {
  // Se cuenta el PASO, no el fotograma: en vaivén el mismo cuadro sale dos
  // veces por vuelta, así que el índice no vale para saber por dónde vas.
  const [paso, setPaso] = useState(0);
  const [play, setPlay] = useState(true);
  const [armando, setArmando] = useState(false);
  const [apng, setApng] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const apngRef = useRef<string | null>(null);

  useEffect(() => {
    if (!play || urls.length < 2) return;
    const id = window.setInterval(
      () => setPaso((n) => n + 1),
      Math.max(33, Math.round(1000 / Math.max(1, loop.fps))),
    );
    return () => window.clearInterval(id);
  }, [play, urls.length, loop.fps]);

  // El APNG guardado deja de valer en cuanto cambian los cuadros o el ritmo.
  const claves = urls.join("|");
  useEffect(() => {
    if (apngRef.current) URL.revokeObjectURL(apngRef.current);
    apngRef.current = null;
    setApng(null);
    setFallo(null);
  }, [claves, loop.fps, loop.vaiven]);
  useEffect(() => () => { if (apngRef.current) URL.revokeObjectURL(apngRef.current); }, []);

  // `indiceLoop` piensa en segundos; aquí se avanza por pasos, así que se le
  // pasa el paso dividido por los fps para que la cuenta sea la misma.
  const i = useMemo(
    () => indiceLoop({ ...loop, imageIds: urls.map((_, n) => String(n)) }, paso / Math.max(1, loop.fps)),
    [loop, urls, paso],
  );

  /**
   * El loop, como UN archivo animado que se abre en cualquier sitio.
   *
   * Sirve para mirarlo fuera de la app —un visor, el móvil, mandárselo a
   * alguien— sin exportar el vídeo entero. Se arma con los cuadros EN EL ORDEN
   * DE REPRODUCCIÓN, vaivén incluido: un APNG no sabe ir y volver, así que la
   * vuelta se escribe tal cual, cuadro a cuadro.
   *
   * CADA CUADRO SE REDIBUJA EN UN LIENZO, y no es por gusto. Dos motivos:
   *
   *   · `fetch()` sobre la URL del fotograma NO funciona: son `blob:` o `data:`
   *     y la CSP de la app solo deja conectar a 'self'. La primera versión hacía
   *     eso y la descarga fallaba siempre, en silencio. Un `<img>` no pasa por
   *     `connect-src`, así que por ahí sí se puede leer.
   *
   *   · Un APNG comparte UNA cabecera, así que todos los cuadros tienen que
   *     medir lo mismo. Pasándolos por el mismo lienzo eso deja de depender de
   *     lo que devolviera el modelo.
   */
  async function descargar() {
    setArmando(true);
    setFallo(null);
    try {
      const ids = urls.map((_, m) => String(m));
      const n = urls.length;
      const pasos = loop.vaiven === false ? n : 2 * n - 2;

      const cargar = (u: string) => new Promise<HTMLImageElement>((ok, mal) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => mal(new Error("no se pudo leer un fotograma"));
        im.src = u;
      });

      // El tamaño lo marca el primero que se pueda leer.
      const primero = urls.find((u): u is string => !!u);
      if (!primero) throw new Error("no hay ningún fotograma en este navegador");
      const base = await cargar(primero);
      const w = base.naturalWidth;
      const h = base.naturalHeight;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error("este navegador no da lienzo 2D");

      const trozos = [];
      for (let k = 0; k < pasos; k++) {
        const u = urls[indiceLoop({ ...loop, imageIds: ids }, k / Math.max(1, loop.fps))];
        if (!u) continue;
        const im = await cargar(u);
        ctx.clearRect(0, 0, w, h);
        const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
        ctx.drawImage(
          im,
          (w - im.naturalWidth * s) / 2, (h - im.naturalHeight * s) / 2,
          im.naturalWidth * s, im.naturalHeight * s,
        );
        const png = await new Promise<Blob>((ok, mal) => cv.toBlob(
          (b) => (b ? ok(b) : mal(new Error("el navegador no pudo guardar un fotograma"))),
          "image/png",
        ));
        trozos.push(leerPng(await png.arrayBuffer()));
      }
      if (trozos.length < 2) throw new Error("hacen falta al menos dos fotogramas");

      const bytes = armarApng(trozos, loop.fps, true);
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "image/png" }));
      if (apngRef.current) URL.revokeObjectURL(apngRef.current);
      apngRef.current = url;
      setApng(url);
    } catch (e) {
      // Se DICE lo que pasó. Antes se tragaba el error y el botón se quedaba
      // como si nada: parecía que no hacía nada, que es peor que fallar.
      setFallo((e as Error)?.message || "no se pudo armar el APNG");
      setApng(null);
    } finally {
      setArmando(false);
    }
  }

  if (!urls.length) return null;
  const actual = urls[Math.min(i, urls.length - 1)];
  const vaiven = loop.vaiven !== false;

  return (
    <div className="mt-2 rounded-lg border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium">Mesa de luz</span>
        <span className="text-[10px] tabular-nums text-muted">
          {urls.length} fotos · {loop.fps} fps · la vuelta dura{" "}
          {duracionLoop({ ...loop, imageIds: urls.map((_, n) => String(n)) }).toFixed(1)} s
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted">
          cuadro {i + 1}/{urls.length}
        </span>
      </div>
      <div className="mt-1.5 grid min-h-[3rem] place-items-center overflow-hidden rounded-md border border-border bg-black">
        {actual
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={actual} alt="" className="mx-auto max-h-48 w-auto" />
          : <span className="p-4 text-[10px] text-muted">Este fotograma no está en este navegador.</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setPlay((v) => !v)}>
          {play ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {play ? "Pausar" : "Play"}
        </button>
        <label className="flex items-center gap-1 text-[10px] text-muted">
          fps
          <input
            type="range" min={1} max={16} step={1} value={loop.fps}
            onChange={(e) => onFps(Number(e.target.value))}
          />
          <span className="tabular-nums">{loop.fps}</span>
        </label>
        {onVaiven && (
          <label
            className="flex items-center gap-1 text-[10px] text-muted"
            title="Los cuadros se dibujan encadenados, así que el último se parece al penúltimo y no al primero. Yendo y volviendo no hay corte; cortando al primero, el mayor salto del ciclo se repite en cada vuelta."
          >
            <input type="checkbox" checked={vaiven} onChange={(e) => onVaiven(e.target.checked)} />
            <Repeat className="h-3 w-3" /> ida y vuelta
          </label>
        )}
        <button
          type="button"
          className="btn-ghost ml-auto px-2 py-1 text-[11px] disabled:opacity-40"
          disabled={armando || urls.length < 2}
          onClick={() => void descargar()}
          title="El loop como un solo archivo animado, para verlo fuera de la app"
        >
          {armando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          APNG
        </button>
        {apng && (
          <a href={apng} download="foto-viva.png" className="text-[11px] text-accent underline">
            Guardar archivo
          </a>
        )}
        {fallo && <span className="text-[10px] text-danger">No salió: {fallo}.</span>}
      </div>
      <div className="mt-1.5 flex gap-1 overflow-x-auto">
        {urls.map((u, n) => (
          <button
            key={loop.imageIds[n] ?? n}
            type="button"
            onClick={() => { setPlay(false); setPaso(n); }}
            className={`relative shrink-0 overflow-hidden rounded border ${n === i ? "border-accent" : "border-border"}`}
          >
            {u
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={u} alt="" className="h-12 w-16 object-cover" />
              : <span className="grid h-12 w-16 place-items-center bg-surface-2 text-[9px] text-muted">falta</span>}
            {/* El cuadro 0 es la foto de la escena: rehacerlo cambia el loop,
                no la foto, pero conviene que se vea de dónde sale. */}
            {n === 0 && (
              <span className="absolute bottom-0 left-0 bg-black/70 px-1 text-[8px] text-white">foto</span>
            )}
            {onRegenerar && (
              <span
                role="button"
                tabIndex={0}
                className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white"
                title="Regenerar este fotograma"
                onClick={(e) => { e.stopPropagation(); onRegenerar(n); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRegenerar(n); } }}
              >
                {regenerando === n
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
