"use client";

import { useRef, useState } from "react";
import { MousePointer2, Eraser, Undo2, Crosshair } from "lucide-react";
import { vfxSpec, SHAPE_LABEL } from "@/lib/story/vfx";
import type { VfxLayer, VfxNode } from "@/lib/story/model";

// Colocar un efecto DIBUJANDO sobre la previsualización.
//
// Es lo que hacía usable el motor cuando vivía en un HTML suelto: tocas tres
// ramas de un árbol y arden las tres, picas un punto y cae un chorro, arrastras
// y trazas un tubo de neón. Con barras de X e Y eso es imposible de acertar.
//
// Va en dos piezas a propósito: los botones (VfxTools) van FUERA del cuadro,
// encima, porque puestos encima de la imagen tapaban justo la zona donde hace
// falta poner puntos; y la capa que recoge el dedo (VfxCanvas) va dentro. Las
// dos se montan igual en el reproductor de arriba y en el de cada toma, para no
// tener que subir a lo alto de la página cada vez.

const CERCA = 0.045; // a qué distancia se considera que le has dado a un sitio

// Distancia de un punto a un sitio (que puede ser una línea).
function distancia(n: VfxNode, x: number, y: number) {
  const dx = n.x2 - n.x, dy = n.y2 - n.y;
  const largo = dx * dx + dy * dy;
  const t = largo ? Math.max(0, Math.min(1, ((x - n.x) * dx + (y - n.y) * dy) / largo)) : 0;
  return Math.hypot(x - (n.x + dx * t), y - (n.y + dy * t));
}

export function VfxTools({
  layer,
  activo,
  borrando,
  onToggle,
  onBorrando,
  onChange,
}: {
  layer: VfxLayer;
  activo: boolean;
  borrando: boolean;
  onToggle: (v: boolean) => void;
  onBorrando: (v: boolean) => void;
  onChange: (nodes: VfxNode[]) => void;
}) {
  const spec = vfxSpec(layer.kind);
  if (layer.shape === "arriba") return null;
  const btn = "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]";
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-2/70 px-1.5 py-1">
      <button
        onClick={() => onToggle(!activo)}
        className={`${btn} ${activo ? "bg-accent/25 text-accent" : "text-muted hover:bg-surface-2"}`}
        title={activo ? "Volver a ver solo la animación" : "Ver y mover los sitios del efecto"}
      >
        <Crosshair className="h-3 w-3" /> {activo ? "Colocando" : "Colocar sitios"}
      </button>
      <span className="truncate text-[11px] text-muted">
        {spec.label} · {SHAPE_LABEL[layer.shape]}
      </span>
      {activo && (
        <>
          <span className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onBorrando(false)}
              className={`${btn} ${!borrando ? "bg-accent/25 text-accent" : "text-muted hover:bg-surface-2"}`}
              title={layer.shape === "punto"
                ? "Tocar para poner uno; tocar uno que ya esté y arrastrar para moverlo"
                : "Arrastrar para trazar una línea; arrastrar una que ya esté para moverla"}
            >
              <MousePointer2 className="h-3 w-3" /> Poner
            </button>
            <button
              onClick={() => onBorrando(true)}
              className={`${btn} ${borrando ? "bg-danger/25 text-danger" : "text-muted hover:bg-surface-2"}`}
              title="Tocar un sitio para quitarlo"
            >
              <Eraser className="h-3 w-3" /> Borrar
            </button>
            <button
              onClick={() => onChange(layer.nodes.slice(0, -1))}
              disabled={!layer.nodes.length}
              className={`${btn} text-muted hover:bg-surface-2 disabled:opacity-40`}
              title="Quitar el último"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <span className="w-5 text-right text-[11px] tabular-nums text-muted">{layer.nodes.length}</span>
          </span>
        </>
      )}
    </div>
  );
}

