import { nanoid } from "nanoid";
import type { EscenaCapa } from "@/lib/story/model";
import { revisar, esGuia, type Escena } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa } from "@/lib/lab/quitar-fondo";
import { listaDeExclusion } from "@/lib/lab/prompt-capa";
import { resolverSpritePlaneado } from "@/lib/lab/sprite-automatico";
import type { SpritePlaneado } from "@/lib/lab/plan-escena-viva";
import { blobDeUrlDeImagen } from "@/lib/lab/png-base64";
import { elegirLaminasVivas, laminasPedidasNoRepintables } from "@/lib/story/laminas-vivas";
import { cargarImagen } from "@/lib/lab/quitar-fondo";

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

/**
 * A partir de qué punto una lámina cuenta como «foto entera» y no como recorte.
 *
 * Medido sobre un caso real: el fondo aplanado daba 100% opaco y las tres
 * láminas recortadas de la misma escena, entre un 18% y un 27%. No hay nada
 * cerca del medio, así que el listón puede estar alto sin discutir con nadie.
 */
const OPACA_DESDE = 0.97;

/**
 * Qué fracción de la lámina tiene algo pintado.
 *
 * Se muestrea uno de cada cuatro píxeles en cada eje —dieciseisava parte del
 * total— porque para distinguir un 100% de un 20% no hace falta contarlos
 * todos, y esto corre por cada lámina de cada escena.
 */
async function fraccionOpaca(dataUrl: string): Promise<number> {
  try {
    const img = await cargarImagen(dataUrl);
    const w = Math.max(1, Math.round(img.naturalWidth / 4));
    const h = Math.max(1, Math.round(img.naturalHeight / 4));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    if (!c) return 0;
    c.drawImage(img, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    let opacos = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) opacos++;
    return opacos / (w * h);
  } catch {
    // Sin poder medirla se trata como recorte: una lámina quieta de más es
    // mejor que una escena tapada por un rectángulo opaco.
    return 0;
  }
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
  // Qué láminas son foto entera (repintables) y cuáles recorte, por imageId.
  const opacas = new Map<string, boolean>();

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
    // Se mide AQUÍ, con la PNG ya recortada delante: es el único momento en el
    // que se sabe de verdad si esta lámina es una foto entera o un recorte, y
    // de eso depende si se puede repintar para animarla.
    opacas.set(id, await fraccionOpaca(rec.url) >= OPACA_DESDE);
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
  const candidatas = nuevas.filter((c) => !c.spr).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    semanticas: semanticas.get(c.id),
    opaca: opacas.get(c.imageId) === true,
  }));
  const pistas = opts.pistasVivas ?? [];
  const vivas = elegirLaminasVivas(candidatas, pistas, opts.topeVivas ?? 0);

  // Lo que el plan pidió animar y resultó ser un recorte. Se dice con nombre y
  // apellido, y se dice QUÉ hacer en su lugar: callarlo fue lo que dejó una
  // escena entera sin movimiento y sin ninguna pista de por qué.
  if (opts.topeVivas) {
    for (const nombre of laminasPedidasNoRepintables(candidatas, pistas)) {
      avisos.push(
        `«${nombre}» no se puede animar repintándola: es un recorte con transparencia, `
        + "y repintarlo lo devolvería opaco tapando lo que tiene detrás. "
        + "Para que se mueva algo de esa lámina —fuego, faroles, humo— ponle un efecto del catálogo anclado: se anima solo y no cuesta ninguna imagen.",
      );
    }
  }

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
