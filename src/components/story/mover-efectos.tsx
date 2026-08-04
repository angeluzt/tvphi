"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, ChevronLeft, ChevronRight, Check, Layers, Minus, Plus, X } from "lucide-react";
import type { VfxLayer, VfxNode } from "@/lib/story/model";
import { vfxSpec } from "@/lib/story/vfx";

// Mover efectos con precisión, sin arrastrar con el dedo.
//
// Colocar a mano encima del vídeo va bien para poner algo aproximado, pero no
// para afinar: un píxel de dedo son varios de imagen, y con dos efectos que
// deben ir juntos —un fuego y su humo— se acaba peleando. Aquí se elige uno o
// varios y se mueven con barras, con − y +, o con las flechas del teclado.
//
// Las barras dicen dónde está el CENTRO de lo seleccionado. Con un solo efecto
// eso es su sitio; con varios, moverlas desplaza el grupo entero manteniendo
// las distancias, que es justo lo que se quiere al mover un conjunto.

const PASO = 0.005;      // lo que mueve una flecha (medio por ciento)
const PASO_GRANDE = 0.05; // con Shift

function centro(nodes: VfxNode[]) {
  if (!nodes.length) return { x: 0.5, y: 0.5 };
  let sx = 0, sy = 0, n = 0;
  for (const p of nodes) { sx += p.x + p.x2; sy += p.y + p.y2; n += 2; }
  return { x: sx / n, y: sy / n };
}

function desplazar(nodes: VfxNode[], dx: number, dy: number): VfxNode[] {
  return nodes.map((p) => ({
    x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)),
    x2: Math.max(0, Math.min(1, p.x2 + dx)), y2: Math.max(0, Math.min(1, p.y2 + dy)),
  }));
}

