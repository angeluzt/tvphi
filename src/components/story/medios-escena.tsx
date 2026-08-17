"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Layers3, Loader2, Repeat, Sparkles } from "lucide-react";
import { medioDe } from "@/lib/story/medio";
import { assetUrl } from "@/lib/story/store";
import type { StoryScene } from "@/lib/story/model";
import { MesaLuz } from "./mesa-luz";
import { ParcheIa } from "./parche-ia";

export function MediosEscena({
  escena,
  indice,
  ocupado,
  onRegenerar,
  onAplanar,
  onApng,
  onParalaje,
  onFps,
  onRegenerarCuadro,
  regenerandoCuadro,
  onParche,
}: {
  escena: StoryScene;
  indice: number;
  ocupado?: boolean;
  onRegenerar: () => void;
  onAplanar: () => void;
  onApng: () => void;
  onParalaje: () => void;
  onFps: (fps: number) => void;
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
      {medio === "apng" && escena.loop && urls.filter(Boolean).length >= 2 && (
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
