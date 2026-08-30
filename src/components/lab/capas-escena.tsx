"use client";

import { useState } from "react";
import { Layers3, Trash2, Upload, Wand2, Loader2, AlertTriangle, ChevronUp, ChevronDown, Repeat } from "lucide-react";
import { nanoid } from "nanoid";
import type { EscenaCapa } from "@/lib/story/model";
import { MAX_LAMINAS_VIVAS, type PlanParalaje } from "@/lib/story/plan-medios";
import { generarLaminasEscena } from "@/lib/lab/generar-laminas";
import { RangoPreciso } from "./rango-preciso";

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
  plan,
  conSprites = false,
  calidad,
  onCambio,
  onEscenaViva,
  onGuardarImagen,
  onAnimarCapa,
  animandoCapa,
}: {
  capas: EscenaCapa[];
  /** La descripción de la escena, que es de donde sale el mapa. */
  prompt: string;
  formato: "16:9" | "9:16" | "1:1";
  /**
   * Lo que la IA planeó para el paralaje de ESTA escena: cuántas láminas y
   * cuáles respiran. Sin plan, se generan las de siempre y quietas.
   */
  plan?: PlanParalaje;
  /** Si además se pueden pedir actores animados sobre las láminas. */
  conSprites?: boolean;
  calidad?: "low" | "medium" | "high";
  onCambio: (c: EscenaCapa[]) => void;
  /**
   * Lo demás que la IA escribe junto al mapa: la cola de cámara y los efectos.
   *
   * Hasta ahora se pedía, se pagaba y se tiraba: solo se guardaban las
   * imágenes y su profundidad, así que una escena que la IA había escrito con
   * su movimiento y su lluvia acababa siendo láminas quietas.
   */
  onEscenaViva?: (v: { camara?: unknown[]; efectos?: unknown[] }) => void;
  /** Guarda el PNG donde vivan las imágenes y devuelve su id. */
  onGuardarImagen: (dataUrl: string, nombre: string) => Promise<string>;
  /** Pedir N fotogramas de ESTA lámina, con la PNG como referencia. */
  onAnimarCapa?: (capaId: string) => void;
  animandoCapa?: string | null;
}) {
  const [paso, setPaso] = useState<string | null>(null);
  // Aparte de «paso» a propósito: mientras «paso» tenga texto los botones están
  // bloqueados, y esto es un aviso de después, no un «estoy trabajando».
  const [nota, setNota] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nCapas, setNCapas] = useState(plan?.capas ?? 4);
  // Los actores solo se piden si la paleta los deja Y el plan los pidió; se
  // puede desmarcar antes de generar, que cada uno es una imagen.
  const [conActores, setConActores] = useState(conSprites && !!plan?.sprites);
  // Y las láminas vivas: el plan dice cuáles, aquí solo se decide si se pagan.
  const [animarVivas, setAnimarVivas] = useState(!!plan?.vivas.length);

  const trabajando = !!paso;

  async function generar() {
    if (prompt.trim().length < 4) {
      setError("Escribe antes cómo es esta imagen: de ahí sale el mapa.");
      return;
    }
    setError(null); setNota(null);
    try {
      const hecho = await generarLaminasEscena({
        prompt, formato, nCapas,
        pistasVivas: animarVivas ? (plan?.vivas ?? []) : [],
        topeVivas: animarVivas ? Math.min(MAX_LAMINAS_VIVAS, plan?.vivas.length || 1) : 0,
        conSprites: conActores,
        calidad,
        onPaso: setPaso,
        onGuardarImagen,
      });
      if (hecho.capas.length) {
        onCambio(hecho.capas);
        onEscenaViva?.({ camara: hecho.camara, efectos: hecho.efectos });
      }
      setPaso(null);
      const notas: string[] = [];
      if (hecho.guias) {
        notas.push(`${hecho.guias} capa de reserva no se mandó a dibujar: es una guía y no se ha pagado.`);
      }
      if (hecho.vivas.length) {
        // Se dice CUÁLES, no cuántas: animar la lámina equivocada son cinco
        // imágenes tiradas y el usuario tiene que poder verlo de un vistazo.
        const nombres = hecho.vivas
          .map((id) => hecho.capas.find((c) => c.id === id)?.nombre)
          .filter(Boolean);
        notas.push(`Para animar: ${nombres.join(", ")}. Dale a «Animar lámina» en cada una.`);
      }
      notas.push(...hecho.avisos);
      setNota(notas.length ? `${hecho.capas.length} capas listas. ${notas.join(" ")}` : null);
      if (hecho.fallos.length) {
        setError(`Salieron ${hecho.capas.length} de ${hecho.capas.length + hecho.fallos.length}. No salieron: ${hecho.fallos.join(" · ")}`);
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
        {conSprites && (
          <label className="flex items-center gap-1 text-[10px] text-muted" title="Actores recortados encima de las láminas. Una imagen cada uno.">
            <input type="checkbox" checked={conActores} disabled={trabajando}
              onChange={(e) => setConActores(e.target.checked)} />
            actores
          </label>
        )}
        {!!plan?.vivas.length && (
          <label className="flex items-center gap-1 text-[10px] text-muted"
            title={`Animar ${plan.vivas.join(", ")}. Cinco imágenes por lámina.`}>
            <input type="checkbox" checked={animarVivas} disabled={trabajando}
              onChange={(e) => setAnimarVivas(e.target.checked)} />
            láminas vivas
          </label>
        )}
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
            {c.loop && c.loop.imageIds.length > 1 && (
              <span className="chip shrink-0 bg-accent/15 text-accent">{c.loop.imageIds.length} fotogramas</span>
            )}
            {onAnimarCapa && (
              <button
                type="button"
                onClick={() => onAnimarCapa(c.id)}
                disabled={trabajando || animandoCapa === c.id}
                className="btn-ghost px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                title="Pedir fotogramas de esta lámina, con la PNG como referencia"
              >
                {animandoCapa === c.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Repeat className="h-3 w-3 text-accent" />}
                {c.loop ? "Regenerar loop" : "Animar lámina"}
              </button>
            )}
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
      <RangoPreciso valor={valor} min={min} max={max} paso={paso}
        onCambio={onCambio} etiqueta={etiqueta} />
      <span className="w-9 shrink-0 text-right tabular-nums">{formato(valor)}</span>
    </label>
  );
}
