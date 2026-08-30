"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon, Layers3, Loader2, Repeat, Sparkles, Bird, Wand2,
} from "lucide-react";
import { medioDe, vivaConSprites } from "@/lib/story/medio";
import { assetUrl } from "@/lib/story/store";
import { resumenPlan, type PlanMedio } from "@/lib/story/plan-medios";
import type { MedioEscena } from "@/lib/story/paleta";
import type { StoryScene } from "@/lib/story/model";
import { MesaLuz } from "./mesa-luz";
import { ParcheIa } from "./parche-ia";

// Los tres medios de una escena, en una tarjeta.
//
// LO QUE HABÍA. Cuatro botones sueltos —regenerar, foto regular, foto viva,
// 2.5D— sin decir en ningún sitio qué había planeado la IA ni qué iba a costar
// pulsar cada uno. «Foto viva» podía ser una imagen o diez y no había forma de
// saberlo hasta que la factura ya estaba hecha.
//
// LO QUE HAY. Lo mismo, pero contado: qué es esta escena AHORA, qué quería que
// fuera la IA, con qué técnica y cuántas imágenes cuesta cada camino. Y la foto
// viva son dos botones distintos, porque son dos cosas distintas: repintar la
// escena entera, o dejarla quieta y pegarle actores encima.

const ETIQUETA: Record<string, string> = {
  still: "foto",
  apng: "foto viva",
  paralaje: "2.5D",
};

