"use client";

import { useState } from "react";
import { Layers3, Trash2, Upload, Wand2, Loader2, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { nanoid } from "nanoid";
import type { EscenaCapa } from "@/lib/story/model";
import { revisar, esGuia, type Escena } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa } from "@/lib/lab/quitar-fondo";

// Convertir una escena del guion en varias láminas con profundidad.
//
// Es el enganche entre el laboratorio y el editor: lo que allí se probaba
// suelto, aquí se guarda DENTRO de la escena, y el motor lo dibuja al reproducir
// y al exportar. Cada lámina se recorta con su propio encuadre, así que al
// mover la cámara el fondo y el primer plano no van a la vez.
//
// Sigue en pruebas, así que vive aparte y solo se ve en el editor del
// laboratorio.

export function CapasEscena({
  capas,
  prompt,
  formato,
  onCambio,
  onGuardarImagen,
}: {
  capas: EscenaCapa[];
  /** La descripción de la escena, que es de donde sale el mapa. */
  prompt: string;
  formato: "16:9" | "9:16" | "1:1";
  onCambio: (c: EscenaCapa[]) => void;
  /** Guarda el PNG donde vivan las imágenes y devuelve su id. */
  onGuardarImagen: (dataUrl: string, nombre: string) => Promise<string>;
}) {
  const [paso, setPaso] = useState<string | null>(null);
  // Aparte de «paso» a propósito: mientras «paso» tenga texto los botones están
  // bloqueados, y esto es un aviso de después, no un «estoy trabajando».
  const [nota, setNota] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nCapas, setNCapas] = useState(4);

  const trabajando = !!paso;

  async function generar() {
    if (prompt.trim().length < 4) {
      setError("Escribe antes cómo es esta imagen: de ahí sale el mapa.");
      return;
    }
    setError(null); setNota(null);
    try {
      setPaso("Escribiendo el mapa de la escena…");
      const rm = await fetch("/api/story/ia/lab/escena", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: prompt, formato, capas: nCapas }),
      });
      const jm = await rm.json();
      if (!rm.ok) throw new Error(jm.error ?? "No se pudo escribir el mapa");
      const rev = revisar(jm.escena);
      if ("error" in rev) throw new Error(rev.error);
      const esc: Escena = rev.escena;

      const nuevas: EscenaCapa[] = [];
      // Una capa que falle no tumba el lote: se sigue y se cuenta al final.
      const fallos: string[] = [];
      // Sin las de reserva: son guías de dónde va el personaje y los efectos, y
      // mandarlas a dibujar es pagar un PNG vacío.
      const visibles = esc.layers.filter((c) => c.visible !== false && !esGuia(c));
      const guias = esc.layers.filter((c) => c.visible !== false && esGuia(c)).length;
      for (let i = 0; i < visibles.length; i++) {
        const capa = visibles[i];
        setPaso(`Dibujando ${i + 1} de ${visibles.length}: ${capa.name}…`);
        const mapa = lienzoDeCapas(esc, [capa.id], i > 0, true).toDataURL("image/png");
        const rc = await fetch("/api/story/ia/lab/capa", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapa, prompt: capa.ai?.prompt ?? capa.name, excluir: capa.ai?.exclude,
            estilo: esc.scene.style, escena: esc.scene.description,
            esFondo: i === 0, formato,
          }),
        });
        const jc = await rc.json();
        if (!rc.ok) { fallos.push(`${capa.name}: ${jc.error ?? "no se pudo"}`); continue; }
        const rec = await prepararCapa(
          `data:image/png;base64,${jc.imagen}`,
          i === 0,
          jc.porCroma ? (jc.croma ?? undefined) : undefined,
        );
        const id = await onGuardarImagen(rec.url, capa.name);
        // La profundidad viene del mapa, que es quien sabe qué está lejos.
        nuevas.push({
          id: nanoid(6), imageId: id, nombre: capa.name,
          depth: Math.max(0, Math.min(1, capa.depth)),
          escala: 1 + Math.max(0, Math.min(1, capa.depth)) * 0.12,
          opacidad: 1,
        });
      }
      if (nuevas.length) onCambio(nuevas);
      setPaso(null);
      setNota(guias
        ? `${nuevas.length} capas listas. ${guias} de reserva no se mandó a dibujar: es una guía y no se ha pagado.`
        : null);
      if (fallos.length) {
        setError(`Salieron ${nuevas.length} de ${visibles.length}. No salieron: ${fallos.join(" · ")}`);
      }
    } catch (e) { setError((e as Error).message); setPaso(null); }
  }

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const nuevas = [...capas];
    for (const f of Array.from(files)) {
      const url = await new Promise<string>((res) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f);
      });
      const nombre = f.name.replace(/\.[a-z0-9]+$/i, "");
      const id = await onGuardarImagen(url, nombre);
      nuevas.push({ id: nanoid(6), imageId: id, nombre, depth: 0, escala: 1, opacidad: 1 });
    }
    // Repartidas de atrás hacia delante: es un punto de partida, no una condena.
    onCambio(nuevas.map((c, i) => {
      const d = nuevas.length === 1 ? 0 : (i / (nuevas.length - 1)) ** 1.4;
      return { ...c, depth: Math.round(d * 100) / 100, escala: 1 + d * 0.12 };
    }));
  }

  const upd = (id: string, p: Partial<EscenaCapa>) =>
    onCambio(capas.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= capas.length) return;
    const n = [...capas];
    [n[i], n[j]] = [n[j], n[i]];
    onCambio(n);
  };

  return (
    <div className="mt-2 rounded-xl border border-gold/50 bg-gold/5 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Layers3 className="h-4 w-4 shrink-0 text-gold" />
        <span className="label">Capas con paralaje</span>
        {!!capas.length && <span className="chip bg-gold/15 text-gold">{capas.length}</span>}
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <select value={nCapas} onChange={(e) => setNCapas(Number(e.target.value))}
            className="input py-0.5 text-[11px]" disabled={trabajando}>
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} capas</option>)}
          </select>
        </label>
        <button onClick={() => void generar()} disabled={trabajando} className="btn-brand text-xs">
          {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Generar con IA
        </button>
        <label className="btn-ghost cursor-pointer text-xs">
          <Upload className="h-3.5 w-3.5 text-accent" /> Subir PNG
          <input type="file" accept="image/png,image/webp" multiple className="hidden"
            onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
        </label>
        {!!capas.length && (
          <button onClick={() => onCambio([])} className="btn-ghost text-xs text-danger">
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-muted">
        Con capas, la escena se dibuja con ellas en vez de con la foto. Al mover la cámara cada una
        se desplaza según su profundidad: <b className="text-fg">0</b> se queda quieta y
        <b className="text-fg"> 1</b> se mueve como una foto normal. La primera es el fondo y va
        opaca.
      </p>

      {paso && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-accent"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {paso}</p>}
      {nota && !paso && <p className="mt-1 text-[11px] text-accent">{nota}</p>}
      {error && <p className="mt-1 flex items-start gap-1.5 text-[11px] text-danger"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}</p>}

      {capas.map((c, i) => (
        <div key={c.id} className="mt-1.5 space-y-1 rounded-lg border border-border bg-surface-2/50 p-2">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{c.nombre}</span>
            {i === 0 && <span className="chip shrink-0 bg-surface-2 text-muted">fondo</span>}
            <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted hover:text-fg disabled:opacity-30" title="Atrás"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => mover(i, 1)} disabled={i === capas.length - 1} className="text-muted hover:text-fg disabled:opacity-30" title="Adelante"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button onClick={() => onCambio(capas.filter((x) => x.id !== c.id))} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <Barra etiqueta="Profundidad" valor={c.depth} max={1} paso={0.01}
            onCambio={(v) => upd(c.id, { depth: v })} formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="Zoom" valor={c.escala} min={1} max={1.4} paso={0.01}
            onCambio={(v) => upd(c.id, { escala: v })} formato={(v) => `${Math.round((v - 1) * 100)}%`} />
          <Barra etiqueta="Opacidad" valor={c.opacidad} max={1} paso={0.01}
            onCambio={(v) => upd(c.id, { opacidad: v })} formato={(v) => `${Math.round(v * 100)}%`} />
        </div>
      ))}
    </div>
  );
}

function Barra({ etiqueta, valor, min = 0, max, paso, onCambio, formato }: {
  etiqueta: string; valor: number; min?: number; max: number; paso: number;
  onCambio: (v: number) => void; formato: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-muted">
      <span className="w-16 shrink-0">{etiqueta}</span>
      <input type="range" min={min} max={max} step={paso} value={valor}
        onChange={(e) => onCambio(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}
