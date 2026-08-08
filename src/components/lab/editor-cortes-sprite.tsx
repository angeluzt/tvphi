"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Crop, Loader2, RotateCcw } from "lucide-react";
import {
  celdasSpritePorDefecto, normalizarCeldasSprite, tamanoComunCeldasSprite, type CeldaSprite,
} from "@/lib/lab/sprites";
import { RangoPreciso } from "./rango-preciso";

// Editor de la hoja ORIGINAL. Aquí todavía existen los píxeles que quedaron al
// otro lado de una división; después del corte ya no hay forma de recuperarlos.

type Gesto = {
  tipo: "mover" | "tamano";
  puntero: number;
  indice: number;
  clienteX: number;
  clienteY: number;
  celda: CeldaSprite;
};

function Control({ etiqueta, valor, min, max, disabled, onChange }: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="w-12 shrink-0">{etiqueta}</span>
      <RangoPreciso valor={valor} min={min} max={Math.max(min, max)} paso={1}
        disabled={disabled} onCambio={onChange} etiqueta={etiqueta} />
      <span className="w-10 text-right tabular-nums">{valor}</span>
    </label>
  );
}

export function EditorCortesSprite({
  hojaUrl,
  anchoHoja,
  altoHoja,
  forma,
  celdas,
  procesando,
  bloqueado = false,
  onAplicar,
  onPendiente,
}: {
  hojaUrl: string;
  anchoHoja: number;
  altoHoja: number;
  forma: "tira" | "columna";
  celdas: CeldaSprite[];
  procesando: boolean;
  bloqueado?: boolean;
  onAplicar: (celdas: CeldaSprite[]) => Promise<void> | void;
  onPendiente?: (pendiente: boolean) => void;
}) {
  const [locales, setLocales] = useState<CeldaSprite[]>(celdas);
  const [elegida, setElegida] = useState(0);
  const [sucio, setSucio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  const localesRef = useRef(locales);
  const pendienteRef = useRef(onPendiente);
  pendienteRef.current = onPendiente;

  useEffect(() => {
    setLocales(celdas);
    localesRef.current = celdas;
    setElegida((i) => Math.min(i, Math.max(0, celdas.length - 1)));
    setSucio(false);
    pendienteRef.current?.(false);
  }, [celdas]);

  function poner(nuevas: CeldaSprite[]) {
    const limpias = normalizarCeldasSprite(nuevas, anchoHoja, altoHoja);
    localesRef.current = limpias;
    setLocales(limpias);
    setSucio(true);
    pendienteRef.current?.(true);
  }

  function cambiar(indice: number, patch: Partial<CeldaSprite>) {
    poner(localesRef.current.map((c, i) => i === indice ? { ...c, ...patch } : c));
  }

  function cambiarTamanoComun(ancho: number, alto: number) {
    poner(tamanoComunCeldasSprite(
      localesRef.current,
      anchoHoja,
      altoHoja,
      ancho,
      alto,
    ));
  }

  function empezar(e: React.PointerEvent<HTMLElement>, indice: number, tipo: Gesto["tipo"]) {
    if (procesando || bloqueado) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setElegida(indice);
    gestoRef.current = {
      tipo,
      puntero: e.pointerId,
      indice,
      clienteX: e.clientX,
      clienteY: e.clientY,
      celda: { ...localesRef.current[indice] },
    };
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestoRef.current;
    const im = imagenRef.current;
    if (!g || g.puntero !== e.pointerId || !im || bloqueado) return;
    e.preventDefault();
    const r = im.getBoundingClientRect();
    const dx = Math.round((e.clientX - g.clienteX) * anchoHoja / Math.max(1, r.width));
    const dy = Math.round((e.clientY - g.clienteY) * altoHoja / Math.max(1, r.height));
    if (g.tipo === "mover") {
      cambiar(g.indice, { x: g.celda.x + dx, y: g.celda.y + dy });
    } else {
      cambiarTamanoComun(
        Math.max(Math.min(16, anchoHoja), g.celda.ancho + dx),
        Math.max(Math.min(16, altoHoja), g.celda.alto + dy),
      );
    }
  }

  function terminar(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestoRef.current;
    if (!g || g.puntero !== e.pointerId) return;
    gestoRef.current = null;
  }

  async function aplicar() {
    if (!sucio || procesando || bloqueado) return;
    setError(null);
    try {
      await onAplicar(localesRef.current);
      setSucio(false);
      pendienteRef.current?.(false);
    } catch (e) {
      setError((e as Error).message || "No se pudieron aplicar los cortes.");
    }
  }

  const actual = locales[elegida];
  const iniciales = celdasSpritePorDefecto(anchoHoja, altoHoja, locales.length, forma);

  return (
    <div className="space-y-3 rounded-xl border border-gold/35 bg-gold/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <span className="block text-xs font-semibold text-fg">2 · Ajustar las casillas de corte</span>
          <span className="block text-[10px] leading-snug text-muted">
            La app ya colocó la rejilla. Mueve cada celda para recuperar patas; el tamaño siempre cambia en todas.
          </span>
        </span>
        <span className="text-[10px] text-muted">{anchoHoja}×{altoHoja} · {locales.length} celdas</span>
      </div>

      <div
        className="relative mx-auto w-full max-w-4xl touch-none overflow-hidden rounded-lg border border-border bg-black"
        style={{ aspectRatio: `${anchoHoja}/${altoHoja}` }}
        onPointerMove={alMover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imagenRef} src={hojaUrl} alt="Hoja original del sprite"
          className="absolute inset-0 h-full w-full select-none" draggable={false} />
        {locales.map((c, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => empezar(e, i, "mover")}
            className={`absolute touch-none border-2 ${i === elegida
              ? "z-10 border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(0,0,0,.8)]"
              : "border-white/55 bg-transparent hover:border-white"}`}
            style={{
              left: `${c.x / anchoHoja * 100}%`,
              top: `${c.y / altoHoja * 100}%`,
              width: `${c.ancho / anchoHoja * 100}%`,
              height: `${c.alto / altoHoja * 100}%`,
            }}
            aria-label={`Mover celda ${i + 1}`}
          >
            <span className="absolute left-0 top-0 rounded-br bg-black/75 px-1 text-[9px] font-semibold text-white">{i + 1}</span>
            {i === elegida && (
              <span
                onPointerDown={(e) => empezar(e, i, "tamano")}
                className="absolute -bottom-px -right-px h-5 w-5 cursor-se-resize rounded-tl border-l border-t border-black/70 bg-accent"
                aria-label="Cambiar el tamaño común de todas las celdas"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {locales.map((_, i) => (
          <button key={i} type="button" onClick={() => setElegida(i)}
            className={`h-7 min-w-7 rounded border px-1 text-[10px] ${i === elegida
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-muted hover:text-fg"}`}>
            {i + 1}
          </button>
        ))}
      </div>

      {actual && (
        <div className="grid gap-3 rounded-lg border border-border bg-surface/45 p-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="space-y-1">
            <Control etiqueta="X" valor={actual.x} min={0} max={anchoHoja - actual.ancho}
              disabled={bloqueado || procesando}
              onChange={(x) => cambiar(elegida, { x })} />
            <Control etiqueta="Y" valor={actual.y} min={0} max={altoHoja - actual.alto}
              disabled={bloqueado || procesando}
              onChange={(y) => cambiar(elegida, { y })} />
            <Control etiqueta="Ancho" valor={actual.ancho} min={Math.min(16, anchoHoja)} max={anchoHoja}
              disabled={bloqueado || procesando}
              onChange={(ancho) => cambiarTamanoComun(ancho, actual.alto)} />
            <Control etiqueta="Alto" valor={actual.alto} min={Math.min(16, altoHoja)} max={altoHoja}
              disabled={bloqueado || procesando}
              onChange={(alto) => cambiarTamanoComun(actual.ancho, alto)} />
            <p className="pl-[3.4rem] text-[9px] text-muted">Tamaño común para todos los cuadros.</p>
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-1" aria-label="Mover celda un píxel">
              <span />
              <button type="button" onClick={() => cambiar(elegida, { y: actual.y - 1 })} disabled={bloqueado || procesando} className="btn-ghost p-1" aria-label="Subir celda"><ArrowUp className="h-3.5 w-3.5" /></button>
              <span />
              <button type="button" onClick={() => cambiar(elegida, { x: actual.x - 1 })} disabled={bloqueado || procesando} className="btn-ghost p-1" aria-label="Mover celda a la izquierda"><ArrowLeft className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => cambiar(elegida, { y: actual.y + 1 })} disabled={bloqueado || procesando} className="btn-ghost p-1" aria-label="Bajar celda"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => cambiar(elegida, { x: actual.x + 1 })} disabled={bloqueado || procesando} className="btn-ghost p-1" aria-label="Mover celda a la derecha"><ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
            <button type="button" onClick={() => cambiar(elegida, {
              x: iniciales[elegida].x,
              y: iniciales[elegida].y,
            })}
              disabled={bloqueado || procesando}
              className="btn-ghost w-full px-1.5 py-1 text-[10px]">
              <RotateCcw className="h-3 w-3" /> Restaurar posición
            </button>
            <button type="button" onClick={() => poner(iniciales)} disabled={bloqueado || procesando}
              className="btn-ghost w-full px-1.5 py-1 text-[10px]">
              <Crop className="h-3 w-3" /> Rejilla original
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-danger">{error}</p>}
      {bloqueado && <p className="text-[10px] text-gold">Aplica o restaura primero los cambios pendientes de la hoja.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[9px] leading-snug text-muted">
          Aplicar vuelve a cortar desde la hoja completa. Después podrás centrar y borrar manchas en el editor fino.
        </p>
        <button type="button" onClick={() => void aplicar()} disabled={!sucio || procesando || bloqueado}
          className="btn-brand text-xs disabled:opacity-40">
          {procesando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {procesando ? "Aplicando…" : sucio ? "Aplicar estos cortes" : "Cortes aplicados"}
        </button>
      </div>
    </div>
  );
}
