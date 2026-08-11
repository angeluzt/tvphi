"use client";

import { Music, Trash2, Volume2 } from "lucide-react";
import type { AudioLayer } from "@/lib/story/model";
import { EscucharAudio } from "./escuchar-audio";
import { Slider } from "./slider";
import { NumberInput } from "./number-input";

// La música y los efectos que suenan en TODO el video.
//
// Estaba escrito dentro del panel de la derecha y solo se podía tocar desde
// allí. Hacía falta en dos sitios: en ese panel y dentro del mando del
// reproductor, que es donde estás cuando oyes que la música tapa la voz y
// quieres bajarla sin perder de vista lo que suena.
//
// Se saca a su propio archivo en vez de copiarlo: son cuatro controles con
// reglas propias —el volumen de la música es el de los SILENCIOS, no el de
// mientras se narra— y dos copias de eso acaban diciendo cosas distintas.

export function CapasAudio({ capas, onCambiar, onQuitar, compacto }: {
  capas: AudioLayer[];
  onCambiar: (id: string, patch: Partial<AudioLayer>) => void;
  onQuitar: (id: string) => void;
  /** Dentro del mando, donde el sitio es el que es. */
  compacto?: boolean;
}) {
  if (!capas.length) {
    return (
      <p className="text-[11px] text-muted">
        Música de fondo para todo el video. Los sonidos puntuales van dentro de cada toma.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {capas.map((l) => (
        <div key={l.id} className="rounded-lg border border-border p-2 text-sm">
          <div className="flex items-center gap-2">
            <EscucharAudio audioId={l.audioId} volumen={l.volume} titulo={l.name} />
            {l.kind === "music"
              ? <Music className="h-3.5 w-3.5 shrink-0 text-accent" />
              : <Volume2 className="h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1 truncate text-xs">{l.name}</span>
            <button
              onClick={() => onQuitar(l.id)}
              className="shrink-0 text-muted hover:text-danger"
              aria-label={`Quitar ${l.name}`}
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Slider label="Volumen" value={l.volume} min={0} max={1} step={0.01}
              onChange={(v) => onCambiar(l.id, { volume: v })}
              format={(v) => `${Math.round(v * 100)}%`} />
            <NumberInput
              label="Inicio (s)"
              value={l.startSec}
              onChange={(v) => onCambiar(l.id, { startSec: v })}
              min={0} max={3600} step={0.5}
            />
          </div>
          {/* Sin esto el número engaña: no es el volumen con el que se oye bajo
              la voz, sino el de los huecos entre frases. */}
          {l.kind === "music" && !compacto && (
            <p className="mt-1 text-[10px] leading-tight text-muted">
              Es el volumen en los silencios. Mientras se narra baja sola a{" "}
              <span className="text-accent">{Math.round(l.volume * 30)}%</span> para no tapar la voz.
            </p>
          )}
          <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" checked={l.loop}
              onChange={(e) => onCambiar(l.id, { loop: e.target.checked })} />
            Repetir en bucle todo el video
          </label>
        </div>
      ))}
    </div>
  );
}
