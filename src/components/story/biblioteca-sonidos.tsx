"use client";

import { useRef, useState } from "react";
import { Play, Pause, X, Check, Sparkles } from "lucide-react";
import { SONIDOS, refSonido, urlSonido, type Sonido } from "@/lib/story/musica";

// Sonidos puntuales que trae la app: un trueno, un portal, hielo formándose.
//
// Van dentro de una toma, no de fondo. Se pueden escuchar antes de ponerlos,
// que es lo único que hace falta para elegir entre cinco cosas cortas.
//
// Como la música, se guardan por referencia ("son:<id>"): el archivo lo sirve
// la aplicación, así que no ocupan sitio en el navegador ni salen como «falta
// un archivo» al abrir el proyecto en otro equipo.

export function BibliotecaSonidos({
  onElegir,
  onCerrar,
}: {
  onElegir: (s: Sonido) => void;
  onCerrar: () => void;
}) {
  const [sonando, setSonando] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  function escuchar(s: Sonido) {
    const ref = refSonido(s);
    if (sonando === ref) {
      audio.current?.pause();
      setSonando(null);
      return;
    }
    if (!audio.current) audio.current = new Audio();
    audio.current.src = urlSonido(ref);
    audio.current.onended = () => setSonando(null);
    void audio.current.play().catch(() => setSonando(null));
    setSonando(ref);
  }

  return (
    <div className="mt-2 rounded-lg border border-accent/50 bg-surface-2/40 p-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-accent">Sonidos de la app</span>
        <button
          onClick={() => { audio.current?.pause(); onCerrar(); }}
          className="ml-auto text-muted hover:text-fg"
          aria-label="Cerrar sonidos"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {SONIDOS.map((s) => {
          const ref = refSonido(s);
          return (
            <div key={s.id} className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5">
              <button
                onClick={() => escuchar(s)}
                className="mt-0.5 shrink-0 text-accent hover:text-fg"
                aria-label={`Escuchar ${s.titulo}`}
                title="Escuchar"
              >
                {sonando === ref ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{s.titulo}</p>
                <p className="text-[10px] leading-tight text-muted">{s.cuando}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted/70">
                  {s.segundos} s
                  {/* Cada sonido tiene su efecto: decirlo aquí ahorra buscarlo. */}
                  {s.conEfecto && (
                    <span className="flex items-center gap-0.5 text-accent/80">
                      <Sparkles className="h-2.5 w-2.5" /> va con «{s.conEfecto}»
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => { audio.current?.pause(); onElegir(s); }}
                className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
              >
                <Check className="h-3.5 w-3.5 text-accent" /> Usar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