export function MediosEscena({
  escena,
  indice,
  ocupado,
  onRegenerar,
  onAplanar,
  onApng,
  onVivaSprites,
  onParalaje,
  onFps,
  onRegenerarCuadro,
  regenerandoCuadro,
  onParche,
  onPlan,
  onMedioPlaneado,
}: {
  escena: StoryScene;
  indice: number;
  ocupado?: boolean;
  onRegenerar: () => void;
  onAplanar: () => void;
  onApng: () => void;
  /** Foto viva con actores recortados. Solo si la IA planeó alguno. */
  onVivaSprites?: () => void;
  onParalaje: () => void;
  onFps: (fps: number) => void;
  onRegenerarCuadro?: (indice: number) => void;
  regenerandoCuadro?: number | null;
  onParche: (instruccion: string) => void;
  /** Cambiar a mano lo que la IA planeó para esta escena. */
  onPlan?: (plan: PlanMedio | undefined) => void;
  /** Cambiar el medio planeado, con el plan que le corresponda por defecto. */
  onMedioPlaneado?: (medio: MedioEscena) => void;
}) {
  const medio = medioDe(escena);
  const conActores = vivaConSprites(escena);
  const [urls, setUrls] = useState<string[]>([]);

  const plan = escena.plan;
  const planeado = escena.medio ?? "still";
  const sinMontar = medio === "still" && planeado !== "still";
  const actores = plan?.viva?.elementos ?? [];

  useEffect(() => {
    let vivo = true;
    const ids = escena.loop?.imageIds ?? [];
    void Promise.all(ids.map((id) => assetUrl(id))).then((u) => {
      if (vivo) setUrls(u.filter((x): x is string => !!x));
    });
    return () => { vivo = false; };
  }, [escena.loop?.imageIds?.join("|")]);

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium">Medio</span>
        <span className="chip bg-accent/15 text-accent">
          {ETIQUETA[medio]}
          {conActores && " · actores"}
        </span>
        {/* Lo que la IA quería que fuera esta escena, si todavía no lo es. Sin
            esto, una escena marcada como 2.5D y sin montar se ve exactamente
            igual que una foto plana y nadie se entera de que falta un paso. */}
        {sinMontar && (
          <span className="chip bg-gold/15 text-gold" title="Planeado por la IA, sin montar todavía">
            planeado: {resumenPlan(planeado === "apng" ? "apng" : "paralaje", plan)}
          </span>
        )}
      </div>

      {/* Qué se mueve, cuando la IA lo dijo. Es lo que se le manda al modelo de
          imagen en cada fotograma, así que poder leerlo y corregirlo aquí es la
          diferencia entre «respira algo» y «respira el agua de la orilla». */}
      {planeado === "apng" && plan?.viva?.tecnica === "cuadros" && (
        <label className="block">
          <span className="text-[10px] text-muted">Qué se mueve (en inglés)</span>
          <input
            className="input mt-0.5 w-full text-[11px]"
            value={plan.viva.movimiento ?? ""}
            placeholder="the water of the shore, gently"
            disabled={!onPlan}
            onChange={(e) => onPlan?.({
              ...plan,
              viva: { ...plan.viva!, movimiento: e.target.value.slice(0, 400) },
            })}
          />
        </label>
      )}

      {planeado === "apng" && plan?.viva && onPlan && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-[10px] text-muted">
            cuadros
            <input
              type="range" min={2} max={12} step={1} value={plan.viva.fotogramas}
              onChange={(e) => onPlan({
                ...plan, viva: { ...plan.viva!, fotogramas: Number(e.target.value) },
              })}
            />
            <span className="tabular-nums text-fg">{plan.viva.fotogramas}</span>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted">
            fps
            <input
              type="range" min={1} max={16} step={1} value={plan.viva.fps}
              onChange={(e) => onPlan({
                ...plan, viva: { ...plan.viva!, fps: Number(e.target.value) },
              })}
            />
            <span className="tabular-nums text-fg">{plan.viva.fps}</span>
          </label>
        </div>
      )}

      {/* Los actores planeados. Se enseñan ANTES de pagarlos: son una imagen
          cada uno y su descripción es lo único que decide qué sale. */}
      {!!actores.length && (
        <ul className="space-y-0.5">
          {actores.map((a, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px] text-muted">
              <Bird className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{a.que}</span>
              <span className="shrink-0 tabular-nums">{a.fotogramas}×{a.fps}fps</span>
            </li>
          ))}
        </ul>
      )}

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
          title="N fotos enteras, cada una a partir de la anterior. Para agua, fuego, humo o viento.">
          <Repeat className="h-3.5 w-3.5" />
          {medio === "apng" && !conActores ? "Rehacer los cuadros" : "Viva · cuadros"}
        </button>
        {onVivaSprites && (
          <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
            disabled={ocupado || !escena.imageId || !actores.length}
            onClick={onVivaSprites}
            title={actores.length
              ? "La foto se queda quieta y encima van actores recortados. Una imagen por actor."
              : "Esta escena no tiene actores planeados"}>
            <Bird className="h-3.5 w-3.5" />
            {conActores ? "Rehacer los actores" : "Viva · actores"}
          </button>
        )}
        {medio !== "paralaje" && (
          <button type="button" className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
            disabled={ocupado} onClick={onParalaje}>
            <Layers3 className="h-3.5 w-3.5" /> {planeado === "paralaje" ? "Montar 2.5D" : "2.5D"}
          </button>
        )}
      </div>

      {/* Cambiar el medio planeado sin tocar el JSON. Es lo que permite decir
          «esto no es agua, es un pájaro» y que la escena se monte con la otra
          técnica sin volver a generar el capítulo. */}
      {onMedioPlaneado && (
        <div className="flex flex-wrap items-center gap-1">
          <Wand2 className="h-3 w-3 shrink-0 text-muted" />
          <span className="text-[10px] text-muted">Planear como</span>
          {(["still", "apng", "paralaje"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={ocupado || planeado === m}
              onClick={() => onMedioPlaneado(m)}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                planeado === m
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              {ETIQUETA[m]}
            </button>
          ))}
        </div>
      )}

      {medio === "apng" && escena.loop && urls.length >= 2 && (
        <MesaLuz
          loop={escena.loop}
          urls={urls}
          onFps={onFps}
          onRegenerar={onRegenerarCuadro}
          regenerando={regenerandoCuadro}
        />
      )}
      <ParcheIa etiqueta={`escena ${indice + 1}`} ocupado={ocupado} onParche={onParche} />
    </div>
  );
}
