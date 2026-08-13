"use client";

import { useMemo, useRef } from "react";
import { Camera, Plus, Sparkles, User } from "lucide-react";
import {
  lineaDeTiempo, reloj, type Bloque, type EfectoLT, type Marca,
  type PasoCamaraLT, type Pista, type SpriteLT,
} from "@/lib/lab/linea-tiempo";

// El controlador de tiempo, por pistas.
//
// LO QUE HABÍA. Un deslizador y dos flechas. Con eso se puede ver la animación
// entera, pero no se puede TRABAJAR con ella: hay tres relojes corriendo a la
// vez —la cámara, la ruta de cada sprite y los efectos— y ninguno se veía. La
// pregunta que no se podía contestar era la más corriente de todas: «¿en qué
// segundo cambia el sprite?». Para encontrarlo había que arrastrar el
// deslizador a ojo y mirar el lienzo.
//
// Aquí cada cosa tiene su fila y su sitio en el eje. Se pulsa donde sea para
// saltar ahí, y se pulsa un bloque para abrir sus ajustes. Las anchuras son
// proporcionales al tiempo, así que un tramo largo SE VE largo: es lo que
// permite notar de un vistazo que un paso de cámara se come media escena.
//
// Lo que decide dónde cae cada bloque está en `lib/lab/linea-tiempo.ts`, con
// sus pruebas. Aquí solo se pinta.

/** Ancho de la columna de nombres. Lo usan el grid Y el cabezal: si se
 *  separan, la línea del cabezal deja de caer donde marca la regla. */
const ANCHO_NOMBRES = "7rem";

const COLOR: Record<Bloque["clase"], string> = {
  camara: "bg-brand/70 border-brand",
  mover: "bg-accent/60 border-accent",
  pausa: "bg-surface-2 border-border",
  voltear: "bg-gold/50 border-gold",
  cambiar: "bg-danger/60 border-danger",
  efecto: "bg-ok/40 border-ok/70",
};

const ICONO: Record<Pista["clase"], typeof Camera> = {
  camara: Camera,
  sprite: User,
  efectos: Sparkles,
};

