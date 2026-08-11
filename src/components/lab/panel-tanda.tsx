"use client";

import { Layers, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Square, Sparkles } from "lucide-react";
import {
  MAX_PASOS_TANDA, RECETAS, pasoNuevo, type PasoTanda,
} from "@/lib/lab/tanda-sprites";
import type { AccionSprite, DireccionSprite, VistaSprite } from "@/lib/lab/biblioteca";

// Pedir de una vez TODAS las animaciones de un personaje.
//
// Un personaje que pesca, se levanta, se da la vuelta, se va caminando y se
// queda pensando son cinco animaciones. Hacerlas era cinco vueltas completas
// por el taller —prompt, generar, esperar, guardar, «nueva animación de este
// personaje», elegir de cuál hereda la cara— y en cada vuelta hay que acordarse
// del encadenado. El paso que se olvida es justo ese, y entonces salen cinco
// criaturas parecidas en vez de una.
//
// Aquí se escribe el personaje UNA vez y se listan las acciones. La cadena la
// pone la aplicación, porque es lo único que funciona.
//
// LO QUE NO HACE, y conviene decirlo: no es gratis. Cada acción es una imagen
// que se paga, así que el botón dice cuántas van a salir antes de arrancar.

const VISTAS: VistaSprite[] = ["lateral", "frontal", "trasera", "superior", "libre"];
const DIRECCIONES: DireccionSprite[] = ["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"];
const ACCIONES: AccionSprite[] = ["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"];

export interface EstadoTanda {
  /** En cuál va, empezando en 1. 0 = parada. */
  actual: number;
  total: number;
  hechas: string[];
  fallo?: string | null;
}

