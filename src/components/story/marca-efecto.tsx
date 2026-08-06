"use client";

import type { VfxLayer, VfxNode } from "@/lib/story/model";
import { vfxSpec } from "@/lib/story/vfx";

// Dónde está el efecto que se está moviendo.
//
// Elegirlo en el mando lo dejaba marcado en la lista de fichas, pero encima de
// la imagen no pasaba nada: con cuatro efectos a la vez —fuego, polvo, humo,
// luz— no había forma de saber cuál se estaba moviendo hasta darle a una flecha
// y ver qué se había desplazado. Aquí se le pone un aro encima, con su nombre.
//
// No recoge el dedo (pointer-events: none): es solo para verlo. Colocar sitios
// a mano sigue siendo cosa de «Colocar sitios», que es lo que se activa cuando
// de verdad se quiere dibujar encima.
//
// Las coordenadas van en 0..1 sobre el cuadro, igual que las guías de colocar:
// para los efectos pegados a la imagen no es exacto cuando la cámara se ha
// movido, pero es la misma aproximación que ya usa el resto y sirve para lo que
// hace falta, que es saber CUÁL es.

export function MarcaEfecto({
  layer,
  soloEtiqueta = false,
}: {
  layer: VfxLayer;
  /** Cuando «Colocar sitios» ya está dibujando ESTA capa: solo el nombre, que
   *  es lo único que le falta a esas guías. Dos aros encima serían ruido. */
  soloEtiqueta?: boolean;
}) {
  if (!layer || layer.shape === "arriba") return null;
  const nodes = layer.nodes ?? [];
  if (!nodes.length) return null;
  const spec = vfxSpec(layer.kind);

  // El cartel va sobre el nodo más alto, para no tapar el centro del efecto.
  const arriba = nodes.reduce((a, n) => (Math.min(n.y, n.y2) < Math.min(a.y, a.y2) ? n : a), nodes[0]);
  const cx = ((arriba.x + arriba.x2) / 2) * 100;
  const cy = Math.min(arriba.y, arriba.y2) * 100;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {!soloEtiqueta && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {nodes.map((n, i) => <Aro key={i} n={n} />)}
        </svg>
      )}
      {/* El nombre va en HTML y no dentro del SVG: con preserveAspectRatio
          "none" el texto saldría estirado, porque el cuadro no es cuadrado. */}
      <span
        className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-accent"
        style={{ left: `${cx}%`, top: `calc(${cy}% - 6px)` }}
      >
        {spec?.label ?? layer.kind}
      </span>
    </div>
  );
}

function Aro({ n }: { n: VfxNode }) {
  const punto = Math.hypot(n.x2 - n.x, n.y2 - n.y) < 0.02;
  // Doble trazo, oscuro debajo: sobre una imagen clara un aro fino se pierde.
  const trazos = (
    <>
      <circle cx={n.x * 100} cy={n.y * 100} r={3.4} fill="none"
        className="stroke-black/70" strokeWidth={4} vectorEffect="non-scaling-stroke" />
      <circle cx={n.x * 100} cy={n.y * 100} r={3.4} fill="none"
        className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke">
        {/* Late despacio: llama la vista sin marear. */}
        <animate attributeName="r" values="3.4;4.4;3.4" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </>
  );
  if (punto) return <g>{trazos}</g>;
  return (
    <g>
      <line x1={n.x * 100} y1={n.y * 100} x2={n.x2 * 100} y2={n.y2 * 100}
        className="stroke-black/70" strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={n.x * 100} y1={n.y * 100} x2={n.x2 * 100} y2={n.y2 * 100}
        className="stroke-accent" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {trazos}
      <circle cx={n.x2 * 100} cy={n.y2 * 100} r={2.2} fill="none"
        className="stroke-black/70" strokeWidth={4} vectorEffect="non-scaling-stroke" />
      <circle cx={n.x2 * 100} cy={n.y2 * 100} r={2.2} fill="none"
        className="stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  );
}
