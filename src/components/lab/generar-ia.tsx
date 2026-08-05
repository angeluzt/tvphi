"use client";

import { useState } from "react";
import { Wand2, Loader2, AlertTriangle, Check, Sparkles } from "lucide-react";
import type { Escena } from "@/lib/lab/escena";
import { revisar } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa, type Recorte } from "@/lib/lab/quitar-fondo";

// Del texto a la escena montada, sin salir de aquí.
//
// Dos llamadas distintas y en este orden a propósito: primero el mapa (texto),
// que es barato y se puede corregir a mano; después una imagen por capa, que es
// lo que cuesta. Así, si el mapa sale torcido, se arregla antes de gastar en
// dibujarlo cinco veces.

export interface CapaGenerada {
  id: string;
  nombre: string;
  url: string;
  via: Recorte["via"];
  vacio: number;
  color?: string;
}

export function GenerarIa({
  escena,
  onEscena,
  onCapas,
}: {
  /** El mapa que hay ahora, para poder dibujar capa a capa. */
  escena: Escena | null;
  onEscena: (e: Escena) => void;
  onCapas: (c: CapaGenerada[]) => void;
}) {
  const [idea, setIdea] = useState("");
  const [formato, setFormato] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [nCapas, setNCapas] = useState(4);
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hechas, setHechas] = useState<CapaGenerada[]>([]);

  async function pedirMapa() {
    setError(null); setPaso("Escribiendo el mapa de la escena…");
    try {
      const r = await fetch("/api/story/ia/lab/escena", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, formato, capas: nCapas }),
      });
      const j = await r.json();
      if (!r.ok) {
        // Con 422 viene también lo que contestó: se carga igual para poder
        // arreglarlo a mano en vez de perder la respuesta.
        if (j.bruto) {
          const rev = revisar(j.bruto);
          if ("escena" in rev) onEscena(rev.escena);
        }
        throw new Error(j.error ?? "No se pudo");
      }
      onEscena(j.escena);
      setPaso(`Mapa listo: ${j.escena.layers.length} capas. Revísalo y dale a dibujar.`);
    } catch (e) { setError((e as Error).message); setPaso(null); }
  }

  async function dibujar() {
    if (!escena) return;
    setError(null); setHechas([]);
    const visibles = escena.layers.filter((c) => c.visible !== false);
    const out: CapaGenerada[] = [];
    // Una capa que falle NO tumba el lote. Antes se cortaba en la primera y las
    // siguientes ni se intentaban: pagabas media escena y te quedabas sin nada
    // que montar. Ahora se sigue y al final se dice cuáles fallaron.
    const fallos: string[] = [];
    try {
      for (let i = 0; i < visibles.length; i++) {
        const capa = visibles[i];
        setPaso(`Dibujando ${i + 1} de ${visibles.length}: ${capa.name}…`);
        // El mapa de ESTA capa, sin etiquetas de las demás y sin fondo: es lo
        // que se le da al modelo como referencia de dónde va cada cosa.
        const mapa = lienzoDeCapas(escena, [capa.id], i > 0, true).toDataURL("image/png");
        const r = await fetch("/api/story/ia/lab/capa", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapa,
            prompt: capa.ai?.prompt ?? `The content marked in the map for «${capa.name}».`,
            excluir: capa.ai?.exclude,
            estilo: escena.scene.style,
            escena: escena.scene.description,
            esFondo: i === 0,
            formato,
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          fallos.push(`${capa.name}: ${j.error ?? "no se pudo"}`);
          continue;
        }

        // Aquí se decide si hubo que quitar el fondo, MIRANDO la imagen: no se
        // confía en que la API haya hecho lo que se le pidió.
        const rec = await prepararCapa(`data:image/png;base64,${j.imagen}`, i === 0);
        out.push({ id: capa.id, nombre: capa.name, url: rec.url, via: rec.via, vacio: rec.vacio, color: rec.color });
        setHechas([...out]);
      }
      if (out.length) onCapas(out);
      const cromadas = out.filter((c) => c.via === "croma").length;
      const opacas = out.filter((c, i) => i > 0 && c.via === "opaca").length;
      setPaso(
        `${out.length} de ${visibles.length} capas.`
        + (cromadas ? ` A ${cromadas} hubo que quitarles el fondo de color: este modelo no devuelve transparencia.` : "")
        + (opacas ? ` OJO: ${opacas} salieron opacas y sin fondo plano que quitar; taparán a las de atrás.` : ""),
      );
      // Los fallos se cuentan al final y por separado, sin borrar lo que sí salió.
      if (fallos.length) setError(`No salieron ${fallos.length}: ${fallos.join(" · ")}`);
    } catch (e) { setError((e as Error).message); setPaso(null); }
  }

  const trabajando = !!paso && !paso.startsWith("Mapa listo") && !paso.startsWith("Listo");

  return (
    <div className="card space-y-2 border-brand/40 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="label">Que lo haga la IA</span>
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Un faro en un acantilado al atardecer, con el mar rompiendo abajo y una figura pequeña mirando al horizonte."
        className="input h-20 w-full resize-y text-xs"
        aria-label="Descripción de la escena"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Formato
          <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)} className="input py-1 text-[11px]">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Capas
          <select value={nCapas} onChange={(e) => setNCapas(Number(e.target.value))} className="input py-1 text-[11px]">
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={() => void pedirMapa()} disabled={idea.trim().length < 4 || trabajando} className="btn-brand text-xs">
          {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          1 · Escribir el mapa
        </button>
        <button onClick={() => void dibujar()} disabled={!escena || trabajando} className="btn-ghost text-xs">
          <Wand2 className="h-3.5 w-3.5 text-accent" /> 2 · Dibujar las capas
        </button>
      </div>

      <p className="text-[10px] text-muted">
        El mapa es una llamada de texto, barata: mírala y corrígela antes de dibujar. Dibujar
        cuesta <b className="text-fg">una imagen por capa</b>, ni una más. El fondo se pide opaco;
        las de delante, sobre un magenta plano que se les quita aquí mismo, porque este modelo no
        sabe devolver transparencia.
      </p>

      {paso && !error && (
        <p className="flex items-start gap-1.5 text-[11px] text-accent">
          {trabajando ? <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" /> : <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
          {paso}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {!!hechas.length && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {hechas.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt={c.nombre} className="block h-auto w-full bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:14px_14px]" />
              <p className="truncate px-1.5 py-1 text-[9px] text-muted">
                {c.nombre} · {c.via === "croma" ? `croma ${c.color}` : c.via} · {Math.round(c.vacio * 100)}% vacío
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
