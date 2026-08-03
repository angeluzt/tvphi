"use client";

import { useEffect, useState } from "react";
import { Sparkles, KeyRound, Loader2, Check, Trash2 } from "lucide-react";
import { ModelosIa } from "./modelos-ia";

// Escribir un capítulo con IA.
//
// Dos partes: la clave de OpenAI (de cada usuario, guardada cifrada en el
// servidor) y el encargo. Lo que devuelve la IA NO se guarda solo: se enseña y
// tú decides si lo abres. Estrenar esto escribiendo encima de lo que estás
// editando sería la peor forma posible de empezar.

export function IaPanel({
  onGenerado,
}: {
  onGenerado: (name: string, project: unknown) => void;
}) {
  const [estado, setEstado] = useState<{ configurada: boolean; pista: string | null; models?: any } | null>(null);
  // Un modelo por tarea: no todos hacen de todo (los baratos de texto no dan
  // audio). Se copian tal cual de platform.openai.com.
  const [mods, setMods] = useState({ texto: "", imagen: "", voz: "", vozNombre: "alloy" });
  const [clave, setClave] = useState("");
  const [prompt, setPrompt] = useState("");
  const [escenas, setEscenas] = useState(6);
  const [ocupado, setOcupado] = useState<null | "clave" | "generar">(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  // Se le pide al bloque de modelos que vuelva a mirar la cuenta cuando cambia
  // la clave: hasta entonces no se puede saber qué modelos tiene.
  const [recargar, setRecargar] = useState(0);

  const leer = () =>
    fetch("/api/story/ia/clave").then((r) => r.json()).then((j) => {
      setEstado(j);
      return j;
    }).catch(() => null);

  useEffect(() => { void leer(); }, []);

  async function guardarClave() {
    setOcupado("clave"); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/clave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: clave, models: mods }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setClave("");
      await leer();
      // Ya con clave se puede preguntar qué modelos tiene ESTA cuenta.
      setRecargar((n) => n + 1);
      setAviso("Clave guardada ✓");
    } catch (e: any) { setAviso(e?.message ?? "No se pudo guardar"); }
    setOcupado(null);
  }

  async function borrarClave() {
    if (!confirm("¿Quitar tu clave de OpenAI?")) return;
    await fetch("/api/story/ia/clave", { method: "DELETE" });
    await leer();
    setAviso("Clave quitada");
  }

  async function generar() {
    setOcupado("generar"); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/capitulo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, escenas, modelo: mods.texto.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      onGenerado(j.name, j.project);
      setAviso(`Capítulo escrito ✓ · ${j.imagenes} escenas. Ábrelo y pon tus imágenes.`);
    } catch (e: any) { setAviso(e?.message ?? "No se pudo generar"); }
    setOcupado(null);
  }

  return (
    <div className="card p-4">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Escribir un capítulo con IA</span>
        {estado?.configurada && <span className="chip bg-accent/15 text-accent">clave puesta</span>}
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {/* ── la clave ── */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Tu clave de OpenAI</span>
              {estado?.configurada && (
                <>
                  <span className="ml-auto text-xs tabular-nums text-accent">{estado.pista}</span>
                  <button onClick={borrarClave} className="text-muted hover:text-danger" title="Quitar la clave">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                className="input min-w-0 flex-1 text-sm"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder={estado?.configurada ? "Poner otra clave…" : "sk-…"}
                aria-label="Clave de OpenAI"
              />
              <button onClick={guardarClave} disabled={!clave.trim() || ocupado === "clave"}
                className="btn-ghost shrink-0 text-xs disabled:opacity-40">
                {ocupado === "clave" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-accent" />}
                Guardar
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Se guarda cifrada en el servidor y no vuelve a salir de ahí: aquí solo verás sus
              últimos cuatro caracteres. El gasto corre por tu cuenta de OpenAI.
            </p>
          </div>

          {/* ── el encargo ── */}
          <div>
            <span className="text-xs text-muted">De qué va el capítulo</span>
            <textarea
              className="input mt-1 h-24 w-full text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="De qué va el capítulo"
              placeholder="Un pueblo que quedó bajo un embalse y reaparece con la sequía. Tono documental, inquietante, sin música alegre."
            />
          </div>
          {/* Un modelo por tarea. No es capricho: los modelos baratos de texto
              NO generan audio, así que uno solo para todo no funciona. El mismo
              bloque vive en el editor, para poder cambiarlo si uno falla. */}
          <ModelosIa tareas={["texto", "voz", "imagen"]} onCambio={setMods} recargar={recargar} />
          {estado?.configurada && mods.voz && (
            <p className="text-[11px] text-accent">
              La narración la hará OpenAI en vez del modelo del navegador.
            </p>
          )}
          <label className="block">
            <span className="text-xs text-muted">Escenas: {escenas}</span>
            <input type="range" min={2} max={12} step={1} value={escenas}
              onChange={(e) => setEscenas(Number(e.target.value))} className="mt-1 w-full" />
          </label>

          <button
            onClick={generar}
            disabled={!estado?.configurada || prompt.trim().length < 4 || ocupado === "generar"}
            className="btn-brand w-full text-sm disabled:opacity-40"
          >
            {ocupado === "generar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ocupado === "generar" ? "Escribiendo…" : "Escribir el capítulo"}
          </button>

            <p className="text-[11px] text-muted">
              Escribe el montaje: escenas, tomas, narración y efectos. Si tienes
              modelo de imagen elegido, al abrirlo intentará dibujarlas solo;
              si no, saldrán como faltantes y las repones con «Buscar» o «Dibujar».
            </p>

          {aviso && <p className="text-sm text-accent">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
