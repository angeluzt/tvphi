"use client";

import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crop, Loader2, RotateCcw, RotateCw, Scissors,
} from "lucide-react";
import { Barra, Flecha } from "./controles-basicos";
import { estaColocadaAMano, type AjusteCapa } from "@/lib/lab/ajuste-capa";

/**
 * Acomodar una pieza: moverla, girarla, encogerla — y partir la capa si lo que
 * hace falta mover va pegado a otra cosa dentro del mismo PNG.
 *
 * Los dos bloques van JUNTOS porque son la misma tarea vista desde dos lados.
 * Uno abre el cuadro «no puedo mover esto solo» y el otro lo cierra: primero se
 * separa el farolillo del arce, y entonces ya hay algo que colocar.
 */
export function MandosPiezas({
  ajuste,
  onAjuste,
  onSoltar,
  esSprite,
  bloqueada,
  ocupado,
  onSeparar,
  modoRecorte,
  onModoRecorte,
  hayRecorte,
  onRecortar,
  seleccionadas,
}: {
  ajuste?: AjusteCapa;
  onAjuste: (patch: Partial<AjusteCapa>) => void;
  onSoltar: () => void;
  esSprite: boolean;
  bloqueada?: boolean;
  /** Texto de lo que se está calculando, si hay algo en marcha. */
  ocupado?: string | null;
  onSeparar: () => void;
  modoRecorte: boolean;
  onModoRecorte: (v: boolean) => void;
  hayRecorte: boolean;
  onRecortar: () => void;
  /** Cuántas capas se moverán al arrastrar, para no prometer de más. */
  seleccionadas: number;
}) {
  const a = ajuste;
  const paso = 0.01;
  const empujar = (dx: number, dy: number) =>
    onAjuste({ dx: (a?.dx ?? 0) + dx, dy: (a?.dy ?? 0) + dy });
  const puesta = estaColocadaAMano(a);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold text-fg">Colocar a mano</p>
        {puesta && (
          <button type="button" onClick={onSoltar} disabled={bloqueada}
            className="ml-auto rounded border border-border px-1.5 py-0.5 text-[9px] text-muted hover:text-fg disabled:opacity-40">
            <RotateCcw className="mr-1 inline h-3 w-3" /> Devolver a su sitio
          </button>
        )}
      </div>

      {esSprite ? (
        <p className="text-[10px] text-muted">
          Este es un actor: se coloca con su punto X/Y en «Más opciones», o arrastrándolo en el lienzo.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-0.5">
              <span />
              <Flecha etiqueta="Subir" disabled={bloqueada} onPulsa={() => empujar(0, -paso)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Flecha>
              <span />
              <Flecha etiqueta="Izquierda" disabled={bloqueada} onPulsa={() => empujar(-paso, 0)}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </Flecha>
              <Flecha etiqueta="Centrar" disabled={bloqueada} onPulsa={() => onAjuste({ dx: 0, dy: 0 })}>
                <span className="block h-3.5 w-3.5 text-[9px] leading-[14px]">◎</span>
              </Flecha>
              <Flecha etiqueta="Derecha" disabled={bloqueada} onPulsa={() => empujar(paso, 0)}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Flecha>
              <span />
              <Flecha etiqueta="Bajar" disabled={bloqueada} onPulsa={() => empujar(0, paso)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Flecha>
              <span />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Barra etiqueta="Giro" valor={a?.giro ?? 0} min={-180} max={180} paso={1}
                disabled={bloqueada}
                onCambio={(v) => onAjuste({ giro: v })} formato={(v) => `${Math.round(v)}°`} />
              <Barra etiqueta="Tamaño" valor={a?.escala ?? 1} min={0.2} max={2.5} paso={0.01}
                disabled={bloqueada}
                onCambio={(v) => onAjuste({ escala: v })} formato={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={bloqueada} onClick={() => onAjuste({ giro: (a?.giro ?? 0) - 5 })}
              className="btn-ghost px-1.5 py-1 text-[10px] disabled:opacity-40" title="Girar 5° a la izquierda">
              <RotateCcw className="h-3.5 w-3.5" /> 5°
            </button>
            <button type="button" disabled={bloqueada} onClick={() => onAjuste({ giro: (a?.giro ?? 0) + 5 })}
              className="btn-ghost px-1.5 py-1 text-[10px] disabled:opacity-40" title="Girar 5° a la derecha">
              <RotateCw className="h-3.5 w-3.5" /> 5°
            </button>
            <span className="text-[9px] text-muted">
              {seleccionadas > 1
                ? `Arrastrar en el lienzo mueve ${seleccionadas} capas`
                : "Arrastrar en el lienzo mueve solo esta"}
            </span>
          </div>
        </>
      )}

      {!esSprite && (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <p className="text-[10px] font-semibold text-fg">¿Va pegado a otra cosa?</p>
          <p className="text-[9px] text-muted">
            Si en esta capa hay varias cosas y quieres moverlas por separado, pártela: cada trozo
            pasa a ser su propia capa, con su orden, su profundidad y su candado.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={onSeparar} disabled={bloqueada || !!ocupado}
              className="btn-ghost px-1.5 py-1 text-[10px] disabled:opacity-40"
              title="Una capa por cada trozo que no toque a los demás">
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
              Separar piezas sueltas
            </button>
            <button type="button" onClick={() => onModoRecorte(!modoRecorte)} disabled={bloqueada || !!ocupado}
              className={`btn-ghost px-1.5 py-1 text-[10px] disabled:opacity-40 ${modoRecorte ? "border-accent bg-accent/15 text-accent" : ""}`}
              title="Encierra en un recuadro la parte que quieras sacar a otra capa">
              <Crop className="h-3.5 w-3.5" /> Recortar zona
            </button>
            {modoRecorte && hayRecorte && (
              <button type="button" onClick={onRecortar} disabled={!!ocupado}
                className="btn-brand px-2 py-1 text-[10px] disabled:opacity-40">
                Sacar lo del recuadro
              </button>
            )}
          </div>
          {ocupado && <p className="text-[10px] text-accent">{ocupado}</p>}
          {modoRecorte && !ocupado && (
            <p className="text-[10px] text-accent">
              {hayRecorte
                ? "Ya tienes el recuadro. Dale a «Sacar lo del recuadro», o vuelve a dibujarlo."
                : "Arrastra sobre el lienzo para encerrar lo que quieras separar."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
