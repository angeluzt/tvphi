import { nanoid } from "nanoid";
import type { EscenaCapa } from "@/lib/story/model";
import { revisar, esGuia, type Escena } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa } from "@/lib/lab/quitar-fondo";
import { listaDeExclusion } from "@/lib/lab/prompt-capa";
import { resolverSpritePlaneado } from "@/lib/lab/sprite-automatico";
import type { SpritePlaneado } from "@/lib/lab/plan-escena-viva";
import { blobDeUrlDeImagen } from "@/lib/lab/png-base64";
import { elegirLaminasVivas } from "@/lib/story/laminas-vivas";

// Generar las láminas 2.5D de una escena. Vive fuera del componente para
// poder usarlo en lote (todas las escenas marcadas) y desde el botón de una.
//
// Además del reparto en láminas, aquí se decide DOS cosas que antes se hacían
// después o no se hacían:
//   · cuáles de esas láminas respiran (el plan del capítulo lo pide con
//     palabras y aquí se casa con los nombres que puso el mapa);
//   · si la escena lleva actores animados encima, que se piden en la misma
//     llamada del mapa y se recortan como los del taller.
// Las dos son opcionales: sin plan, esto se comporta exactamente igual que
// antes y devuelve láminas quietas.

export interface LaminasHechas {
  capas: EscenaCapa[];
  camara?: unknown[];
  efectos?: unknown[];
  guias: number;
  fallos: string[];
  /** Ids de `capas` que conviene animar. Quien llame decide si las paga. */
  vivas: string[];
  /** Avisos de lo que se ha tenido que enderezar por el camino. */
  avisos: string[];
}

export async function generarLaminasEscena(opts: {
  prompt: string;
  formato: "16:9" | "9:16" | "1:1";
  nCapas: number;
  /**
   * Qué debería respirar, dicho por el plan del capítulo: «el agua», «las
   * antorchas». Se casa con los nombres que el mapa acabe poniendo.
   */
  pistasVivas?: string[];
  /** Cuántas láminas se pueden animar como mucho. 0 = ninguna. */
  topeVivas?: number;
  /** Pedirle además al mapa actores animados sobre las láminas. */
  conSprites?: boolean;
  calidad?: "low" | "medium" | "high";
  onPaso?: (s: string) => void;
  onGuardarImagen: (dataUrl: string, nombre: string) => Promise<string>;
}): Promise<LaminasHechas> {
  const idea = opts.prompt.trim();
  if (idea.length < 4) throw new Error("Escribe antes cómo es esta imagen: de ahí sale el mapa.");

  opts.onPaso?.("Escribiendo el mapa de la escena…");
  const rm = await fetch("/api/story/ia/lab/escena", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idea, formato: opts.formato, capas: opts.nCapas,
      viva: !!opts.conSprites,
    }),
  });
  const jm = await rm.json();
  if (!rm.ok) throw new Error(jm.error ?? "No se pudo escribir el mapa");
  const rev = revisar(jm.escena);
  if ("error" in rev) throw new Error(rev.error);
  const esc: Escena = rev.escena;

  const nuevas: EscenaCapa[] = [];
  const fallos: string[] = [];
  const avisos: string[] = Array.isArray(jm.avisos) ? jm.avisos.map(String) : [];
  const visibles = esc.layers.filter((c) => c.visible !== false && !esGuia(c));
  const guias = esc.layers.filter((c) => c.visible !== false && esGuia(c)).length;
  // Qué lámina del mapa acabó siendo qué capa: hace falta para colocar los
  // actores detrás de la que toque, y los ids no son los mismos.
  const porMapa = new Map<string, EscenaCapa>();

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
    const nueva: EscenaCapa = {
      id: nanoid(6), imageId: id, nombre: capa.name,
      depth: Math.max(0, Math.min(1, capa.depth)),
      escala: 1 + Math.max(0, Math.min(1, capa.depth)) * 0.12,
      opacidad: 1,
    };
    nuevas.push(nueva);
    porMapa.set(capa.id, nueva);
  }

  // Los actores, si el plan los pidió. Cada uno es UNA imagen: se dibuja su
  // hoja, se recorta y entra como capa con `spr` detrás de la lámina que dijo
  // el director. Uno que falle no tumba la escena; se dice y se sigue.
  if (opts.conSprites) {
    // La ruta del mapa ya devuelve los actores validados y con su ruta ajustada
    // a las superficies de la escena. Volver a leerlos aquí sería repetir esa
    // comprobación con menos información de la que tuvo el servidor.
    const pedidos: SpritePlaneado[] = Array.isArray(jm.sprites) ? jm.sprites : [];
    for (let i = 0; i < pedidos.length; i++) {
      const actor = pedidos[i];
      opts.onPaso?.(`Actor ${i + 1} de ${pedidos.length}: ${actor.nombre}…`);
      try {
        const montado = await resolverSpritePlaneado(actor, opts.calidad ?? "low");
        if (montado.aviso) avisos.push(montado.aviso);
        const blob = await blobDeUrlDeImagen(montado.url);
        const url = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(new Error("No se pudo leer la tira del actor."));
          r.readAsDataURL(blob);
        });
        const imageId = await opts.onGuardarImagen(url, montado.nombre);
        const capa: EscenaCapa = {
          id: nanoid(6), imageId, nombre: montado.nombre,
          depth: Math.max(0, Math.min(1, montado.depth)),
          escala: 1, opacidad: 1, spr: montado.spr,
        };
        // «despuesDe» es la lámina que queda detrás. Si esa lámina no llegó a
        // dibujarse, el actor va al frente: mejor verlo que perderlo.
        const detras = porMapa.get(montado.despuesDe);
        const donde = detras ? nuevas.indexOf(detras) + 1 : nuevas.length;
        nuevas.splice(donde, 0, capa);
      } catch (err) {
        fallos.push(`${actor.nombre}: ${(err as Error).message}`);
      }
    }
  }

  // Qué láminas respiran. Solo se proponen: animarlas cuesta cinco imágenes
  // cada una y esa decisión no se toma aquí a escondidas.
  const semanticas = new Map<string, string[]>();
  for (const capa of visibles) {
    const dibujada = porMapa.get(capa.id);
    if (dibujada) semanticas.set(dibujada.id, capa.objects.map((o) => o.semantic));
  }
  const vivas = elegirLaminasVivas(
    nuevas.filter((c) => !c.spr).map((c) => ({
      id: c.id, nombre: c.nombre, semanticas: semanticas.get(c.id),
    })),
    opts.pistasVivas ?? [],
    opts.topeVivas ?? 0,
  );

  return {
    capas: nuevas,
    camara: Array.isArray(jm.animacion) ? jm.animacion : undefined,
    efectos: Array.isArray(jm.efectos) ? jm.efectos : undefined,
    guias,
    fallos,
    vivas,
    avisos,
  };
}
