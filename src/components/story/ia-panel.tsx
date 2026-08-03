"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { ModelosIa } from "./modelos-ia";
import type { CupoHistorias } from "./story-app";

// Escribir un capítulo con IA.
// El usuario normal no ve claves ni modelos: solo el encargo.
// El admin (STORY_QUOTA_EXEMPT_EMAILS) sí puede elegir modelos.

export function IaPanel({
  onGenerado,
  cupo,
  onCupo,
}: {
  onGenerado: (name: string, project: unknown) => void;
  cupo?: CupoHistorias;
  onCupo?: (c: CupoHistorias) => void;
}) {
  const [estado, setEstado] = useState<{ configurada: boolean; admin?: boolean; models?: any } | null>(null);
  const [mods, setMods] = useState({ texto: "", imagen: "", voz: "", vozNombre: "alloy" });
  const [prompt, setPrompt] = useState("");
  const [escenas, setEscenas] = useState(6);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [recargar, setRecargar] = useState(0);

  const sinCupoIa = !!cupo && !cupo.exento && cupo.quedan <= 0;
  const esAdmin = !!estado?.admin;

  useEffect(() => {
    void fetch("/api/story/ia/clave")
      .then((r) => r.json())
      .then((j) => {
        setEstado(j);
        if (j?.models) {
          setMods((m) => ({
            ...m,
            texto: j.models.texto || m.texto,
            imagen: j.models.imagen || m.imagen,
            voz: j.models.voz || m.voz,
            vozNombre: j.models.vozNombre || m.vozNombre,
          }));
        }
        setRecargar((n) => n + 1);
      })
      .catch(() => null);
  }, []);

  async function generar() {
    setOcupado(true); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/capitulo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          escenas,
          // Solo el admin manda modelo; el servidor ignora el del resto.
          modelo: esAdmin ? (mods.texto.trim() || undefined) : undefined,
        }),
      });
      const j = await r.json();
      if (j.cupo) onCupo?.(j.cupo);
      if (!r.ok) throw new Error(j.error || "Error");
      onGenerado(j.name, j.project);
      setAviso(`Capítulo escrito ✓ · ${j.imagenes} escenas.`);
    } catch (e: any) { setAviso(e?.message ?? "No se pudo generar"); }
    setOcupado(false);
  }

  return (
    <div className="card p-4">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Escribir un capítulo con IA</span>
        {estado?.configurada
          ? <span className="chip bg-accent/15 text-accent">listo</span>
          : estado && <span className="chip bg-danger/15 text-danger">no disponible</span>}
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {cupo && !cupo.exento && (
            <p className={`text-[11px] ${sinCupoIa ? "text-danger" : "text-muted"}`}>
              {sinCupoIa
                ? `Has usado tus ${cupo.limite} historias con IA de hoy. Vuelve ${cupo.retryAt ? new Date(cupo.retryAt).toLocaleString() : "más tarde"}.`
                : `Te quedan ${cupo.quedan} de ${cupo.limite} historias con IA en 24 h.`}
            </p>
          )}

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

          {esAdmin && (
            <ModelosIa tareas={["texto", "voz", "imagen"]} onCambio={setMods} recargar={recargar} />
          )}

          <label className="block">
            <span className="text-xs text-muted">Escenas: {escenas}</span>
            <input type="range" min={2} max={12} step={1} value={escenas}
              onChange={(e) => setEscenas(Number(e.target.value))} className="mt-1 w-full" />
          </label>

          <button
            onClick={generar}
            disabled={!estado?.configurada || sinCupoIa || prompt.trim().length < 4 || ocupado}
            className="btn-brand w-full text-sm disabled:opacity-40"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ocupado ? "Escribiendo…" : "Escribir el capítulo"}
          </button>

          <p className="text-[11px] text-muted">
            La IA monta escenas, narración y efectos. Al abrirlo puede dibujar las
            imágenes y narrar solo; si falta algo, lo repones después.
          </p>

          {aviso && <p className="text-sm text-accent">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