export function LineaTiempo({
  cola,
  sprites,
  efectos,
  ms,
  reproduciendo,
  onSeek,
  onAbrirBloque,
  seleccionId,
  onAnadir,
  alto = 26,
}: {
  cola: PasoCamaraLT[];
  sprites: SpriteLT[];
  efectos: EfectoLT[];
  /** Dónde está el cabezal ahora mismo, en milisegundos. */
  ms: number;
  reproduciendo?: boolean;
  onSeek: (ms: number) => void;
  /** Pulsar un bloque abre lo que sea que lo edite. */
  onAbrirBloque?: (pista: Pista, b: Bloque) => void;
  /** Qué bloque está abierto ahora mismo, para señalarlo. */
  seleccionId?: string | null;
  /** Añadir una pista nueva desde la propia línea. */
  onAnadir?: (que: "camara" | "efecto" | "actor") => void;
  alto?: number;
}) {
  const lt = useMemo(() => lineaDeTiempo(cola, sprites, efectos), [cola, sprites, efectos]);
  const carril = useRef<HTMLDivElement | null>(null);

  const pct = (v: number) => `${(v / lt.totalMs) * 100}%`;

  // Saltar pulsando o arrastrando por cualquier parte del carril. Se usa el
  // ancho del propio carril y no el del bloque pulsado: si no, pulsar sobre un
  // bloque saltaría al principio de ESE bloque y no al punto exacto.
  function alPuntero(e: React.PointerEvent) {
    const c = carril.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    onSeek(f * lt.totalMs);
  }

  // Marcas del eje cada segundo si la escena es corta, cada cinco si es larga:
  // con una por segundo en un minuto no se lee nada.
  const cadaMs = lt.totalMs > 30000 ? 5000 : lt.totalMs > 12000 ? 2000 : 1000;
  const reglas: number[] = [];
  for (let t = 0; t <= lt.totalMs; t += cadaMs) reglas.push(t);

  return (
    <div className="rounded-xl border border-border bg-surface/80 p-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted">
        <span className="font-semibold text-fg">{reloj(ms)}</span>
        <span>de {reloj(lt.totalMs)}</span>
        {reproduciendo && <span className="text-accent">▶</span>}
        <span className="ml-auto">Pulsa para saltar · pulsa un bloque para editarlo</span>
      </div>

      <div className="relative">
      {/* `minmax(0,1fr)` en la pista, no `1fr`: sin el 0 el carril no puede
          encoger por debajo de sus bloques y la fila desborda la ventana en
          cuanto la escena es larga. */}
      <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: `minmax(0,${ANCHO_NOMBRES}) minmax(0,1fr)` }}>
        {/* La regla */}
        <span />
        <div className="relative h-3 select-none">
          {reglas.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2 text-[9px] text-muted"
              style={{ left: pct(t) }}>
              {reloj(t)}
            </span>
          ))}
        </div>

        {lt.pistas.map((p) => {
          const Icono = ICONO[p.clase];
          return (
            <div key={p.id} className="contents">
              <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted">
                <Icono className="h-3 w-3 shrink-0" />
                <span className="truncate" title={p.nombre}>{p.nombre}</span>
              </div>
              <div
                className="relative cursor-pointer rounded bg-surface-2/60"
                style={{ height: alto }}
                onPointerDown={(e) => {
                  // Capturar el puntero puede fallar —un puntero que ya se
                  // soltó, un evento sintético— y sin el try se lleva por
                  // delante el salto, que es lo único que de verdad importa
                  // aquí. Arrastrar es la comodidad; saltar es la función.
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* se sigue */ }
                  alPuntero(e);
                }}
                onPointerMove={(e) => { if (e.buttons) alPuntero(e); }}
                ref={p.clase === "camara" ? carril : undefined}

              >
                {p.bloques.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    // VA EN pointerdown, NO en click. El carril captura el
                    // puntero para poder arrastrar el cabezal, y con la captura
                    // puesta el `click` acaba yendo al carril y no al botón:
                    // pulsar una barra no abría nada. En pointerdown el botón
                    // es todavía el destino, así que se entera él primero y el
                    // evento sigue subiendo al carril, que salta al punto
                    // pulsado. Las dos cosas a la vez: saltas ahí y se abre lo
                    // que hay ahí, que es lo que hace cualquier editor.
                    onPointerDown={() => onAbrirBloque?.(p, b)}
                    // El seleccionado se marca con un aro claro: sin señal, se
                    // pulsaba un bloque, se abrían sus ajustes debajo y no
                    // había forma de saber cuál de los ocho se estaba tocando.
                    className={`absolute top-0 flex h-full items-center overflow-hidden rounded border px-1 text-left text-[9px] text-white ${COLOR[b.clase]} ${
                      seleccionId === b.id ? "ring-2 ring-white/80 ring-offset-1 ring-offset-surface" : ""
                    }`}
                    style={{ left: pct(b.desde), width: pct(Math.max(1, b.hasta - b.desde)) }}
                    title={`${b.etiqueta}${b.nota ? ` · ${b.nota}` : ""} · ${reloj(b.desde)} → ${reloj(b.hasta)}`}
                  >
                    <span className="truncate">{b.etiqueta}</span>
                  </button>
                ))}
                {p.marcas.map((m, i) => (
                  <span
                    key={`${m.clase}-${i}`}
                    className={`pointer-events-none absolute top-0 h-full w-0.5 ${
                      m.clase === "cambio" ? "bg-danger"
                        : m.clase === "fundido" ? "bg-gold"
                          : m.clase === "vuelta" ? "bg-white/40" : "bg-muted/60"
                    }`}
                    style={{ left: pct(m.ms) }}
                    title={`${m.etiqueta} · ${reloj(m.ms)}`}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {onAnadir && (
          <>
            <span className="text-[10px] text-muted">Añadir</span>
            <div className="flex flex-wrap items-center gap-1">
              {([
                ["camara", "Paso de cámara"],
                ["efecto", "Efecto"],
                ["actor", "Actor"],
              ] as const).map(([que, et]) => (
                <button
                  key={que}
                  type="button"
                  onClick={() => onAnadir(que)}
                  className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted hover:border-accent hover:text-accent"
                >
                  <Plus className="mr-0.5 inline h-2.5 w-2.5" />{et}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* EL CABEZAL, de una pieza y por encima de todas las pistas.
          Va FUERA del grid a propósito: dentro tendría que ser una fila más y
          se cortaría en cada pista, que es como se ve que un editor está mal
          hecho. Se desplaza el ancho de la columna de nombres para que el 0
          caiga donde de verdad empieza el tiempo. */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{ left: `calc(${ANCHO_NOMBRES} + 0.5rem)`, right: 0 }}
      >
        <span
          className="absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_6px_rgba(201,162,39,.9)]"
          style={{ left: pct(Math.max(0, Math.min(lt.totalMs, ms))) }}
        />
      </div>
      </div>

      {!!lt.pistas.find((p) => p.marcas.some((m) => m.clase === "cambio")) && (
        <p className="mt-1 text-[9px] text-muted">
          <span className="mr-1 inline-block h-2 w-0.5 translate-y-[1px] bg-danger" />
          cambio de sprite
          <span className="ml-3 mr-1 inline-block h-2 w-0.5 translate-y-[1px] bg-gold" />
          fundido de capa
        </p>
      )}
    </div>
  );
}

export type { Bloque, Marca, Pista };