export function MoverEfectos({
  capas,
  onMover,
  onResaltar,
}: {
  /** Los efectos que se ven en esta toma: los de la escena y los suyos. */
  capas: { capa: VfxLayer; deEscena: boolean }[];
  /** Desplazamiento relativo, ya acotado a 0..1 por el componente. */
  onMover: (ids: string[], dx: number, dy: number) => void;
  /** Cuál está seleccionado, por si conviene enseñarlo en otra parte. */
  onResaltar?: (id: string | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const caja = useRef<HTMLDivElement>(null);

  const usables = capas.filter((c) => c.capa.shape !== "arriba");
  const elegidas = usables.filter((c) => sel.includes(c.capa.id));
  // Con nada elegido se trabaja sobre el primero: abrir el menú y que no haga
  // nada hasta elegir es una fricción tonta.
  const activas = elegidas.length ? elegidas : usables.slice(0, 1);
  const ids = activas.map((c) => c.capa.id);
  const c = centro(activas.flatMap((x) => x.capa.nodes ?? []));

  const mover = (dx: number, dy: number) => { if (ids.length) onMover(ids, dx, dy); };
  const ponerX = (v: number) => mover(v - c.x, 0);
  const ponerY = (v: number) => mover(0, v - c.y);

  const indice = usables.findIndex((x) => x.capa.id === ids[0]);
  const saltar = (d: -1 | 1) => {
    if (!usables.length) return;
    const i = (indice + d + usables.length) % usables.length;
    setSel([usables[i].capa.id]);
    onResaltar?.(usables[i].capa.id);
  };

  // Las flechas del teclado, mientras el menú está abierto y el foco dentro.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      // Basta con que el mando esté abierto. Antes se exigía que el foco
      // estuviera dentro del panel, y eso lo dejaba muerto en cuanto se tocaba
      // cualquier otra cosa —guardar, por ejemplo—: parecía que las flechas
      // habían dejado de funcionar. Lo único que hay que respetar es que
      // alguien esté escribiendo.
      const donde = document.activeElement as HTMLElement | null;
      const escribiendo = !!donde && (
        donde.tagName === "INPUT" && (donde as HTMLInputElement).type !== "range"
        || donde.tagName === "TEXTAREA"
        || donde.tagName === "SELECT"
        || donde.isContentEditable
      );
      if (escribiendo) return;
      const paso = e.shiftKey ? PASO_GRANDE : PASO;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
      };
      const m = d[e.key];
      if (!m) return;
      e.preventDefault();  // si no, la barra del reproductor se mueve también
      mover(m[0], m[1]);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, ids.join(","), c.x, c.y]);

  const nombre = (v: VfxLayer) => vfxSpec(v.kind)?.label ?? v.kind;
  const btn = "grid h-6 w-6 shrink-0 place-items-center rounded border border-border text-muted hover:bg-surface-2 disabled:opacity-40";

  if (!capas.length) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setAbierto((v) => !v)}
        className={`btn-ghost w-full justify-center py-1 text-[11px] ${abierto ? "border-accent/60 text-accent" : ""}`}
        aria-expanded={abierto}
      >
        <Gamepad2 className="h-3.5 w-3.5" />
        {abierto ? "Cerrar el mando" : "Mover efectos"}
      </button>

      {abierto && (
        <div ref={caja} tabIndex={-1} className="mt-2 space-y-2 rounded-lg border border-accent/50 bg-surface-2/40 p-2">
          {!usables.length ? (
            <p className="text-[11px] text-muted">
              Los efectos de esta toma son de pantalla completa (lluvia, nieve, niebla «arriba»):
              no tienen un sitio que mover.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => saltar(-1)} className="btn-ghost px-2 py-1 text-[11px]" title="Anterior">
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </button>
                <button onClick={() => saltar(1)} className="btn-ghost px-2 py-1 text-[11px]" title="Siguiente">
                  Siguiente <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { const id = usables[Math.max(0, indice)].capa.id;
                    setSel([id]); onResaltar?.(id); }}
                  className="btn-ghost px-2 py-1 text-[11px]"
                >
                  <Check className="h-3.5 w-3.5 text-accent" /> Solo este
                </button>
                <button
                  onClick={() => { setSel(usables.map((x) => x.capa.id)); onResaltar?.(null); }}
                  className="btn-ghost px-2 py-1 text-[11px]"
                >
                  <Layers className="h-3.5 w-3.5 text-accent" /> Todos
                </button>
                {!!sel.length && (
                  <button onClick={() => { setSel([]); onResaltar?.(null); }} className="text-muted hover:text-fg" aria-label="Quitar la selección">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-muted">
                {activas.length === 1
                  ? <>Moviendo <span className="text-fg">{nombre(activas[0].capa)}</span>
                      {activas[0].deEscena && <span className="text-muted"> · de la escena, cambia en todas sus tomas</span>}</>
                  : <>Moviendo <span className="text-fg">{activas.length} efectos</span> a la vez, sin cambiar la distancia entre ellos</>}
              </p>

              <Barra etiqueta="Horizontal" valor={c.x} onValor={ponerX} onPaso={(d) => mover(d, 0)} />
              <Barra etiqueta="Vertical" valor={c.y} onValor={ponerY} onPaso={(d) => mover(0, d)} />

              <p className="text-[10px] text-muted">
                Con el mando abierto, las <b className="text-fg">flechas del teclado</b> también lo
                mueven. Con <b className="text-fg">Mayús</b>, a saltos grandes.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Fuera del componente A PROPÓSITO. Definida dentro, React la ve como un tipo
// distinto en cada render, desmonta el <input> y lo vuelve a montar: el foco se
// pierde y las flechas del teclado solo funcionaban una vez.
function Barra({ etiqueta, valor, onValor, onPaso }: {
  etiqueta: string; valor: number;
  onValor: (v: number) => void; onPaso: (d: number) => void;
}) {
  const btn = "grid h-6 w-6 shrink-0 place-items-center rounded border border-border text-muted hover:bg-surface-2 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] text-muted">{etiqueta}</span>
      <button onClick={() => onPaso(-PASO)} className={btn} aria-label={`${etiqueta} menos`}>
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="range" min={0} max={1} step={PASO} value={valor}
        onChange={(e) => onValor(Number(e.target.value))}
        className="min-w-0 flex-1" aria-label={etiqueta}
      />
      <button onClick={() => onPaso(PASO)} className={btn} aria-label={`${etiqueta} más`}>
        <Plus className="h-3 w-3" />
      </button>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {Math.round(valor * 100)}%
      </span>
    </div>
  );
}

export { desplazar };
