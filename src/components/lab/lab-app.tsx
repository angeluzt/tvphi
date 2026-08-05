"use client";

import { useState } from "react";
import { Map, Layers3, FlaskConical } from "lucide-react";
import { MapaEditor } from "./mapa-editor";
import { Compositor } from "./compositor";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import type { Escena } from "@/lib/lab/escena";

export function LabApp() {
  const [pestana, setPestana] = useState<"mapa" | "compositor">("mapa");
  const [semilla, setSemilla] = useState<{ nombre: string; url: string }[] | undefined>();

  // Pasar el mapa al compositor sin salir de la página: cada capa se pinta en
  // su propio PNG transparente y se le da al compositor como si fueran las
  // imágenes generadas. Sirve para ver cómo se moverá la escena ANTES de gastar
  // nada en generarla, que es la mitad de la gracia de tener el mapa.
  function probar(esc: Escena) {
    const urls = esc.layers
      .filter((c) => c.visible !== false)
      .map((c) => ({ nombre: c.name, url: lienzoDeCapas(esc, [c.id], true, false).toDataURL("image/png") }));
    setSemilla(urls);
    setPestana("compositor");
  }

  return (
    <div className="space-y-4">
      <div className="card border-gold/50 bg-gold/5 p-4">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Escenas por capas con paralaje</h1>
            <p className="mt-1 text-sm text-muted">
              En pruebas. No está enganchado al editor de historias todavía y solo lo ves tú.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              La idea: describir la escena como un mapa de formas con su significado —esto es un
              muro, esto una columna, aquí va el personaje, aquí no pintes nada porque va un efecto—,
              pedirle a la IA <b className="text-fg">cada capa por separado</b> con fondo
              transparente, y montarlas con profundidad. Al mover la cámara, el fondo y el primer
              plano no van a la misma velocidad, y una imagen plana pasa a tener hondura.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5" role="tablist">
        {([
          { id: "mapa", label: "1 · Mapa de la escena", Icono: Map },
          { id: "compositor", label: "2 · Montaje y paralaje", Icono: Layers3 },
        ] as const).map(({ id, label, Icono }) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
              pestana === id ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            <Icono className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {pestana === "mapa"
        ? <MapaEditor onEnviarAlCompositor={probar} />
        : <Compositor semilla={semilla} />}
    </div>
  );
}
