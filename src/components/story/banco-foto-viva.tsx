"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, FlaskConical, Image as ImageIcon, Loader2, Wand2,
} from "lucide-react";
import { mensajeLegible, pedirJsonCrudo } from "@/lib/pedir-json";
import {
  blobAPngDataUrl, generarLoopDesdeStill, type InformeLoop,
} from "@/lib/story/generar-loop";
import {
  FOTOGRAMAS_DEFECTO, FPS_LOOP_DEFECTO, MAX_FOTOS_LOOP, MIN_FOTOS_LOOP,
  type LoopImagen, type PlanAnimacion,
} from "@/lib/story/medio";
import { MesaLuz } from "./mesa-luz";

/**
 * BANCO DE PRUEBAS de la foto viva. Solo admin, y aparte del editor.
 *
 * POR QUÉ EXISTE. Para afinar esto había que montar un capítulo entero: escribir
 * un encargo, esperar a que la IA lo inventara, dibujar la escena y solo
 * entonces darle a «foto viva». Cinco minutos y varias imágenes pagadas por
 * cada cosa que quisieras comprobar, y al final lo único que estabas mirando
 * eran seis fotos y su bucle.
 *
 * Aquí se suelta una imagen —la que sea, incluso una descargada del capítulo
 * que salió mal— y se prueba directamente: qué propone la IA al mirarla, qué
 * cuadros salen, cuánto derivó el brillo de cada uno y cómo queda el bucle. Los
 * fotogramas viven SOLO en esta página: no tocan ningún capítulo, así que
 * probar aquí no ensucia nada.
 *
 * Lo que se ve aquí es lo MISMO que usa el editor —las mismas funciones, las
 * mismas rutas—, no una copia: si esto queda bien, el capítulo queda igual.
 */
