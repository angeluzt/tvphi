"use client";

import { useEffect, useRef, useState } from "react";
import { Map, Layers3, FlaskConical, Clapperboard, Bird } from "lucide-react";
import { MapaEditor } from "./mapa-editor";
import { Compositor, type Semilla } from "./compositor";
import { revisar } from "@/lib/lab/escena";
import { GenerarIa } from "./generar-ia";
import { GenerarSprite, type GenerarSpriteHandle } from "./generar-sprite";
import { BibliotecaSprites } from "./biblioteca-sprites";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { urlSprite, type SpriteMeta } from "@/lib/lab/biblioteca";
import type { EfectoEscena } from "@/lib/lab/efectos-escena";
import type { Escena } from "@/lib/lab/escena";

function pestanaInicial(): "mapa" | "compositor" | "sprites" {
  if (typeof window === "undefined") return "mapa";
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "sprites" || t === "compositor" || t === "mapa") return t;
  return "mapa";
}

export function LabApp({ hayIa }: { hayIa: boolean }) {
  const [pestana, setPestana] = useState<"mapa" | "compositor" | "sprites">("mapa");
  const [semilla, setSemilla] = useState<Semilla[] | undefined>();
  // El mapa que hay ahora mismo, para que el panel de IA pueda dibujarlo.
  const [escena, setEscena] = useState<Escena | null>(null);
  // La cámara que escribió la IA, esperando a que se monte el compositor.
  const [colaIa, setColaIa] = useState<any[] | null>(null);
  // El sprite que se acaba de elegir en la biblioteca, de camino al montaje.
  const [sprite, setSprite] = useState<any>(null);
  // Los efectos que escribió la IA, esperando a que se monte el compositor.
  const [efectosIa, setEfectosIa] = useState<EfectoEscena[] | null>(null);
  // Sube cada vez que se guarda uno nuevo, para que la biblioteca se relea.
  const [tandaSprites, setTandaSprites] = useState(0);
  // Lo que se le pasa al editor cuando la IA escribe un mapa nuevo.
  const [impuesta, setImpuesta] = useState<Escena | null>(null);
  // Qué salió y qué se pagó. Vive aquí y no en la tarjeta de la IA porque esa
  // se cierra justo al terminar, y era donde se contaba.
  const [resumen, setResumen] = useState<string | null>(null);
  const tallerRef = useRef<GenerarSpriteHandle>(null);
  const tallerTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPestana(pestanaInicial());
  }, []);

  function irAlTaller() {
    setPestana("sprites");
    requestAnimationFrame(() => {
      tallerTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Pasar el mapa al compositor sin salir de la página: cada capa se pinta en
  // su propio PNG transparente y se le da al compositor como si fueran las
  // imágenes generadas. Sirve para ver cómo se moverá la escena ANTES de gastar
  // nada en generarla, que es la mitad de la gracia de tener el mapa.
  function probar(esc: Escena) {
    const urls = esc.layers
      .filter((c) => c.visible !== false)
      .map((c) => ({
        id: c.id,
        nombre: c.name,
        url: lienzoDeCapas(esc, [c.id], true, false).toDataURL("image/png"),
        depth: c.depth,
        escala: 1 + c.depth * 0.12,
        mov: c.mov,
      }));
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
              El taller de sprites (único) está en la pestaña Sprites.
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
        <div className="space-y-4">
          <div ref={tallerTopRef}>
            <GenerarSprite
              ref={tallerRef}
              puedeGenerar={hayIa}
              puedePublicar
              onGuardado={() => setTandaSprites((v) => v + 1)}
            />
          </div>
          {!hayIa && (
            <p className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
              Hace falta la clave de OpenAI en el servidor para fabricar sprites nuevos. Los que ya
              están guardados y los proyectos ZIP se pueden usar y editar igual.
            </p>
          )}
          {/* La biblioteca se ve HAYA O NO clave: lo guardado no depende de que
              la IA esté disponible hoy, y esa es justo la gracia de guardarlo. */}
          <BibliotecaSprites
            recargar={tandaSprites}
            onEditarPlantilla={(animationId) => {
              irAlTaller();
              void tallerRef.current?.abrirAnimacion(animationId);
            }}
            onNuevaAnimacion={(characterId) => {
              irAlTaller();
              void tallerRef.current?.nuevaAnimacionDePersonaje(characterId);
            }}
            onUsar={(s: SpriteMeta) => {
              setSprite({
                nombre: s.nombre,
                url: urlSprite(s.id),
                spr: {
                  id: s.id, fotogramas: s.fotogramas, fps: s.fps,
                  vista: s.vista, direccionBase: s.direccion, accion: s.accion, anclaje: s.anclaje,
                  x: 0.5, y: 0.45, alto: 0.2,
                  espacio: "pantalla",
                  sincronizar: true,
                },
              });
              setPestana("compositor");
            }}
          />
        </div>
      )}

      {hayIa && pestana === "mapa" && (
        <GenerarIa
          escena={escena}
          onEscena={(e) => { setImpuesta(e); setEscena(e); }}
          onAnimacion={(pasos) => setColaIa(pasos)}
          onEfectos={(fx) => setEfectosIa(fx)}
          onCapas={(cs, resumen, actores) => {
            const porCapa = new globalThis.Map<string, typeof actores>();
            for (const actor of actores) {
              const grupo = porCapa.get(actor.despuesDe) ?? [];
              grupo.push(actor);
              porCapa.set(actor.despuesDe, grupo);
            }
            const montaje: Semilla[] = [];
            for (const capa of cs) {
              montaje.push({
                id: capa.id,
                nombre: capa.nombre,
                url: capa.url,
                via: capa.via,
                vacio: capa.vacio,
                mov: capa.mov as any,
                depth: capa.depth,
                escala: 1 + capa.depth * 0.12,
              });
              const despues = (porCapa.get(capa.id) ?? []).sort((a, b) => a.depth - b.depth);
              despues.forEach((actor) => montaje.push({
                id: actor.id,
                nombre: actor.nombre,
                url: actor.url,
                depth: actor.depth,
                escala: 1,
                spr: actor.spr,
              }));
              porCapa.delete(capa.id);
            }
            for (const pendientes of porCapa.values()) {
              pendientes.forEach((actor) => montaje.push({
                id: actor.id,
                nombre: actor.nombre,
                url: actor.url,
                depth: actor.depth,
                escala: 1,
                spr: actor.spr,
              }));
            }
            setSemilla(montaje);
            if (actores.some((a) => a.fuente === "generado")) setTandaSprites((v) => v + 1);
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

      {pestana === "mapa" && (
        <MapaEditor onEnviarAlCompositor={probar} onEscena={setEscena} escenaExterna={impuesta} />
      )}

      <div className={pestana === "compositor" ? undefined : "hidden"}>
        <Compositor
          semilla={semilla}
          sprite={sprite}
          colaInicial={colaIa ?? undefined}
          efectosIniciales={efectosIa ?? undefined}
          escena={escena ?? undefined}
          puedeIa={hayIa}
          onEscena={(e) => {
            const rev = revisar(e);
            if ("escena" in rev) { setEscena(rev.escena); setImpuesta(rev.escena); }
          }}
        />
      </div>
    </div>
  );
}
