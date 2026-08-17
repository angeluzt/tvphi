"use client";

import { useEffect, useState } from "react";
import {
  Activity, Image as ImageIcon, Layers3, Loader2, Repeat, Sparkles, Wand2,
} from "lucide-react";
import { medioDe, MAX_FOTOS_LOOP, MIN_FOTOS_LOOP, type PlanAnimacion } from "@/lib/story/medio";
import { assetUrl } from "@/lib/story/store";
import type { StoryScene } from "@/lib/story/model";
import { MesaLuz } from "./mesa-luz";
import { ParcheIa } from "./parche-ia";
import type { InformeLoop } from "@/lib/story/generar-loop";

export function MediosEscena({
  escena,
  indice,
  ocupado,
  esAdmin,
  informe,
  onRegenerar,
  onAplanar,
  onApng,
  onParalaje,
  onFps,
  onVaiven,
  onPlan,
  onRegenerarCuadro,
  regenerandoCuadro,
  onParche,
}: {
  escena: StoryScene;
  indice: number;
  ocupado?: boolean;
  /** Los números de la última prueba solo le sirven a quien está afinando esto. */
  esAdmin?: boolean;
  informe?: (InformeLoop & { plan: PlanAnimacion }) | null;
  onRegenerar: () => void;
  onAplanar: () => void;
  onApng: () => void;
  onParalaje: () => void;
  onFps: (fps: number) => void;
  onVaiven: (v: boolean) => void;
  onPlan: (p: PlanAnimacion | undefined) => void;
  onRegenerarCuadro?: (indice: number) => void;
  regenerandoCuadro?: number | null;
  onParche: (instruccion: string) => void;
}) {
  const medio = medioDe(escena);
  /**
   * Una URL por fotograma, EN SU SITIO. `null` = ese cuadro no está en este
   * navegador.
   *
   * Antes se filtraban los que faltaban, y eso corría los índices: si el
   * segundo cuadro no estaba, el tercero pasaba a ocupar su hueco y darle a
   * «regenerar» en una miniatura rehacía un fotograma distinto del que se
   * estaba mirando. Las posiciones tienen que coincidir con `loop.imageIds`
   * porque el índice es lo que se manda al regenerar.
   */
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const claves = (escena.loop?.imageIds ?? []).join("|");
  const plan = escena.animacion;
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ids = claves ? claves.split("|") : [];
    void Promise.all(ids.map((id) => assetUrl(id))).then((u) => {
      if (vivo) setUrls(u);
    });
    return () => { vivo = false; };
  }, [claves]);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium">Medio</span>
        <span className="chip bg-accent/15 text-accent">
          {medio === "paralaje" ? "2.5D" : medio === "apng" ? "foto viva" : "foto"}
        </span>
        {/* Lo que la IA pidió pero todavía no existe. Antes solo se notaba
            porque el botón cambiaba de texto, y era fácil dar por hecho que
            marcar el medio ya lo había montado. */}
        {escena.medio && escena.medio !== medio && (
          <span className="chip bg-gold/15 text-gold" title="La IA lo pidió; aún no está montado">
            pide {escena.medio === "apng" ? "foto viva" : "2.5D"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
          disabled={ocupado} onClick={onRegenerar} title="Otra imagen, mismo prompt">
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-accent" />}
          Regenerar
        </button>
        {medio !== "still" && (
          <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
            disabled={ocupado} onClick={onAplanar}>
            <ImageIcon className="h-3.5 w-3.5" /> Foto regular
          </button>
        )}
        <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
          disabled={ocupado || !escena.imageId} onClick={onApng}
          title="N fotos enteras, cada una a partir de la anterior">
          <Repeat className="h-3.5 w-3.5" />
          {medio === "apng"
            ? "Regenerar loop"
            : escena.medio === "apng" ? "Materializar foto viva" : "Foto viva"}
        </button>
        {medio !== "paralaje" && (
          <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
            disabled={ocupado} onClick={onParalaje}>
            <Layers3 className="h-3.5 w-3.5" /> {escena.medio === "paralaje" ? "Materializar 2.5D" : "2.5D"}
          </button>
        )}
      </div>

      {/* ── QUÉ se anima ────────────────────────────────────────────────
          Es el mando que faltaba. Sin una frase concreta, cada fotograma
          elegía mover una cosa distinta y salía una imagen inquieta en vez
          de una animación; y sin ver la frase, no había forma de saber por
          qué había salido así ni de corregirlo sin volver a empezar. */}
      <div className="rounded-md border border-border bg-surface-2/40 p-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left"
          aria-expanded={abierto}
        >
          <Wand2 className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-[11px] font-medium">Qué se anima</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
            {plan?.movimiento
              ? `${plan.movimiento} · ${plan.fotogramas} fotos a ${plan.fps} fps`
              : "sin decidir — la IA mirará la foto al generar"}
          </span>
          <span className="shrink-0 text-[10px] text-muted">{abierto ? "−" : "+"}</span>
        </button>
        {abierto && (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              rows={2}
              value={plan?.movimiento ?? ""}
              placeholder="the campfire flames flicker and the smoke drifts to the right"
              onChange={(e) => onPlan({
                movimiento: e.target.value,
                fotogramas: plan?.fotogramas ?? 5,
                fps: plan?.fps ?? 6,
              })}
              className="input w-full text-[11px]"
            />
            <p className="text-[10px] text-muted">
              En inglés y solo lo que se mueve: fuego, humo, agua, tela, pelo, hojas.
              Nada de mover la cámara ni desplazar a nadie — eso no es este efecto.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-[10px] text-muted">
                fotos
                <input
                  type="number" min={MIN_FOTOS_LOOP} max={MAX_FOTOS_LOOP}
                  value={plan?.fotogramas ?? 5}
                  onChange={(e) => onPlan({
                    movimiento: plan?.movimiento ?? "",
                    fotogramas: Number(e.target.value),
                    fps: plan?.fps ?? 6,
                  })}
                  className="input w-14 py-0.5 text-[11px] tabular-nums"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted">
                fps
                <input
                  type="number" min={1} max={30}
                  value={plan?.fps ?? 6}
                  onChange={(e) => onPlan({
                    movimiento: plan?.movimiento ?? "",
                    fotogramas: plan?.fotogramas ?? 5,
                    fps: Number(e.target.value),
                  })}
                  className="input w-14 py-0.5 text-[11px] tabular-nums"
                />
              </label>
              {plan && (
                <button type="button" onClick={() => onPlan(undefined)}
                  className="text-[10px] text-muted underline hover:text-fg">
                  que lo decida la IA
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {medio === "apng" && escena.loop && urls.filter(Boolean).length >= 2 && (
        <MesaLuz
          loop={escena.loop}
          urls={urls}
          onFps={onFps}
          onVaiven={onVaiven}
          onRegenerar={onRegenerarCuadro}
          regenerando={regenerandoCuadro}
        />
      )}

      {esAdmin && informe && <FichaPrueba informe={informe} />}

      <ParcheIa etiqueta={`escena ${indice + 1}`} ocupado={ocupado} onParche={onParche} />
    </div>
  );
}

/**
 * Los números de la última foto viva.
 *
 * EXISTE PARA PODER DECIDIR. «Parpadea» es una impresión, y con una impresión
 * no se sabe si el parpadeo viene del brillo, del encuadre o del cierre del
 * bucle: son tres arreglos distintos. Aquí se ve la deriva de luz cuadro a
 * cuadro (la que se corrigió y cuánto), y lo que tardó cada llamada, que es lo
 * que dice si merece la pena subir el número de fotogramas.
 */
function FichaPrueba({ informe }: { informe: InformeLoop & { plan: PlanAnimacion } }) {
  const { lumas, ganancias, tiempos, plan } = informe;
  const patron = lumas[0] || 1;
  // La deriva SIN corregir: es la que se habría visto como parpadeo.
  const peor = Math.max(...lumas.map((l) => Math.abs(l - patron) / patron));
  const total = tiempos.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-md border border-gold/40 bg-gold/5 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="h-3.5 w-3.5 shrink-0 text-gold" />
        <span className="text-[11px] font-medium text-gold">Prueba de la última foto viva</span>
        <span className="text-[10px] tabular-nums text-muted">
          {plan.fotogramas} fotos · {plan.fps} fps · {(total / 1000).toFixed(1)} s en total
        </span>
      </div>
      <p className="mt-1 text-[10px] text-muted">
        Deriva de brillo máxima sin corregir:{" "}
        <b className={`tabular-nums ${peor > 0.06 ? "text-danger" : "text-fg"}`}>
          {(peor * 100).toFixed(1)}%
        </b>
        {peor > 0.06
          ? " — eso es lo que se veía como parpadeo de la imagen entera. Ya va igualado."
          : " — dentro de lo que no se nota."}
      </p>
      <div className="mt-1 flex gap-1 overflow-x-auto">
        {lumas.map((l, n) => (
          <div key={n} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] tabular-nums">
            <div className="text-muted">#{n + 1}</div>
            <div>luz {l.toFixed(0)}</div>
            <div className={Math.abs(ganancias[n] - 1) > 0.02 ? "text-gold" : "text-muted"}>
              ×{ganancias[n].toFixed(2)}
            </div>
            <div className="text-muted">{tiempos[n] ? `${(tiempos[n] / 1000).toFixed(0)}s` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
