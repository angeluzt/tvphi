import { nanoid } from "nanoid";
import type { EscenaCapa } from "@/lib/story/model";
import { revisar, esGuia, type Escena } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa } from "@/lib/lab/quitar-fondo";
import { listaDeExclusion } from "@/lib/lab/prompt-capa";

// Generar las láminas 2.5D de una escena. Vive fuera del componente para
// poder usarlo en lote (todas las escenas marcadas) y desde el botón de una.

export interface LaminasHechas {
  capas: EscenaCapa[];
  camara?: unknown[];
  efectos?: unknown[];
  guias: number;
  fallos: string[];
}

export async function generarLaminasEscena(opts: {
  prompt: string;
  formato: "16:9" | "9:16" | "1:1";
  nCapas: number;
  onPaso?: (s: string) => void;
  onGuardarImagen: (dataUrl: string, nombre: string) => Promise<string>;
}): Promise<LaminasHechas> {
  const idea = opts.prompt.trim();
  if (idea.length < 4) throw new Error("Escribe antes cómo es esta imagen: de ahí sale el mapa.");

  opts.onPaso?.("Escribiendo el mapa de la escena…");
  const rm = await fetch("/api/story/ia/lab/escena", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, formato: opts.formato, capas: opts.nCapas }),
  });
  const jm = await rm.json();
  if (!rm.ok) throw new Error(jm.error ?? "No se pudo escribir el mapa");
  const rev = revisar(jm.escena);
  if ("error" in rev) throw new Error(rev.error);
  const esc: Escena = rev.escena;

  const nuevas: EscenaCapa[] = [];
  const fallos: string[] = [];
  const visibles = esc.layers.filter((c) => c.visible !== false && !esGuia(c));
  const guias = esc.layers.filter((c) => c.visible !== false && esGuia(c)).length;

  for (let i = 0; i < visibles.length; i++) {
    const capa = visibles[i];
    opts.onPaso?.(`Dibujando ${i + 1} de ${visibles.length}: ${capa.name}…`);
    const mapa = lienzoDeCapas(
      esc, [capa.id], i > 0, true, i === 0 ? "#101820" : undefined,
    ).toDataURL("image/png");
    let rec: Awaited<ReturnType<typeof prepararCapa>> | null = null;
    let falloCapa = "";
    for (let intento = 0; intento < 2; intento++) {
      if (intento) opts.onPaso?.(`Corrigiendo croma en ${i + 1} de ${visibles.length}: ${capa.name}…`);
      const rc = await fetch("/api/story/ia/lab/capa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapa, prompt: capa.ai?.prompt ?? capa.name,
          excluir: listaDeExclusion({
            capa: capa.name,
            otras: visibles.map((c) => c.name),
            extra: capa.ai?.exclude,
            esFondo: i === 0,
          }),
          estilo: esc.scene.style, escena: esc.scene.description,
          esFondo: i === 0, formato: opts.formato, corregirCroma: intento > 0,
        }),
      });
      const jc = await rc.json();
      if (!rc.ok) { falloCapa = jc.error ?? "no se pudo"; break; }
      rec = await prepararCapa(
        `data:image/png;base64,${jc.imagen}`,
        i === 0,
        i === 0 || jc.porCroma ? (jc.croma ?? undefined) : undefined,
      );
      if (!rec.problema) break;
      falloCapa = rec.problema === "croma-en-fondo"
        ? "la IA dejó el magenta técnico dentro del fondo"
        : "quedaron residuos de magenta después del recorte";
    }
    if (!rec || rec.problema) {
      fallos.push(`${capa.name}: ${falloCapa || "no se pudo limpiar el fondo"}`);
      continue;
    }
    const id = await opts.onGuardarImagen(rec.url, capa.name);
    nuevas.push({
      id: nanoid(6), imageId: id, nombre: capa.name,
      depth: Math.max(0, Math.min(1, capa.depth)),
      escala: 1 + Math.max(0, Math.min(1, capa.depth)) * 0.12,
      opacidad: 1,
    });
  }

  return {
    capas: nuevas,
    camara: Array.isArray(jm.animacion) ? jm.animacion : undefined,
    efectos: Array.isArray(jm.efectos) ? jm.efectos : undefined,
    guias,
    fallos,
  };
}
