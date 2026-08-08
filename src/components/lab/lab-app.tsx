"use client";

import { useState } from "react";
import { Map, Layers3, FlaskConical, Clapperboard, Bird } from "lucide-react";
import { MapaEditor } from "./mapa-editor";
import { Compositor, type Semilla } from "./compositor";
import { revisar } from "@/lib/lab/escena";
import { GenerarIa } from "./generar-ia";
import { GenerarSprite } from "./generar-sprite";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import type { Escena } from "@/lib/lab/escena";

export function LabApp({ hayIa }: { hayIa: boolean }) {
  const [pestana, setPestana] = useState<"mapa" | "compositor" | "sprites">("mapa");
  const [semilla, setSemilla] = useState<Semilla[] | undefined>();
  // El mapa que hay ahora mismo, para que el panel de IA pueda dibujarlo.
  const [escena, setEscena] = useState<Escena | null>(null);
  // La cámara que escribió la IA, esperando a que se monte el compositor.
  const [colaIa, setColaIa] = useState<any[] | null>(null);
  // Lo que se le pasa al editor cuando la IA escribe un mapa nuevo.
  const [impuesta, setImpuesta] = useState<Escena | null>(null);
  // Qué salió y qué se pagó. Vive aquí y no en la tarjeta de la IA porque esa
  // se cierra justo al terminar, y era donde se contaba.
  const [resumen, setResumen] = useState<string | null>(null);

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

      <a
        href="/lab/historias"
        className="btn-brand w-fit text-xs"
      >
        <Clapperboard className="h-3.5 w-3.5" /> Usarlo en una historia de verdad
      </a>

      <div className="flex gap-1.5" role="tablist">
        {([
          { id: "mapa", label: "1 · Mapa de la escena", Icono: Map },
          { id: "compositor", label: "2 · Montaje y paralaje", Icono: Layers3 },
          // Los sprites no son un paso del recorrido: se fabrican una vez y se
          // reutilizan, así que van aparte y no numerados.
          { id: "sprites", label: "Sprites", Icono: Bird },
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

      {pestana === "sprites" && (
        hayIa
          ? <GenerarSprite />
          : (
            <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
              Hace falta la clave de OpenAI en el servidor para fabricar sprites.
            </p>
          )
      )}

      {hayIa && pestana === "mapa" && (
        <GenerarIa
          escena={escena}
          onEscena={(e) => { setImpuesta(e); setEscena(e); }}
          onAnimacion={(pasos) => setColaIa(pasos)}
          onCapas={(cs, resumen) => {
            // Las imágenes generadas van directas al montaje: es el final del
            // recorrido, y hacer que el usuario las baje y las vuelva a subir
            // no aporta nada.
            setSemilla(cs.map((c) => ({ nombre: c.nombre, url: c.url, via: c.via, vacio: c.vacio, mov: c.mov as any })));
            setResumen(resumen);
            setPestana("compositor");
          }}
        />
      )}

      {resumen && pestana === "compositor" && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent">
          {resumen}
        </p>
      )}

      {pestana === "sprites" ? null : pestana === "mapa"
        ? <MapaEditor onEnviarAlCompositor={probar} onEscena={setEscena} escenaExterna={impuesta} />
        : (
          <Compositor
            semilla={semilla}
            colaInicial={colaIa ?? undefined}
            escena={escena ?? undefined}
            // Un ZIP con mapa dentro repone también la pestaña 1: si no, se
            // recuperaba el montaje y el mapa se quedaba en blanco.
            onEscena={(e) => {
              const rev = revisar(e);
              if ("escena" in rev) { setEscena(rev.escena); setImpuesta(rev.escena); }
            }}
          />
        )}
    </div>
  );
}
