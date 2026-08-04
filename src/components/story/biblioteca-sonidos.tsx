"use client";

import { useMemo, useRef, useState } from "react";
import { Play, Pause, X, Check, Sparkles } from "lucide-react";
import { SONIDOS, porFamilia, refSonido, urlSonido, type Sonido } from "@/lib/story/musica";

// Sonidos puntuales que trae la app: un trueno, un portal, hielo formándose.
//
// Van dentro de una toma, no de fondo. A diferencia de la música —donde se
// ojean cuarenta y una y merece la pena la lista— aquí lo que hace falta es
// ocupar poco: la toma ya tiene movimiento, tiempos, diálogos y efectos, y una
// lista larga empuja todo eso fuera de la pantalla.
//
// Por eso es un desplegable agrupado por familia: una fila de alto, y da igual
// que mañana haya sesenta sonidos. Al lado, el botón de escuchar, que es lo
// único que de verdad hace falta para decidir.
//
// Se guardan por referencia ("son:<id>"): el archivo lo sirve la aplicación,
// así que no ocupan sitio en el navegador ni salen como «falta un archivo».

export function BibliotecaSonidos({
  onElegir,
  onCerrar,
}: {
  onElegir: (s: Sonido) => void;
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState(SONIDOS[0]?.id ?? "");
  const [sonando, setSonando] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const grupos = useMemo(porFamilia, []);
  const s = SONIDOS.find((x) => x.id === sel) ?? SONIDOS[0];

  function escuchar() {
    if (!s) return;
    if (sonando) {
      audio.current?.pause();
      setSonando(false);
      return;
    }
    if (!audio.current) audio.current = new Audio();
    audio.current.src = urlSonido(refSonido(s));
    audio.current.onended = () => setSonando(false);
    void audio.current.play().catch(() => setSonando(false));
    setSonando(true);
  }

  function elegir(id: string) {
    audio.current?.pause();
    setSonando(false);
    setSel(id);
  }

  if (!s) return null;

  return (
    <div className="mt-2 rounded-lg border border-accent/50 bg-surface-2/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[11px] font-medium text-accent">Sonidos de la app</span>
        <select
          className="input min-w-0 flex-1 py-1 text-xs"
          value={sel}
          onChange={(e) => elegir(e.target.value)}
          aria-label="Sonido de la app"
        >
          {grupos.map((g) => (
            <optgroup key={g.familia} label={g.label}>
              {g.sonidos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.titulo} · {x.segundos} s
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={escuchar}
          className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
          aria-label={`Escuchar ${s.titulo}`}
          title="Escuchar"
        >
          {sonando ? <Pause className="h-3.5 w-3.5 text-accent" /> : <Play className="h-3.5 w-3.5 text-accent" />}
        </button>
        <button
          onClick={() => { audio.current?.pause(); onElegir(s); }}
          className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
        >
          <Check className="h-3.5 w-3.5 text-accent" /> Usar
        </button>
        <button onClick={() => { audio.current?.pause(); onCerrar(); }} className="shrink-0 text-muted hover:text-fg" aria-label="Cerrar sonidos">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1 text-[10px] leading-tight text-muted">
        {s.cuando}
        {/* Cada sonido tiene su efecto: decirlo aquí ahorra buscarlo. */}
        {s.conEfecto && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-accent/80">
            <Sparkles className="h-2.5 w-2.5" /> va con «{s.conEfecto}»
          </span>
        )}
      </p>
    </div>
  );
}
