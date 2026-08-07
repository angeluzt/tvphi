"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { ModelosIa } from "./modelos-ia";
import { ASPECTS, type Aspect } from "@/lib/story/model";
import type { CupoHistorias } from "./story-app";

// Crear una historia con IA.
//
// Es lo primero de la pantalla y viene ABIERTO: es a lo que entra casi todo el
// mundo, y estaba plegado al final de la página. Un panel plegado abajo del
// todo no lo encuentra nadie.
//
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
  // La forma del vídeo se elige AQUÍ. Antes no se preguntaba y salía siempre
  // apaisado, así que para TikTok o Reels no había manera: había que sacar una
  // copia después y rehacer todos los encuadres.
  const [formato, setFormato] = useState<Aspect>("16:9");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);
  const [recargar, setRecargar] = useState(0);

  const sinCupoIa = !!cupo && !cupo.exento && cupo.quedan <= 0;
  const esAdmin = !!estado?.admin;

  useEffect(() => {
    void fetch("/api/story/ia/clave")
      .then((r) => r.json())
      .then((j) => {
        setEstado(j);
        // El cupo de aquí es el de AHORA. El que llegó por propiedades se pintó
        // al cargar la página, y si el admin sube el límite mientras tanto,
        // quien estaba bloqueado se quedaba viendo el número viejo.
        if (j?.cupo) onCupo?.(j.cupo);
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
          formato,
          // Solo el admin manda modelo; el servidor ignora el del resto.
          modelo: esAdmin ? (mods.texto.trim() || undefined) : undefined,
        }),
      });
      const j = await r.json();
      if (j.cupo) onCupo?.(j.cupo);
      if (!r.ok) throw new Error(j.error || "Error");
      onGenerado(j.name, j.project);
      // Si se ha enderezado la música, se dice: el usuario tiene que poder
      // entender por qué su capítulo no suena como el JSON que pidió.
      const arreglos: string[] = [];
      if (j.musica?.bajadas) arreglos.push("música bajada, tapaba la voz");
      if (j.musica?.movidas) arreglos.push(`${j.musica.movidas} música a su escena`);
      setAviso(`Listo · ${j.imagenes} escenas`
        + (arreglos.length ? ` · ${arreglos.join(" · ")}` : ""));
    } catch (e: any) { setAviso(e?.message ?? "No se pudo generar"); }
    setOcupado(false);
  }

  return (
    <div className="card p-4">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={abierto}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Crear historia con IA</span>
          <span className="block text-[11px] text-muted">
            Cuéntale la idea y monta las escenas, la narración y los efectos.
          </span>
        </span>
        {estado?.configurada
          ? <span className="chip bg-accent/15 text-accent">listo</span>
          : estado && <span className="chip bg-danger/15 text-danger">no disponible</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {cupo && !cupo.exento && (
            <p className={`text-[11px] ${sinCupoIa ? "text-danger" : "text-muted"}`}>
              {sinCupoIa
                ? `Sin historias por hoy. Vuelve ${cupo.retryAt ? new Date(cupo.retryAt).toLocaleString() : "más tarde"}.`
                : `Te quedan ${cupo.quedan} de ${cupo.limite} hoy.`}
            </p>
          )}

          <div>
            <span className="text-xs text-muted">De qué va</span>
            <textarea
              className="input mt-1 h-24 w-full text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="De qué va"
              placeholder="Un pueblo que quedó bajo un embalse y reaparece con la sequía. Tono documental, inquietante, sin música alegre."
            />
          </div>

          {esAdmin && (
            <ModelosIa tareas={["texto", "voz", "imagen"]} onCambio={setMods} recargar={recargar} />
          )}

          <div>
            <span className="text-xs text-muted">Dónde se va a ver</span>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setFormato(a.id)}
                  title={`${a.label} · ${a.corto}`}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] leading-tight ${
                    formato === a.id
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted hover:border-brand/60 hover:text-fg"
                  }`}
                >
                  <span
                    className="rounded-sm border border-current"
                    style={{ width: a.ratio >= 1 ? 22 : 22 * a.ratio, height: a.ratio >= 1 ? 22 / a.ratio : 22 }}
                  />
                  <span className="font-medium">{a.id}</span>
                  <span className="text-[9px]">{a.corto.split(",")[0]}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Se decide ahora: los encuadres se hacen para esta forma.
            </p>
          </div>

          <label className="block">
            <span className="text-xs text-muted">Escenas: {escenas}</span>
            <input type="range" min={2} max={12} step={1} value={escenas}
              onChange={(e) => setEscenas(Number(e.target.value))} className="mt-1 w-full" />
          </label>

          {/*
            El botón NO se apaga por el cupo, a propósito.

            Antes sí, y dejaba la pantalla muerta: al agotarlo no se podía ni
            intentar, y como el cupo solo se refrescaba al responder una
            petición, no había forma de enterarse de que el admin había subido
            el límite. Solo se salía recargando la página entera, y nada lo
            decía.

            Quien manda es el servidor, que corta ANTES de llamar a OpenAI, así
            que un intento de más no cuesta nada y además trae el número bueno.
          */}
          <button
            onClick={generar}
            disabled={!estado?.configurada || prompt.trim().length < 4 || ocupado}
            className="btn-brand w-full text-sm disabled:opacity-40"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ocupado ? "Escribiendo…" : "Crear historia"}
          </button>

          <p className="text-[11px] text-muted">
            Se abre en el editor y se puede cambiar todo.
          </p>

          {aviso && <p className="text-sm text-accent">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