function GuiaSitio({ n }: { n: VfxNode }) {
  const punto = Math.hypot(n.x2 - n.x, n.y2 - n.y) < 0.02;
  if (punto) {
    return (
      <g>
        <circle cx={n.x * 100} cy={n.y * 100} r={2.6} fill="none"
          className="stroke-black/70" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        <circle cx={n.x * 100} cy={n.y * 100} r={2.6} fill="none"
          className="stroke-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={n.x * 100} cy={n.y * 100} r={0.9} className="fill-accent" />
      </g>
    );
  }
  // Línea guía del sitio. Solo visible mientras "Colocando" está activo.
  return (
    <g>
      <line x1={n.x * 100} y1={n.y * 100} x2={n.x2 * 100} y2={n.y2 * 100}
        className="stroke-black/70" strokeWidth={5} strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
      <line x1={n.x * 100} y1={n.y * 100} x2={n.x2 * 100} y2={n.y2 * 100}
        className="stroke-accent" strokeWidth={2.5} strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
      <circle cx={n.x * 100} cy={n.y * 100} r={1.6} fill="none"
        className="stroke-black/70" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      <circle cx={n.x * 100} cy={n.y * 100} r={1.6} fill="none"
        className="stroke-accent" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      <circle cx={n.x2 * 100} cy={n.y2 * 100} r={1.6} fill="none"
        className="stroke-black/70" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      <circle cx={n.x2 * 100} cy={n.y2 * 100} r={1.6} fill="none"
        className="stroke-accent" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

export function VfxCanvas({
  layer,
  borrando,
  onChange,
}: {
  layer: VfxLayer;
  borrando: boolean;
  onChange: (nodes: VfxNode[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [trazo, setTrazo] = useState<VfxNode | null>(null);
  const modo = useRef<"nada" | "crear" | "mover">("nada");
  const mover = useRef<{ i: number; ox: number; oy: number; n: VfxNode } | null>(null);

  // Si los sitios que hay son los de serie, el primero que se pone a mano los
  // sustituye en vez de sumarse: tocar tres veces tiene que dar tres.
  const base = layer.auto ? [] : layer.nodes;
  const forma = layer.shape;
  if (forma === "arriba") return null;

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(-0.05, Math.min(1.05, (e.clientX - r.left) / r.width)),
      y: Math.max(-0.05, Math.min(1.05, (e.clientY - r.top) / r.height)),
    };
  };
  const indiceCerca = (x: number, y: number) => {
    let mejor = -1, d = CERCA;
    layer.nodes.forEach((n, i) => { const q = distancia(n, x, y); if (q < d) { d = q; mejor = i; } });
    return mejor;
  };

  function down(e: React.PointerEvent) {
    if (!ref.current) return;
    e.preventDefault(); e.stopPropagation();
    const { x, y } = pos(e);
    if (borrando) {
      const i = indiceCerca(x, y);
      if (i >= 0) onChange(layer.nodes.filter((_, k) => k !== i));
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // Si se ha dado sobre un sitio que ya existe, se mueve en vez de crear otro:
    // así se puede afinar la puntería sin borrar y volver a poner.
    const i = layer.auto ? -1 : indiceCerca(x, y);
    if (i >= 0) {
      modo.current = "mover";
      mover.current = { i, ox: x, oy: y, n: { ...layer.nodes[i] } };
      return;
    }
    modo.current = "crear";
    if (forma === "punto") {
      onChange([...base, { x, y, x2: x, y2: y }]);
      modo.current = "nada";
      return;
    }
    // Línea y mano alzada: un solo trazo A→B (no trocitos = muchos emisores).
    setTrazo({ x, y, x2: x, y2: y });
  }

  function move(e: React.PointerEvent) {
    const { x, y } = pos(e);
    if (modo.current === "mover" && mover.current) {
      // Se arrastra el sitio entero, manteniendo el largo y el ángulo si es línea.
      const { i, ox, oy, n } = mover.current;
      const dx = x - ox, dy = y - oy;
      const movido = { x: n.x + dx, y: n.y + dy, x2: n.x2 + dx, y2: n.y2 + dy };
      onChange(layer.nodes.map((q, k) => (k === i ? movido : q)));
      return;
    }
    if (modo.current !== "crear" || !trazo) return;
    setTrazo({ ...trazo, x2: x, y2: y });
  }

  function up(e: React.PointerEvent) {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (modo.current === "mover") { modo.current = "nada"; mover.current = null; return; }
    if (modo.current !== "crear") return;
    modo.current = "nada";
    if (!trazo) return;
    // Una línea de dos píxeles no es una línea: se toma como punto.
    const corta = Math.hypot(trazo.x2 - trazo.x, trazo.y2 - trazo.y) < 0.02;
    onChange([...base, corta ? { ...trazo, x2: trazo.x, y2: trazo.y } : trazo]);
    setTrazo(null);
  }

  // Guías solo mientras este canvas está montado (= "Colocando" activo).
  // Al desactivar "Colocando" desaparecen y queda solo la animación.
  const sitios = trazo ? [...(layer.auto ? [] : layer.nodes), trazo] : layer.nodes;

  return (
    <div
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label="Colocar sitios del efecto"
      className={`absolute inset-0 z-30 ${borrando ? "cursor-pointer" : "cursor-crosshair"}`}
      style={{ touchAction: "none" }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        {sitios.map((n, i) => (
          <GuiaSitio key={trazo && i === sitios.length - 1 ? "trazo" : i} n={n} />
        ))}
      </svg>
    </div>
  );
}