export function PanelTanda({
  abierto, onAbierto,
  personaje, onPersonaje,
  descripcion, onDescripcion,
  pasos, onPasos,
  estado, ocupado, puedeGenerar,
  onArrancar, onParar,
  personajeExistente,
  idea, onIdea, onPlanear, planeando, puedeIa,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  personaje: string;
  onPersonaje: (v: string) => void;
  descripcion: string;
  onDescripcion: (v: string) => void;
  pasos: PasoTanda[];
  onPasos: (p: PasoTanda[]) => void;
  estado: EstadoTanda | null;
  ocupado: boolean;
  puedeGenerar: boolean;
  onArrancar: () => void;
  onParar: () => void;
  /** Si hay un personaje elegido arriba, la tanda se le cuelga en vez de crear otro. */
  personajeExistente?: string | null;
  /** La idea entera en una frase, para que la reparta la IA. */
  idea: string;
  onIdea: (v: string) => void;
  onPlanear: () => void;
  planeando: boolean;
  puedeIa: boolean;
}) {
  const utiles = pasos.filter((p) => p.que.trim().length >= 3).length;
  const cambiar = (id: string, patch: Partial<PasoTanda>) =>
    onPasos(pasos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= pasos.length) return;
    const n = [...pasos];
    [n[i], n[j]] = [n[j], n[i]];
    onPasos(n);
  };

  return (
    <div className="rounded-xl border border-brand/40 bg-brand/5 p-2.5">
      <button
        onClick={() => onAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Layers className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium">Una tanda: varias acciones del mismo personaje</span>
          <span className="block text-[10px] text-muted">
            Pesca · se levanta · se da la vuelta · camina · se queda pensando. Todas con la misma cara.
          </span>
        </span>
        <span className="shrink-0 text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="mt-2 space-y-2">
          {/* UNA frase, y que la IA reparta. Es lo primero porque es el camino
              normal: escribir las cinco acciones a mano era el mismo trabajo
              manual que esto venía a quitar, solo que en vertical.

              Y el plan se ENSEÑA antes de generar, a propósito: planear es una
              llamada de texto —céntimos— y generar son N imágenes que se pagan.
              Encadenarlo directo convertiría una frase mal escrita en ocho
              imágenes tiradas. */}
          {puedeIa && (
            <div className="rounded-lg border border-accent/50 bg-accent/5 p-2">
              <label className="block text-[10px] text-muted">
                Dilo en una frase y que la IA reparta las animaciones
                <div className="mt-0.5 flex gap-1">
                  <input
                    className="input min-w-0 flex-1 py-1 text-[11px]"
                    placeholder="un pescador viejo que pesca, se levanta, se da la vuelta y se va caminando pensando"
                    value={idea}
                    onChange={(e) => onIdea(e.target.value.slice(0, 600))}
                    onKeyDown={(e) => { if (e.key === "Enter" && idea.trim().length >= 6) onPlanear(); }}
                    disabled={ocupado || planeando}
                    aria-label="La idea en una frase"
                  />
                  <button
                    type="button"
                    onClick={onPlanear}
                    disabled={ocupado || planeando || idea.trim().length < 6}
                    className="btn-brand shrink-0 px-3 py-1 text-[11px] disabled:opacity-40"
                  >
                    {planeando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Planear
                  </button>
                </div>
              </label>
              <p className="mt-1 text-[10px] text-muted">
                Rellena el personaje y la lista de abajo. No dibuja nada todavía: lo revisas, corriges
                lo que no encaje, y entonces generas.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] text-muted">
              Quién es · va delante de cada acción
              <input
                className="input mt-0.5 w-full py-1 text-[11px]"
                placeholder="pescador viejo con sombrero de paja, estilo anime"
                value={personaje}
                onChange={(e) => onPersonaje(e.target.value.slice(0, 200))}
                disabled={ocupado}
              />
            </label>
            <label className="text-[10px] text-muted">
              Descripción para la biblioteca (opcional)
              <input
                className="input mt-0.5 w-full py-1 text-[11px]"
                placeholder="si lo dejas vacío se usa lo de al lado"
                value={descripcion}
                onChange={(e) => onDescripcion(e.target.value.slice(0, 600))}
                disabled={ocupado}
              />
            </label>
          </div>

          {personajeExistente && (
            <p className="rounded border border-accent/40 bg-accent/5 px-2 py-1 text-[10px] text-accent">
              La tanda se colgará de «{personajeExistente}», el personaje que tienes elegido arriba.
              Para crear uno nuevo, quítalo de ahí primero.
            </p>
          )}

          {/* Las recetas son listas de ACCIONES, no escenas hechas: se copian al
              formulario y se editan. Lo que cuesta escribir no es el personaje
              —eso lo tienes claro— sino acordarse de que entre dos poses lejanas
              hace falta un paso de transición. */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted">Empezar desde:</span>
            {RECETAS.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={ocupado}
                onClick={() => onPasos(r.pasos.map((p, i) => ({ ...p, id: `r${Date.now()}${i}` })))}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
              >
                {r.nombre}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {pasos.map((p, i) => {
              const enCurso = estado?.actual === i + 1;
              const hecha = !!estado && estado.actual > i + 1;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-1.5 ${
                    enCurso ? "border-brand bg-brand/10"
                      : hecha ? "border-accent/40 bg-accent/5" : "border-border bg-surface-2/40"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="chip shrink-0 bg-surface text-[9px] text-muted">{i + 1}</span>
                    <input
                      className="input min-w-0 flex-1 py-0.5 text-[11px]"
                      placeholder="qué hace: «se levanta y recoge la caña»"
                      value={p.que}
                      onChange={(e) => cambiar(p.id, { que: e.target.value.slice(0, 200) })}
                      disabled={ocupado}
                    />
                    {enCurso && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />}
                    {hecha && <span className="shrink-0 text-[9px] text-accent">✓</span>}
                    <button type="button" onClick={() => mover(i, -1)} disabled={ocupado || i === 0}
                      className="shrink-0 text-muted hover:text-fg disabled:opacity-25" aria-label="Subir">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={ocupado || i === pasos.length - 1}
                      className="shrink-0 text-muted hover:text-fg disabled:opacity-25" aria-label="Bajar">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => onPasos(pasos.filter((x) => x.id !== p.id))}
                      disabled={ocupado || pasos.length === 1}
                      className="shrink-0 text-muted hover:text-danger disabled:opacity-25" aria-label="Quitar">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    <Elegir etiqueta="Vista" valor={p.vista} ops={VISTAS} disabled={ocupado}
                      onCambio={(v) => cambiar(p.id, { vista: v as VistaSprite })} />
                    <Elegir etiqueta="Mira a" valor={p.direccion} ops={DIRECCIONES} disabled={ocupado}
                      onCambio={(v) => cambiar(p.id, { direccion: v as DireccionSprite })} />
                    <Elegir etiqueta="Acción" valor={p.accion} ops={ACCIONES} disabled={ocupado}
                      onCambio={(v) => cambiar(p.id, { accion: v as AccionSprite })} />
                    <label className="text-[9px] text-muted">
                      Cuadros
                      <input
                        type="number" min={1} max={12} value={p.fotogramas} disabled={ocupado}
                        onChange={(e) => cambiar(p.id, {
                          fotogramas: Math.max(1, Math.min(12, Number(e.target.value) || 6)),
                        })}
                        className="input mt-0.5 w-full py-0.5 text-[9px]"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={ocupado || pasos.length >= MAX_PASOS_TANDA}
            onClick={() => onPasos([...pasos, pasoNuevo(`p${Date.now()}`)])}
            className="btn-ghost w-full py-1 text-[10px] disabled:opacity-40"
          >
            <Plus className="h-3 w-3 text-accent" /> Otra acción
            {pasos.length >= MAX_PASOS_TANDA && ` · tope de ${MAX_PASOS_TANDA}`}
          </button>

          {estado && (
            <p className="rounded border border-brand/40 bg-brand/10 px-2 py-1 text-[10px] text-brand">
              {estado.fallo
                ? `Se paró en la ${estado.actual} de ${estado.total}: ${estado.fallo}`
                : estado.actual > estado.total
                  ? `Listas las ${estado.total}. Están en la biblioteca, colgadas del mismo personaje.`
                  : `Generando la ${estado.actual} de ${estado.total}… no cierres esta pestaña.`}
              {!!estado.hechas.length && ` · ya guardadas: ${estado.hechas.join(", ")}`}
            </p>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onArrancar}
              disabled={ocupado || !puedeGenerar || utiles < 1 || personaje.trim().length < 3}
              className="btn-brand flex-1 py-1.5 text-[11px] disabled:opacity-40"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
              {/* Cuántas imágenes van a salir, ANTES de arrancar: cada una se
                  paga, y una tanda de ocho no es lo mismo que un sprite. */}
              {ocupado ? "Generando la tanda…" : `Generar ${utiles} ${utiles === 1 ? "animación" : "animaciones"}`}
            </button>
            {ocupado && (
              <button type="button" onClick={onParar}
                className="btn-ghost shrink-0 px-3 py-1.5 text-[11px]">
                <Square className="h-3.5 w-3.5" /> Parar
              </button>
            )}
          </div>
          <p className="text-[10px] leading-snug text-muted">
            Cada acción es una imagen que se paga. Van una detrás de otra y cada una hereda el último
            cuadro de la anterior, que es lo que mantiene la misma cara de principio a fin. Si una
            falla, las anteriores ya están guardadas y se puede seguir desde ahí.
          </p>
        </div>
      )}
    </div>
  );
}

function Elegir({ etiqueta, valor, ops, onCambio, disabled }: {
  etiqueta: string; valor: string; ops: readonly string[];
  onCambio: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="min-w-0 text-[9px] text-muted">
      {etiqueta}
      <select
        className="input mt-0.5 w-full py-0.5 text-[9px]"
        value={valor}
        disabled={disabled}
        onChange={(e) => onCambio(e.target.value)}
      >
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
