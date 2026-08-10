"use client";

import { useRef, useState } from "react";
import {
  Copy, Download, Image as ImageIcon, Loader2, RefreshCw, Upload, Wand2, ClipboardCopy,
} from "lucide-react";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { bajar, lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa } from "@/lib/lab/quitar-fondo";
import { esGuia, revisar, type Escena } from "@/lib/lab/escena";

export type ResultadoCapaHerramienta = {
  url: string;
  via?: "transparente" | "croma" | "opaca";
  vacio?: number;
};

/**
 * Arreglar UNA capa del montaje: renombrar, sustituir imagen, regenerar con IA
 * (mismo estilo/mapa), exportar PNG/JSON/prompt o copiar al portapapeles.
 */
export function HerramientasCapa({
  nombre,
  clave,
  esSprite,
  esFondo,
  formato,
  escena,
  puedeIa,
  obtenerPng,
  onNombre,
  onImagen,
}: {
  nombre: string;
  /** Id estable del mapa (capa.clave). */
  clave: string;
  esSprite: boolean;
  esFondo: boolean;
  formato: "16:9" | "9:16" | "1:1";
  escena?: unknown;
  puedeIa?: boolean;
  /** PNG de la capa activa (tira completa si es sprite). */
  obtenerPng: () => Promise<Blob | null>;
  onNombre: (n: string) => void;
  onImagen: (r: ResultadoCapaHerramienta) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  const mapa = escenaRevisada(escena);
  const capaMapa = mapa?.layers.find((c) => c.id === clave);
  const promptMapa = capaMapa?.ai?.prompt ?? "";
  const estilo = mapa?.scene.style ?? "";
  const desc = mapa?.scene.description ?? "";

  async function cargarArchivo(file: File | null) {
    if (!file) return;
    setBusy("Cargando imagen…"); setNota(null);
    try {
      const dataUrl = await leerArchivo(file);
      const rec = await prepararCapa(dataUrl, esFondo);
      if (rec.problema) throw new Error(
        rec.problema === "croma-en-fondo"
          ? "La imagen de fondo tenía magenta técnico"
          : "No se pudo limpiar el fondo de esta imagen",
      );
      onImagen({ url: rec.url, via: rec.via, vacio: rec.vacio });
      setNota("Imagen sustituida. El resto de capas no se tocó.");
    } catch (e) { setNota((e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function exportarPng() {
    setBusy("Exportando…"); setNota(null);
    try {
      const blob = await obtenerPng();
      if (!blob) throw new Error("No hay imagen en esta capa");
      bajar(blob, `${slug(nombre)}.png`);
      setNota("PNG de la capa descargado.");
    } catch (e) { setNota((e as Error).message); }
    finally { setBusy(null); }
  }

  async function copiarImagen() {
    setBusy("Copiando imagen…"); setNota(null);
    try {
      const blob = await obtenerPng();
      if (!blob) throw new Error("No hay imagen en esta capa");
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        bajar(blob, `${slug(nombre)}.png`);
        setNota("Este navegador no copia imágenes: se descargó el PNG para pegarlo donde quieras.");
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNota("Imagen en el portapapeles. Pégala en ChatGPT u otra IA.");
    } catch (e) {
      try {
        const blob = await obtenerPng();
        if (blob) {
          bajar(blob, `${slug(nombre)}.png`);
          setNota("No se pudo copiar: se descargó el PNG como alternativa.");
          return;
        }
      } catch { /* ignore */ }
      setNota((e as Error).message);
    } finally { setBusy(null); }
  }

  async function copiarTexto(texto: string, ok: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setNota(ok);
    } catch {
      setNota("No se pudo copiar. Selecciona el texto a mano.");
    }
  }

  function metaJson() {
    return JSON.stringify({
      id: clave,
      nombre,
      prompt: prompt.trim() || promptMapa || null,
      exclude: capaMapa?.ai?.exclude ?? null,
      estilo: estilo || null,
      escena: desc || null,
      depth: capaMapa?.depth ?? null,
      esFondo,
      formato,
      notas: "Pásale este JSON + el PNG de la capa a una IA externa. Mantén estilo y geometría del mapa.",
    }, null, 2);
  }

  async function regenerar() {
    if (!puedeIa) {
      setNota("La IA del lab no está disponible en este momento.");
      return;
    }
    if (!mapa || !capaMapa) {
      setNota("Hace falta el mapa de la escena (pestaña 1) para regenerar con congruencia.");
      return;
    }
    const texto = (prompt.trim() || promptMapa).trim();
    if (texto.length < 3) {
      setNota("Escribe qué quieres dibujar en esta capa.");
      return;
    }
    setBusy("Regenerando con IA…"); setNota(null);
    try {
      const visibles = mapa.layers.filter((c) => c.visible !== false && !esGuia(c));
      const idx = visibles.findIndex((c) => c.id === capaMapa.id);
      const fondo = idx <= 0;
      const guia = lienzoDeCapas(
        mapa, [capaMapa.id], !fondo, true, fondo ? "#101820" : undefined,
      ).toDataURL("image/png");

      let rec: Awaited<ReturnType<typeof prepararCapa>> | null = null;
      let fallo = "";
      for (let intento = 0; intento < 2; intento++) {
        if (intento) setBusy("Corrigiendo croma…");
        const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/capa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapa: guia,
            prompt: texto,
            excluir: capaMapa.ai?.exclude,
            estilo,
            escena: desc,
            esFondo: fondo,
            formato,
            corregirCroma: intento > 0,
          }),
        });
        if (!r.ok) { fallo = j.error ?? "no se pudo regenerar"; break; }
        rec = await prepararCapa(
          `data:image/png;base64,${j.imagen}`,
          fondo,
          fondo || j.porCroma ? (j.croma ?? undefined) : undefined,
        );
        if (!rec.problema) break;
        fallo = rec.problema === "croma-en-fondo"
          ? "magenta en el fondo"
          : "residuos de croma";
      }
      if (!rec || rec.problema) throw new Error(fallo || "No se pudo regenerar la capa");
      onImagen({ url: rec.url, via: rec.via, vacio: rec.vacio });
      setNota("Capa regenerada. Las demás capas se conservan.");
    } catch (e) { setNota((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-2 rounded-md border border-brand/25 bg-brand/5 p-2">
      <p className="text-[10px] font-medium text-brand">Arreglar / exportar esta capa</p>
      <label className="block text-[10px] text-muted">
        Nombre
        <input
          className="input mt-0.5 w-full py-1 text-[11px]"
          value={nombre}
          onChange={(e) => onNombre(e.target.value.slice(0, 80))}
          disabled={!!busy}
        />
      </label>

      {!esSprite && (
        <>
          <label className="block text-[10px] text-muted">
            Prompt para regenerar (o para copiar a otra IA)
            <textarea
              className="input mt-0.5 min-h-[4rem] w-full py-1 text-[11px]"
              placeholder={promptMapa || "Ej: ocean surface seen from above, deep blue water, soft ripples…"}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 4000))}
              disabled={!!busy}
            />
          </label>
          {promptMapa && !prompt && (
            <p className="text-[9px] text-muted truncate" title={promptMapa}>
              Del mapa: {promptMapa}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <button type="button" disabled={!!busy || !puedeIa} onClick={() => void regenerar()}
              className="btn-ghost px-2 py-1 text-[10px] disabled:opacity-40"
              title="Misma geometría del mapa + estilo de la escena">
              {busy?.startsWith("Regen") || busy?.startsWith("Corrig")
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Wand2 className="h-3.5 w-3.5 text-accent" />}
              Regenerar con IA
            </button>
            <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
              className="btn-ghost px-2 py-1 text-[10px]">
              <Upload className="h-3.5 w-3.5 text-accent" /> Sustituir imagen
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => void cargarArchivo(e.target.files?.[0] ?? null)} />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={!!busy} onClick={() => void exportarPng()}
          className="btn-ghost px-2 py-1 text-[10px]">
          <Download className="h-3.5 w-3.5" /> PNG
        </button>
        <button type="button" disabled={!!busy} onClick={() => void copiarImagen()}
          className="btn-ghost px-2 py-1 text-[10px]">
          <ImageIcon className="h-3.5 w-3.5" /> Copiar imagen
        </button>
        <button type="button" disabled={!!busy}
          onClick={() => void copiarTexto(prompt.trim() || promptMapa || nombre, "Prompt copiado.")}
          className="btn-ghost px-2 py-1 text-[10px]">
          <Copy className="h-3.5 w-3.5" /> Prompt
        </button>
        <button type="button" disabled={!!busy}
          onClick={() => void copiarTexto(metaJson(), "JSON de la capa copiado.")}
          className="btn-ghost px-2 py-1 text-[10px]">
          <ClipboardCopy className="h-3.5 w-3.5" /> JSON capa
        </button>
        {estilo && (
          <button type="button" disabled={!!busy}
            onClick={() => void copiarTexto(estilo, "Estilo de la escena copiado.")}
            className="btn-ghost px-2 py-1 text-[10px]">
            <RefreshCw className="h-3.5 w-3.5" /> Estilo
          </button>
        )}
      </div>
      <p className="text-[9px] leading-snug text-muted">
        Regenerar usa el mapa de color de esta capa y el estilo común, para que encaje con el resto.
        PNG/JSON sirven para pegar el arreglo en ChatGPT u otra IA y volver a «Sustituir imagen».
      </p>
      {(busy || nota) && (
        <p className={`text-[10px] ${busy ? "text-muted" : "text-fg"}`}>
          {busy ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{busy}</> : nota}
        </p>
      )}
    </div>
  );
}

function escenaRevisada(raw: unknown): Escena | null {
  if (!raw) return null;
  const r = revisar(raw);
  return "escena" in r ? r.escena : null;
}

function leerArchivo(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

function slug(s: string) {
  return s.replace(/[^\w\-. ]+/g, "").trim().slice(0, 40) || "capa";
}
