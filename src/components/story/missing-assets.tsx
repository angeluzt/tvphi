"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImageOff, Search, Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { etiquetaTipo, aceptaDe, type Falta } from "@/lib/story/missing";

// Archivos que faltan en este navegador.
//
// Menú plegable: si hay muchos, el usuario lo cierra. Dentro puede dibujar con
// IA, buscar en el equipo, o (si hay IA) generar lo pendiente de un tirón.
// El formulario de dibujar sale justo debajo de la fila clicada.

export function MissingAssets({
  faltas,
  reponiendo,
  onReponer,
  onDibujar,
  onGenerarTodoIa,
  generandoTodo,
  panelDibujo,
  dibujoId,
  forzarAbierto,
}: {
  faltas: Falta[];
  reponiendo: string | null;
  onReponer: (falta: Falta, file: File) => void;
  onDibujar?: (falta: Falta) => void;
  /** Dibujar escenas + narrar diálogos que falten (si la IA está lista). */
  onGenerarTodoIa?: () => void;
  generandoTodo?: boolean;
  /** Formulario de dibujar (se inserta bajo la fila activa). */
  panelDibujo?: ReactNode;
  dibujoId?: string | null;
  /** Si hay un dibujo abierto, el menú no se queda cerrado. */
  forzarAbierto?: boolean;
}) {
  const [abierto, setAbierto] = useState(true);
  const mostrado = abierto || !!forzarAbierto;
  if (!faltas.length) return null;

  const escenas = faltas.filter((f) => f.tipo === "escena").length;
  const hayIa = !!onDibujar || !!onGenerarTodoIa;

  return (
    <div className="card border-gold/60 bg-gold/5 p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={mostrado}
      >
        {mostrado
          ? <ChevronDown className="h-4 w-4 shrink-0 text-gold" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-gold" />}
        <ImageOff className="h-4 w-4 shrink-0 text-gold" />
        <span className="label flex-1 text-gold">
          Faltan {faltas.length} {faltas.length === 1 ? "archivo" : "archivos"}
        </span>
        {!mostrado && (
          <span className="text-[11px] text-muted">tocar para ver</span>
        )}
      </button>

      {mostrado && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted">
            El montaje (textos, tiempos, efectos) ya está. Aquí faltan los archivos de este
            navegador. Puedes buscarlos en tu equipo
            {hayIa ? " o generarlos con IA" : ""}.
          </p>

          {onGenerarTodoIa && (
            <button
              type="button"
              onClick={onGenerarTodoIa}
              disabled={generandoTodo}
              className="btn-brand w-full text-xs disabled:opacity-40"
              title="Dibuja las escenas con descripción y narra los diálogos que falten"
            >
              {generandoTodo
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />}
              {generandoTodo ? "Generando con IA…" : "Generar todo lo que falte con IA"}
            </button>
          )}

          <div className="space-y-1.5">
            {faltas.map((f) => (
              <div key={f.id}>
                <Fila
                  falta={f}
                  ocupado={reponiendo === f.id || !!generandoTodo}
                  onReponer={onReponer}
                  onDibujar={onDibujar}
                />
                {panelDibujo && dibujoId === f.id && (
                  <div className="mt-1.5 border-l-2 border-accent/50 pl-2">
                    {panelDibujo}
                  </div>
                )}
              </div>
            ))}
          </div>

          {escenas > 0 && !onGenerarTodoIa && (
            <p className="text-[11px] text-muted">
              {escenas} {escenas === 1 ? "escena sin imagen" : "escenas sin imagen"}.
            </p>
          )}
        </div>
      )}
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
        <p className="truncate text-[11px] text-muted" title={falta.donde.join(" · ")}>
          {falta.donde.join(" · ")}
          {falta.donde.length > 1 && ` · se arreglan ${falta.donde.length} sitios de una vez`}
        </p>
      </div>
      {onDibujar && falta.tipo === "escena" && (
        <button
          onClick={() => onDibujar(falta)}
          disabled={ocupado}
          className="btn-ghost shrink-0 text-xs disabled:opacity-40"
          title="Escribir o corregir la descripción y dibujarla con IA"
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
