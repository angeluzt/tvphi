"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Copy, FileJson, Check, AlertTriangle, Eye, EyeOff, Package, Image as ImageIcon,
} from "lucide-react";
import { revisar, pegas, nombreArchivo, type Escena } from "@/lib/lab/escena";
import { dibujarEscena } from "@/lib/lab/dibujar";
import { aBlob, bajar, lienzoDeCapas, promptIa, zipDeCapas } from "@/lib/lab/exportar";
import { EJEMPLOS } from "@/lib/lab/ejemplos";

// Paso 1: escribir el mapa y sacar las capas.
//
// Aquí no se dibuja a mano: se escribe (o se pega lo que devolvió una IA) el
// JSON de la escena, se ve al momento, y se exportan las capas como PNG con
// fondo transparente más el texto que hay que darle al modelo de imagen.

export function MapaEditor({
  onEnviarAlCompositor,
  onEscena,
  escenaExterna,
}: {
  onEnviarAlCompositor?: (esc: Escena) => void;
  /** Para que quien nos aloja sepa qué mapa hay cargado. */
  onEscena?: (esc: Escena) => void;
  /** Un mapa que llega de fuera (lo escribió la IA): sustituye al de aquí. */
  escenaExterna?: Escena | null;
}) {
  const [texto, setTexto] = useState(() => JSON.stringify(EJEMPLOS[0].escena, null, 2));
  const [esc, setEsc] = useState<Escena | null>(() => {
    const r = revisar(EJEMPLOS[0].escena);
    return "escena" in r ? r.escena : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [etiquetas, setEtiquetas] = useState(true);
  const [rejilla, setRejilla] = useState(false);
  const [paralaje, setParalaje] = useState(true);
  const [fuerza, setFuerza] = useState(60);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const raton = useRef({ x: 0, y: 0 });
  const encima = useRef(false);

  // Al cargar una escena nueva se marcan todas: lo normal es querer todas.
  useEffect(() => { setMarcadas(esc ? esc.layers.map((c) => c.id) : []); }, [esc]);
  // Y se avisa fuera, que es quien la manda a dibujar.
  useEffect(() => { if (esc) onEscena?.(esc); }, [esc]);

  // Un mapa escrito por la IA entra aquí como si lo hubiera pegado el usuario:
  // se ve, se puede corregir a mano y se dibuja desde el mismo sitio.
  useEffect(() => {
    if (!escenaExterna) return;
    setTexto(JSON.stringify(escenaExterna, null, 2));
    setEsc(escenaExterna);
    setError(null);
    setAviso(`Mapa de la IA: ${escenaExterna.layers.length} capas. Puedes retocarlo antes de dibujar.`);
  }, [escenaExterna]);

  function aplicar(fuente?: string) {
    try {
      const data = JSON.parse(fuente ?? texto);
      const r = revisar(data);
      if ("error" in r) { setError(r.error); setAviso(null); return; }
      setEsc(r.escena); setError(null);
      setAviso(`Cargado: ${r.escena.layers.length} capas, ${r.escena.layers.reduce((a, c) => a + c.objects.length, 0)} formas.`);
    } catch (e) {
      setError(`El JSON no se puede leer: ${(e as Error).message}`);
      setAviso(null);
    }
  }

  function cargarEjemplo(i: number) {
    const j = JSON.stringify(EJEMPLOS[i].escena, null, 2);
    setTexto(j);
    aplicar(j);
  }

  // Bucle de dibujo. El paralaje sigue al ratón dentro del cuadro y, si no hay
  // ratón encima, se mueve solo despacio: hay que poder VER el efecto sin tener
  // que estar moviendo la mano.
  useEffect(() => {
    let vivo = true;
    let t0 = performance.now();
    const paso = (t: number) => {
      if (!vivo) return;
      const cv = canvas.current;
      if (cv && esc) {
        const ancho = Math.max(320, Math.min(1200, caja.current?.clientWidth ?? 900));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(ancho * dpr);
        const h = Math.round((w * esc.scene.height) / esc.scene.width);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        let ox = 0, oy = 0;
        if (paralaje) {
          const k = (fuerza / 100) * 0.06;
          if (encima.current) { ox = raton.current.x * k; oy = raton.current.y * k * 0.55; }
          else {
            const s = (t - t0) / 3200;
            ox = Math.sin(s) * k; oy = Math.cos(s * 0.8) * k * 0.4;
          }
        }
        dibujarEscena(cv, esc, { offsetX: ox, offsetY: oy, etiquetas, rejilla });
      }
      requestAnimationFrame(paso);
    };
    const id = requestAnimationFrame(paso);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, [esc, etiquetas, rejilla, paralaje, fuerza]);

  const total = useMemo(
    () => esc?.layers.reduce((a, c) => a + c.objects.length, 0) ?? 0, [esc]);
  const lista = useMemo(() => (esc ? pegas(esc) : []), [esc]);

  async function exportar(modo: "png" | "zip", ids: string[]) {
    if (!esc) return;
    if (!ids.length) { setError("No hay ninguna capa marcada."); return; }
    setTrabajando(true);
    try {
      if (modo === "png") {
        const b = await aBlob(lienzoDeCapas(esc, ids, ids.length < esc.layers.length, etiquetas));
        bajar(b, `${nombreArchivo(esc.scene.id)}--mapa.png`);
        setAviso(`PNG de ${ids.length} capa${ids.length > 1 ? "s" : ""} descargado.`);
      } else {
        const b = await zipDeCapas(esc, ids, etiquetas);
        bajar(b, `${nombreArchivo(esc.scene.id)}--capas.zip`);
        setAviso(`ZIP con ${ids.length} PNG, las instrucciones y el JSON.`);
      }
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setTrabajando(false); }
  }

  async function copiarPrompt() {
    if (!esc) return;
    const t = promptIa(esc, marcadas.length ? marcadas : undefined);
    try {
      await navigator.clipboard.writeText(t);
      setAviso("Instrucciones copiadas. Pégalas junto con los PNG.");
    } catch {
      // Sin permiso de portapapeles: se deja el texto a la vista para copiarlo
      // a mano, en vez de decir «no se pudo» y dejar al usuario sin nada.
      setTexto(t);
      setAviso("No se pudo copiar solo: el texto está abajo, cópialo a mano.");
    }
  }

  const alterna = (id: string) =>
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {EJEMPLOS.map((e, i) => (
          <button key={e.id} onClick={() => cargarEjemplo(i)} className="btn-ghost text-xs">
            <FileJson className="h-3.5 w-3.5 text-accent" /> {e.nombre}
          </button>
        ))}
        <label className="btn-ghost cursor-pointer text-xs">
          <Package className="h-3.5 w-3.5 text-accent" /> Importar JSON
          <input
            type="file" accept=".json,application/json" className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => { const s = String(r.result); setTexto(s); aplicar(s); };
              r.readAsText(f);
              ev.target.value = "";
            }}
          />
        </label>
        <span className="flex-1" />
        <button onClick={copiarPrompt} disabled={!esc} className="btn-ghost text-xs">
          <Copy className="h-3.5 w-3.5 text-accent" /> Copiar instrucciones para la IA
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Capas */}
        <div className="card space-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="label">Capas</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{esc?.layers.length ?? 0} · {total} formas</span>
          </div>
          <p className="text-[11px] text-muted">
            De atrás hacia delante. El número es la profundidad: 0 no se mueve, 1 se mueve entero.
          </p>
          <div className="space-y-1.5">
            {esc?.layers.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-surface-2/50 p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" checked={marcadas.includes(c.id)}
                    onChange={() => alterna(c.id)} aria-label={`Marcar ${c.name}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
                  <span className="chip shrink-0 bg-brand/15 text-brand">{c.depth}</span>
                  <button
                    onClick={() => setEsc({ ...esc, layers: esc.layers.map((x) => x.id === c.id ? { ...x, visible: x.visible === false } : x) })}
                    className="shrink-0 text-muted hover:text-fg"
                    title={c.visible === false ? "Mostrar" : "Ocultar"}
                  >
                    {c.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1 truncate text-[10px] text-muted">
                  {c.objects.length} formas{c.ai?.prompt ? ` · ${c.ai.prompt}` : ""}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setMarcadas(esc?.layers.map((c) => c.id) ?? [])} className="btn-ghost flex-1 text-[11px]">Todas</button>
            <button onClick={() => setMarcadas([])} className="btn-ghost flex-1 text-[11px]">Ninguna</button>
          </div>
          <div className="space-y-1.5 border-t border-border pt-2">
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <input type="checkbox" checked={etiquetas} onChange={(e) => setEtiquetas(e.target.checked)} />
              Incluir etiquetas en el PNG
            </label>
            <button onClick={() => exportar("zip", marcadas)} disabled={trabajando || !esc} className="btn-brand w-full text-xs">
              <Download className="h-3.5 w-3.5" /> Capas marcadas · ZIP
            </button>
            <button onClick={() => exportar("png", marcadas)} disabled={trabajando || !esc} className="btn-ghost w-full text-xs">
              <ImageIcon className="h-3.5 w-3.5 text-accent" /> Marcadas en un PNG
            </button>
            {onEnviarAlCompositor && (
              <button onClick={() => esc && onEnviarAlCompositor(esc)} disabled={!esc} className="btn-ghost w-full text-xs">
                <Check className="h-3.5 w-3.5 text-accent" /> Probar el paralaje con el mapa
              </button>
            )}
          </div>
        </div>

        {/* Vista */}
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={paralaje} onChange={(e) => setParalaje(e.target.checked)} /> Paralaje
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={rejilla} onChange={(e) => setRejilla(e.target.checked)} /> Rejilla y tercios
            </label>
            <label className="flex min-w-[170px] flex-1 items-center gap-2 text-[11px] text-muted">
              Fuerza
              <input type="range" min={0} max={100} value={fuerza} onChange={(e) => setFuerza(Number(e.target.value))} className="min-w-0 flex-1" />
              <span className="w-8 tabular-nums">{fuerza}%</span>
            </label>
            {esc && <span className="chip bg-surface-2 text-muted">{esc.scene.width}×{esc.scene.height}</span>}
          </div>
          <div
            ref={caja}
            className="overflow-hidden rounded-xl border border-border bg-black"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              raton.current = {
                x: ((e.clientX - r.left) / r.width - 0.5) * 2,
                y: ((e.clientY - r.top) / r.height - 0.5) * 2,
              };
              encima.current = true;
            }}
            onPointerLeave={() => { encima.current = false; }}
          >
            <canvas ref={canvas} className="block h-auto w-full" />
          </div>
          {error && (
            <p className="flex items-start gap-1.5 text-[11px] text-danger">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {!error && aviso && <p className="text-[11px] text-accent">{aviso}</p>}
          {/* Pegas que no rompen el JSON pero sí el resultado. */}
          {lista.map((p, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-gold">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {p}
            </p>
          ))}
        </div>
      </div>

      {/* JSON */}
      <div className="card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="label">JSON de la escena</span>
          <span className="flex-1" />
          <button onClick={() => aplicar()} className="btn-brand text-xs">Aplicar</button>
          <button
            onClick={() => { try { setTexto(JSON.stringify(JSON.parse(texto), null, 2)); setError(null); } catch (e) { setError((e as Error).message); } }}
            className="btn-ghost text-xs"
          >Ordenar</button>
          <button
            onClick={() => esc && bajar(new Blob([JSON.stringify(esc, null, 2)], { type: "application/json" }), `${nombreArchivo(esc.scene.id)}.json`)}
            className="btn-ghost text-xs"
          ><Download className="h-3.5 w-3.5 text-accent" /> Descargar</button>
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          spellCheck={false}
          className="input h-64 w-full resize-y font-mono text-[11px] leading-relaxed"
          aria-label="JSON de la escena"
        />
      </div>
    </div>
  );
}
