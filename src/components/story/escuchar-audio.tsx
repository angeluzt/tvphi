"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { assetUrl } from "@/lib/story/store";

// Escuchar un audio ya puesto, sin darle al play del vídeo.
//
// Antes, para saber si una lluvia quedaba muy alta o si una voz había salido
// bien, había que reproducir la historia entera y esperar a llegar al sitio.
// Con esto se oye el archivo suelto, y al volumen que tenga puesto, que es lo
// que de verdad se quiere comprobar.
//
// Vale para cualquier id: los de la biblioteca ("lib:", "son:") y los que ha
// subido el usuario, porque assetUrl() los resuelve todos por el mismo sitio.
export function EscucharAudio({
  audioId,
  volumen = 1,
  titulo,
  clase = "",
}: {
  audioId: string;
  /** Se aplica al oírlo, para juzgarlo como sonará en el vídeo. */
  volumen?: number;
  titulo?: string;
  clase?: string;
}) {
  const [estado, setEstado] = useState<"parado" | "cargando" | "sonando">("parado");
  const audio = useRef<HTMLAudioElement | null>(null);

  // Al desmontar (o al cambiar de audio) se corta: si no, se queda sonando
  // un sonido de una toma que ya se cerró.
  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, [audioId]);

  // Mover la barra mientras suena tiene que oírse al momento; para eso está.
  useEffect(() => { if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volumen)); }, [volumen]);

  async function alternar() {
    if (estado === "sonando") {
      audio.current?.pause();
      setEstado("parado");
      return;
    }
    setEstado("cargando");
    try {
      const url = await assetUrl(audioId);
      if (!url) { setEstado("parado"); return; }
      if (!audio.current) audio.current = new Audio();
      audio.current.src = url;
      audio.current.volume = Math.max(0, Math.min(1, volumen));
      audio.current.onended = () => setEstado("parado");
      audio.current.onerror = () => setEstado("parado");
      await audio.current.play();
      setEstado("sonando");
    } catch {
      setEstado("parado");
    }
  }

  return (
    <button
      onClick={alternar}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border ` +
        `${estado === "sonando" ? "text-accent" : "text-muted"} hover:bg-surface-2 ${clase}`}
      title={estado === "sonando" ? "Parar" : `Escuchar${titulo ? ` ${titulo}` : ""}`}
      aria-label={estado === "sonando" ? "Parar" : `Escuchar${titulo ? ` ${titulo}` : ""}`}
    >
      {estado === "cargando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : estado === "sonando" ? <Square className="h-3 w-3 fill-current" />
        : <Play className="h-3.5 w-3.5" />}
    </button>
  );
}
