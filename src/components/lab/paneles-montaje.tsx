"use client";

import type { ReactNode } from "react";
import { MousePointer2, Video } from "lucide-react";

// Los mandos del montaje, de uno en uno.
//
// EL PROBLEMA. Todo estaba apilado en una sola columna: la vista previa arriba
// y debajo, seguidos, el inspector del elemento, su movimiento, su ruta, las
// herramientas de imagen, la palanca de cámara, el idle y la cola encadenada.
// Para tocar la cola había que bajar media pantalla, y al hacerlo la vista
// previa quedaba fuera del campo de visión: se editaba a ciegas y luego había
// que subir a comprobar. En el móvil eran varias pantallas de scroll.
//
// LA IDEA. La vista y el transporte NO se mueven nunca; lo demás son tres
// grupos que ocupan el mismo sitio y se turnan. Cada uno cabe sin bajar, así
// que se toca un mando y se ve el efecto en el mismo golpe de vista.
//
// La división no es por tipo de control, es por LO QUE ESTÁS HACIENDO: animar
// una cosa concreta, o mover la cámara. La lista de capas se queda fuera de las
// pestañas porque hace de índice —eliges ahí lo que vas a tocar aquí—.

export type PanelMontaje = "elemento" | "camara";

const PANELES: { id: PanelMontaje; label: string; corto: string; Icono: typeof Video }[] = [
  { id: "elemento", label: "El elemento seleccionado", corto: "Elemento", Icono: MousePointer2 },
  { id: "camara", label: "Cámara y animación", corto: "Cámara", Icono: Video },
];

export function PestanasMontaje({ activo, onCambiar, contador }: {
  activo: PanelMontaje;
  onCambiar: (p: PanelMontaje) => void;
  /** Nombre de lo seleccionado, para saber qué se está tocando sin mirar. */
  contador?: string | null;
}) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Mandos del montaje">
      {PANELES.map(({ id, label, corto, Icono }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activo === id}
          onClick={() => onCambiar(id)}
          title={label}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${
            activo === id
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-muted hover:bg-surface-2"
          }`}
        >
          <Icono className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{corto}</span>
          {id === "elemento" && contador && (
            <span className="hidden max-w-[7rem] shrink truncate rounded bg-surface-2 px-1 text-[9px] text-muted sm:inline">
              {contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Un grupo de mandos.
 *
 * Se ESCONDE en vez de desmontarse: dentro hay campos con foco, deslizadores a
 * medio arrastrar y estado local. Desmontarlos al cambiar de pestaña perdería
 * todo eso, que es exactamente el tipo de detalle que hace que una interfaz se
 * sienta rota aunque funcione.
 */
export function PanelMontajeCaja({ activo, children }: { activo: boolean; children: ReactNode }) {
  return <div className={activo ? "space-y-2" : "hidden"}>{children}</div>;
}
