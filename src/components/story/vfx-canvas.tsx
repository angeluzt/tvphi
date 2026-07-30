"use client";

import { useRef, useState } from "react";
import { MousePointer2, Eraser } from "lucide-react";
import { vfxSpec, SHAPE_LABEL } from "@/lib/story/vfx";
import type { VfxLayer, VfxNode } from "@/lib/story/model";

// Capa para colocar un efecto DIBUJANDO sobre la previsualización.
//
// Es lo que hacía usable el motor cuando vivía en un HTML suelto: tocas tres
// ramas de un árbol y arden las tres, picas un punto y cae un chorro, arrastras
// y trazas un tubo de neón. Con barras de X e Y eso es imposible de acertar.
//
// Trabaja sobre el mismo rectángulo que la imagen, en coordenadas 0..1, así que
// vale igual en horizontal, en vertical y en el móvil.
export function VfxCanvas({
  layer,
  onChange,
}: {
  layer: VfxLayer;
  onChange: (nodes: VfxNode[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [borrando, setBorrando] = useState(false);
  // Lo que se está trazando ahora mismo, para verlo mientras se arrastra.
  const [trazo, setTrazo] = useState<VfxNode | null>(null);
  const libre = useRef<VfxNode[]>([]);
  const arrastrando = useRef(false);

  // Si los sitios que hay son los de serie, el primero que se pone a mano los
  // sustituye en vez de sumarse: tocar tres veces tiene que dar tres.
  const base = layer.auto ? [] : layer.nodes;
  const spec = vfxSpec(layer.kind);
  const forma = layer.shape;
  // "Desde arriba" no se coloca: ocupa todo el ancho por definición.
  if (forma === "arriba") return null;

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(-0.05, Math.min(1.05, (e.clientX - r.left) / r.width)),
      y: Math.max(-0.05, Math.min(1.05, (e.clientY - r.top) / r.height)),
    };
  };
  // Distancia de un punto a un nodo, para saber a cuál se le está dando.
  const cerca = (n: VfxNode, x: number, y: number) => {
    const dx = n.x2 - n.x, dy = n.y2 - n.y;
    const largo = dx * dx + dy * dy;
    const t = largo ? Math.max(0, Math.min(1, ((x - n.x) * dx + (y - n.y) * dy) / largo)) : 0;
    return Math.hypot(x - (n.x + dx * t), y - (n.y + dy * t));
  };

  function down(e: React.PointerEvent) {
    if (!ref.current) return;
    e.preventDefault(); e.stopPropagation();
    const { x, y } = pos(e);
    if (borrando) {
      // Se quita el sitio más cercano, si se ha dado razonablemente cerca.
      let mejor = -1, dist = 0.06;
      layer.nodes.forEach((n, i) => { const d = cerca(n, x, y); if (d < dist) { dist = d; mejor = i; } });
      if (mejor >= 0) onChange(layer.nodes.filter((_, i) => i !== mejor));
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    arrastrando.current = true;
    if (forma === "punto") {
      onChange([...base, { x, y, x2: x, y2: y }]);
      arrastrando.current = false;
      return;
    }
    libre.current = [];
    setTrazo({ x, y, x2: x, y2: y });
  }
  function move(e: React.PointerEvent) {
    if (!arrastrando.current || !trazo) return;
    const { x, y } = pos(e);
    if (forma === "libre") {
      // A mano alzada: se va guardando el trazo por trocitos, sin llenarlo de
      // segmentos de un pixel (que serían cientos de emisores por nada).
      if (Math.hypot(x - trazo.x2, y - trazo.y2) > 0.03) {
        libre.current.push({ x: trazo.x2, y: trazo.y2, x2: x, y2: y });
        setTrazo({ ...trazo, x2: x, y2: y });
        return;
      }
    }
    setTrazo({ ...trazo, x2: x, y2: y });
  }
  function up(e: React.PointerEvent) {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (!arrastrando.current) return;
    arrastrando.current = false;
    if (!trazo) return;
    if (forma === "libre") {
      const trozos = libre.current.length ? libre.current : [trazo];
      onChange([...base, ...trozos]);
    } else {
      // Una línea de dos píxeles no es una línea: se toma como punto.
      const corta = Math.hypot(trazo.x2 - trazo.x, trazo.y2 - trazo.y) < 0.02;
      onChange([...base, corta ? { ...trazo, x2: trazo.x, y2: trazo.y } : trazo]);
    }
    libre.current = [];
    setTrazo(null);
  }

  const dibujables: VfxNode[] = trazo ? [...base, trazo] : layer.nodes;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={`pointer-events-auto absolute inset-0 ${borrando ? "cursor-pointer" : "cursor-crosshair"}`}
        style={{ touchAction: "none" }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {dibujables.map((n, i) => {
            const punto = Math.hypot(n.x2 - n.x, n.y2 - n.y) < 0.02;
            return punto ? (
              <circle
                key={i} cx={n.x * 100} cy={n.y * 100} r={1.4}
                className="fill-accent stroke-black/60" strokeWidth={0.4} vectorEffect="non-scaling-stroke"
              />
            ) : (
              <line
                key={i} x1={n.x * 100} y1={n.y * 100} x2={n.x2 * 100} y2={n.y2 * 100}
                className="stroke-accent" strokeWidth={2.5} strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>

      {/* Barra de herramientas: flotante, para no comerse la imagen. */}
      <div className="pointer-events-auto absolute left-1 top-1 flex flex-wrap items-center gap-1 rounded-lg bg-black/70 p-1 text-[10px] backdrop-blur">
        <span className="px-1 text-accent">{spec.label} · {SHAPE_LABEL[forma]}</span>
        <button
          onClick={() => setBorrando(false)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${!borrando ? "bg-accent/25 text-accent" : "text-white/70 hover:bg-white/10"}`}
          title={forma === "punto" ? "Tocar para poner un sitio" : "Arrastrar para trazar"}
        >
          <MousePointer2 className="h-3 w-3" /> Poner
        </button>
        <button
          onClick={() => setBorrando(true)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${borrando ? "bg-danger/30 text-danger" : "text-white/70 hover:bg-white/10"}`}
          title="Tocar un sitio para quitarlo"
        >
          <Eraser className="h-3 w-3" /> Borrar
        </button>
        {layer.nodes.length > 0 && (
          <button
            onClick={() => onChange(layer.nodes.slice(0, -1))}
            className="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10"
          >
            Deshacer
          </button>
        )}
        <span className="px-1 text-white/50">{layer.nodes.length}</span>
      </div>
    </div>
  );
}