export function BancoFotoViva() {
  const [archivo, setArchivo] = useState<{ blob: Blob; url: string; nombre: string } | null>(null);
  const [plan, setPlan] = useState<PlanAnimacion>({
    movimiento: "", fotogramas: FOTOGRAMAS_DEFECTO, fps: FPS_LOOP_DEFECTO,
  });
  const [motivo, setMotivo] = useState<string | null>(null);
  const [formato, setFormato] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [calidad, setCalidad] = useState<"low" | "medium" | "high">("low");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preguntando, setPreguntando] = useState(false);

  const [loop, setLoop] = useState<LoopImagen | null>(null);
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [informe, setInforme] = useState<InformeLoop | null>(null);
  // Las object URL de esta página son nuestras: si no se sueltan, cada prueba
  // deja los blobs vivos hasta recargar.
  const sueltas = useRef<string[]>([]);

  useEffect(() => () => { sueltas.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  function limpiarSalida() {
    setLoop(null); setUrls([]); setInforme(null); setError(null);
  }

  function elegir(f: File) {
    limpiarSalida();
    setMotivo(null);
    const url = URL.createObjectURL(f);
    sueltas.current.push(url);
    setArchivo({ blob: f, url, nombre: f.name });
  }

  async function preguntarALaIa() {
    if (!archivo) return;
    setPreguntando(true); setError(null);
    try {
      const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/que-animar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagen: await blobAPngDataUrl(archivo.blob),
          ...(plan.movimiento.trim() ? { pista: plan.movimiento.trim() } : {}),
        }),
      });
      if (!r.ok) throw new Error(j?.error || "No supo decir qué animar.");
      setPlan(j.plan);
      setMotivo(j.motivo ?? null);
    } catch (e) {
      setError(mensajeLegible(e) + " Puedes escribirlo tú y seguir.");
    } finally {
      setPreguntando(false);
    }
  }

  async function generar() {
    if (!archivo) return;
    limpiarSalida();
    setPaso("Preparando…");
    try {
      const salida: (string | null)[] = [archivo.url];
      const l = await generarLoopDesdeStill({
        stillId: "banco-still",
        still: archivo.blob,
        prompt: "",
        movimiento: plan.movimiento.trim() || undefined,
        formato,
        n: plan.fotogramas,
        fps: plan.fps,
        calidad,
        onPaso: setPaso,
        // No se guarda en IndexedDB: esto es un banco de pruebas, y dejar
        // fotogramas sueltos en el almacén del navegador por cada tanteo es
        // basura que luego no borra nadie.
        guardar: async (blob) => {
          const u = URL.createObjectURL(blob);
          sueltas.current.push(u);
          salida.push(u);
          setUrls([...salida]);
          return u;
        },
        onInforme: setInforme,
      });
      setLoop(l);
      setUrls(salida);
      setPaso(null);
    } catch (e) {
      setError(mensajeLegible(e));
      setPaso(null);
    }
  }

  const ocupado = !!paso || preguntando;
  const patron = informe?.lumas[0] || 1;
  const peor = informe
    ? Math.max(...informe.lumas.map((l) => Math.abs(l - patron) / patron))
    : 0;

  return (
    <div className="card border-gold/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0 text-gold" />
        <span className="label flex-1 text-sm">Banco de pruebas · foto viva</span>
        <span className="chip bg-gold/15 text-gold">solo admin</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Suelta una imagen y prueba el loop sin montar un capítulo. Usa las mismas
        rutas y las mismas funciones que el editor, así que lo que salga aquí es
        lo que saldrá allí. Los fotogramas no se guardan en ningún capítulo.
      </p>

      <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="btn-ghost w-full cursor-pointer justify-center text-xs">
            <ImageIcon className="h-3.5 w-3.5 text-accent" />
            {archivo ? "Cambiar imagen" : "Elegir imagen"}
            <input
              type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) elegir(f); }}
            />
          </label>
          {archivo && (
            <div className="overflow-hidden rounded-md border border-border bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={archivo.url} alt="" className="mx-auto max-h-40 w-auto" />
            </div>
          )}

          <div className="rounded-md border border-border p-2">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="text-[11px] font-medium">Qué se anima</span>
              <button
                type="button"
                disabled={!archivo || ocupado}
                onClick={() => void preguntarALaIa()}
                className="btn-ghost ml-auto px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                title="La IA mira la imagen y lo propone"
              >
                {preguntando ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Que lo diga la IA
              </button>
            </div>
            <textarea
              rows={2}
              value={plan.movimiento}
              placeholder="the campfire flames flicker and the smoke drifts right"
              onChange={(e) => setPlan((p) => ({ ...p, movimiento: e.target.value }))}
              className="input mt-1 w-full text-[11px]"
            />
            {motivo && <p className="mt-1 text-[10px] text-accent">{motivo}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
              <label className="flex items-center gap-1">
                fotos
                <input type="number" min={MIN_FOTOS_LOOP} max={MAX_FOTOS_LOOP} value={plan.fotogramas}
                  onChange={(e) => setPlan((p) => ({ ...p, fotogramas: Number(e.target.value) }))}
                  className="input w-14 py-0.5 tabular-nums" />
              </label>
              <label className="flex items-center gap-1">
                fps
                <input type="number" min={1} max={30} value={plan.fps}
                  onChange={(e) => setPlan((p) => ({ ...p, fps: Number(e.target.value) }))}
                  className="input w-14 py-0.5 tabular-nums" />
              </label>
              <label className="flex items-center gap-1">
                forma
                <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}
                  className="input py-0.5">
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                calidad
                <select value={calidad} onChange={(e) => setCalidad(e.target.value as typeof calidad)}
                  className="input py-0.5">
                  <option value="low">baja</option>
                  <option value="medium">media</option>
                  <option value="high">alta</option>
                </select>
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={!archivo || ocupado}
            onClick={() => void generar()}
            className="btn-brand w-full justify-center text-xs disabled:opacity-40"
          >
            {paso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
            {paso ?? `Probar · ${plan.fotogramas - 1} imagen${plan.fotogramas - 1 === 1 ? "" : "es"}`}
          </button>

          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>

        <div className="min-w-0">
          {loop && urls.length >= 2 ? (
            <MesaLuz
              loop={loop}
              urls={urls}
              onFps={(fps) => setLoop((l) => (l ? { ...l, fps } : l))}
              onVaiven={(v) => setLoop((l) => (l ? { ...l, vaiven: v } : l))}
            />
          ) : (
            <div className="grid h-full min-h-[8rem] place-items-center rounded-md border border-dashed border-border text-[11px] text-muted">
              {paso ? paso : "Aquí sale el bucle cuando lo generes."}
            </div>
          )}

          {informe && (
            <div className="mt-2 rounded-md border border-gold/40 bg-gold/5 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Activity className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span className="text-[11px] font-medium text-gold">Qué pasó</span>
                <span className="text-[10px] tabular-nums text-muted">
                  {(informe.tiempos.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s en total
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                Deriva de brillo máxima sin corregir:{" "}
                <b className={`tabular-nums ${peor > 0.06 ? "text-danger" : "text-fg"}`}>
                  {(peor * 100).toFixed(1)}%
                </b>
                {peor > 0.06
                  ? " — eso es lo que se veía como parpadeo de la imagen entera. Aquí ya va igualado."
                  : " — por debajo de lo que se nota."}
              </p>
              <div className="mt-1 flex gap-1 overflow-x-auto">
                {informe.lumas.map((l, n) => (
                  <div key={n} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] tabular-nums">
                    <div className="text-muted">#{n + 1}</div>
                    <div>luz {l.toFixed(0)}</div>
                    <div className={Math.abs(informe.ganancias[n] - 1) > 0.02 ? "text-gold" : "text-muted"}>
                      ×{informe.ganancias[n].toFixed(2)}
                    </div>
                    <div className="text-muted">
                      {informe.tiempos[n] ? `${(informe.tiempos[n] / 1000).toFixed(0)}s` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
