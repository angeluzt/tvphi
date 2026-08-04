"use client";

import { useMemo, useRef, useState } from "react";
import { Play, Pause, X, Search, Check, AlertTriangle, Repeat, ArrowDownToLine } from "lucide-react";
import { porAmbiente, urlPista, refPista, type Pista } from "@/lib/story/musica";

// Elegir música de la biblioteca de la app.
//
// Lo importante aquí es poder ESCUCHARLA antes de ponerla. Una lista de títulos
// sin botón de play obliga a añadir, oír, quitar y volver a empezar; con la
// escucha delante se elige en diez segundos.
//
// Las pistas no se copian a ningún sitio: el proyecto guarda solo "lib:<id>" y
// el archivo lo sirve la propia aplicación. Por eso nunca salen como «falta un
// archivo» al abrir el capítulo en otro equipo.

export function BibliotecaMusica({
  onElegir,
  onCerrar,
}: {
  onElegir: (p: Pista) => void;
  onCerrar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [sonando, setSonando] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return porAmbiente();
    return porAmbiente()
      .map((g) => ({
        ...g,
        pistas: g.pistas.filter(
          (p) =>
            p.titulo.toLowerCase().includes(q) ||
            p.cuando.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.pistas.length > 0);
  }, [busca]);

  function escuchar(p: Pista) {
    const ref = refPista(p);
    if (sonando === ref) {
      audio.current?.pause();
      setSonando(null);
      return;
    }
    if (!audio.current) audio.current = new Audio();
    audio.current.src = urlPista(ref);
    audio.current.onended = () => setSonando(null);
    void audio.current.play().catch(() => setSonando(null));
    setSonando(ref);
  }

  const total = grupos.reduce((n, g) => n + g.pistas.length, 0);

  return (
    <div className="mt-2 rounded-lg border border-accent/50 bg-surface-2/40 p-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
        <input
          className="input min-w-0 flex-1 py-1 text-xs"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar: tensión, bosque, detective, despedida…"
          aria-label="Buscar música"
          autoFocus
        />
        <button onClick={() => { audio.current?.pause(); onCerrar(); }} className="shrink-0 text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 max-h-80 space-y-3 overflow-y-auto pr-1">
        {grupos.map((g) => (
          <div key={g.ambiente}>
            <p className="text-[10px] uppercase tracking-wide text-muted">{g.label}</p>
            <div className="mt-1 space-y-1">
              {g.pistas.map((p) => {
                const ref = refPista(p);
                return (
                  <div key={p.id} className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5">
                    <button
                      onClick={() => escuchar(p)}
                      className="mt-0.5 shrink-0 text-accent hover:text-fg"
                      aria-label={`Escuchar ${p.titulo}`}
                      title="Escuchar"
                    >
                      {sonando === ref ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{p.titulo}</p>
                      <p className="text-[10px] leading-tight text-muted">{p.cuando}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted/70">
                        {Math.round(p.segundos)} s
                        {/* Cómo acaba, medido. No es un detalle: decide dónde
                            ponerla. La que baja a silencio cierra bien una
                            escena, pero en bucle deja un hueco de silencio en
                            medio; la que enlaza aguanta un capítulo largo. */}
                        {p.final === "fade" && (
                          <span className="flex items-center gap-0.5 text-muted">
                            <ArrowDownToLine className="h-2.5 w-2.5" /> acaba en silencio
                          </span>
                        )}
                        {p.final === "enlaza" && (
                          <span className="flex items-center gap-0.5 text-accent/80">
                            <Repeat className="h-2.5 w-2.5" /> enlaza en bucle
                          </span>
                        )}
                        {p.final === "media" && (
                          <span className="flex items-center gap-0.5 text-gold">
                            <AlertTriangle className="h-2.5 w-2.5" /> acaba a medias
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => { audio.current?.pause(); onElegir(p); }}
                      className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
                    >
                      <Check className="h-3.5 w-3.5 text-accent" /> Usar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {total === 0 && <p className="py-3 text-[11px] text-muted">Nada con «{busca}».</p>}
      </div>

      <p className="mt-2 text-[10px] text-muted">
        {total} pistas de unos 30 s. Van dentro de la app: no ocupan sitio en tu navegador y no
        salen como «falta un archivo» al abrir el capítulo en otro equipo.
      </p>
    </div>
  );
}
