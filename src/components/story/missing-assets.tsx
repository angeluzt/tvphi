"use client";

import { useRef } from "react";
import { ImageOff, Search, Loader2, Sparkles } from "lucide-react";
import { etiquetaTipo, aceptaDe, type Falta } from "@/lib/story/missing";

// Lista de lo que falta, con un botón por archivo para ir a buscarlo.
//
// Se repone con el MISMO identificador, así que si una imagen se usaba en varios
// sitios, todos quedan arreglados de una vez. Por eso cada fila dice todos los
// sitios donde se usa: para saber qué estás reponiendo.
export function MissingAssets({
  faltas,
  reponiendo,
  onReponer,
  onDibujar,
}: {
  faltas: Falta[];
  reponiendo: string | null;
  onReponer: (falta: Falta, file: File) => void;
  // Solo si hay clave de OpenAI con modelo de imagen: si no, no se ofrece algo
  // que no va a funcionar.
  onDibujar?: (falta: Falta) => void;
}) {
  if (!faltas.length) return null;
  const imagenes = faltas.filter((f) => f.tipo === "escena" || f.tipo === "sticker").length;
  return (
    <div className="card border-gold/60 bg-gold/5 p-3">
      <div className="flex items-center gap-2">
        <ImageOff className="h-4 w-4 shrink-0 text-gold" />
        <span className="label text-gold">
          Faltan {faltas.length} {faltas.length === 1 ? "archivo" : "archivos"}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        El montaje está entero: encuadres, textos, tiempos y efectos. Lo que no está en este
        navegador son los archivos, porque pesan y no viajan con el proyecto. Busca cada uno y
        todo vuelve a su sitio — no hay que rehacer nada.
        {imagenes > 0 && " Al reponer una imagen de escena se recalcula su proporción sola."}
      </p>
      <div className="mt-2 space-y-1.5">
        {faltas.map((f) => (
          <Fila key={f.id} falta={f} ocupado={reponiendo === f.id} onReponer={onReponer} onDibujar={onDibujar} />
        ))}
      </div>
    </div>
  );
}

function Fila({
  falta,
  ocupado,
  onReponer,
  onDibujar,
}: {
  falta: Falta;
  ocupado: boolean;
  onReponer: (falta: Falta, file: File) => void;
  onDibujar?: (falta: Falta) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{etiquetaTipo(falta.tipo)}</p>
        {/* Todos los sitios donde se usa: reponerlo una vez los arregla todos. */}
        <p className="truncate text-[11px] text-muted" title={falta.donde.join(" · ")}>
          {falta.donde.join(" · ")}
          {falta.donde.length > 1 && ` · se arreglan ${falta.donde.length} sitios de una vez`}
        </p>
      </div>
      {/* Dibujarla en vez de buscarla. Solo para escenas: un sonido no se
          dibuja, y un sticker suele ser tuyo. */}
      {onDibujar && falta.tipo === "escena" && (
        <button
          onClick={() => onDibujar(falta)}
          disabled={ocupado}
          className="btn-ghost shrink-0 text-xs disabled:opacity-40"
          title="Dibujarla con IA a partir de su descripción"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Dibujar
        </button>
      )}
      <button
        onClick={() => input.current?.click()}
        disabled={ocupado}
        className="btn-ghost shrink-0 text-xs disabled:opacity-40"
        title="Buscar este archivo en tu equipo"
      >
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 text-accent" />}
        Buscar
      </button>
      <input
        ref={input}
        type="file"
        accept={aceptaDe(falta.tipo)}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onReponer(falta, f);
        }}
      />
    </div>
  );
}
