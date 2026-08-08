import type { SpriteMeta } from "./biblioteca";
import { esGuia, type Escena } from "./escena";
import { normalizarSprite, type SpriteEnCapa } from "./sprite-capa";

export type VistaSprite = "lateral" | "frontal" | "trasera" | "superior" | "libre";
export type FormaHojaSprite = "tira" | "columna";

/** Un actor animado decidido por el director global. */
export interface SpritePlaneado {
  id: string;
  nombre: string;
  /** Descripción visual completa; también se guarda para reutilizarlo después. */
  que: string;
  vista: VistaSprite;
  forma: FormaHojaSprite;
  /** Capa tras la que se inserta. Permite poner actores detrás del primer plano. */
  despuesDe: string;
  depth: number;
  spr: SpriteEnCapa;
  /** Presente cuando no hace falta volver a pagar una generación. */
  biblioteca?: SpriteMeta;
}

export interface PlanSprites {
  sprites: SpritePlaneado[];
  avisos: string[];
}

const VISTAS = new Set<VistaSprite>(["lateral", "frontal", "trasera", "superior", "libre"]);
const FORMAS = new Set<FormaHojaSprite>(["tira", "columna"]);
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const numero = (v: unknown, defecto: number) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return defecto;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : defecto;
};
const texto = (v: unknown, defecto: string, max = 400) =>
  (typeof v === "string" && v.trim() ? v.trim() : defecto).slice(0, max);
const slug = (v: string, defecto: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || defecto;

/**
 * Endereza la parte de sprites del JSON de IA antes de que llegue al montaje.
 *
 * Es deliberadamente tolerante: una ruta demasiado larga se recorta, las
 * posiciones se acotan y un id inexistente de biblioteca pasa a generación.
 * Perder toda una escena por un solo campo creativo sería mucho peor.
 */
export function leerSpritesPlaneados(
  crudo: unknown,
  escena: Escena,
  catalogo: SpriteMeta[],
): PlanSprites {
  const raiz = crudo as any;
  const pedidos = Array.isArray(raiz?.sprites) ? raiz.sprites.slice(0, 6) : [];
  const catalogoPorId = new Map(catalogo.map((s) => [s.id, s]));
  const capas = escena.layers.filter((c) => c.visible !== false && !esGuia(c));
  const idsCapa = new Set(capas.map((c) => c.id));
  const avisos: string[] = [];
  const ids = new Set<string>();

  if (Array.isArray(raiz?.sprites) && raiz.sprites.length > 6) {
    avisos.push("El director pidió más de 6 sprites; se conservaron los primeros 6 para limitar costo y ruido visual.");
  }

  const sprites = pedidos.flatMap((p: any, indice: number): SpritePlaneado[] => {
    if (!p || typeof p !== "object") {
      avisos.push(`Se ignoró el sprite ${indice + 1}: no era un objeto.`);
      return [];
    }

    const baseNombre = texto(p.nombre ?? p.name, `Sprite ${indice + 1}`, 60);
    let id = slug(texto(p.id, baseNombre), `sprite-${indice + 1}`);
    if (ids.has(id)) id = `${id}-${indice + 1}`;
    ids.add(id);

    const bibliotecaId = texto(p.bibliotecaId ?? p.biblioteca_id, "", 120);
    const biblioteca = bibliotecaId ? catalogoPorId.get(bibliotecaId) : undefined;
    if (bibliotecaId && !biblioteca) {
      avisos.push(`${baseNombre}: «${bibliotecaId}» ya no está en la biblioteca; se generará de nuevo.`);
    }

    const depth = acotar(numero(p.depth, 0.55), 0, 1);
    let despuesDe = texto(p.despuesDe ?? p.despues_de, "", 80);
    if (!idsCapa.has(despuesDe)) {
      const cercana = capas.reduce<(typeof capas)[number] | undefined>((mejor, capa) =>
        !mejor || Math.abs(capa.depth - depth) < Math.abs(mejor.depth - depth) ? capa : mejor,
      undefined);
      despuesDe = cercana?.id ?? capas[0]?.id ?? "";
      if (p.despuesDe || p.despues_de) {
        avisos.push(`${baseNombre}: la capa indicada no existe; se colocó junto a «${cercana?.name ?? "el fondo"}».`);
      }
    }

    const fotogramas = biblioteca?.fotogramas
      ?? Math.round(acotar(numero(p.fotogramas, 6), 2, 12));
    const fps = biblioteca?.fps ?? Math.round(acotar(numero(p.fps, 10), 1, 60));
    const spr = normalizarSprite({
      id: biblioteca?.id,
      fotogramas,
      fps,
      x: p.x,
      y: p.y,
      alto: p.alto,
      espacio: p.espacio === "capa" ? "capa" : "pantalla",
      sincronizar: p.sincronizar !== false,
      espejo: p.espejo,
      ruta: p.ruta,
      trayectoria: p.trayectoria,
    });
    if (!spr) {
      avisos.push(`${baseNombre}: no tenía fotogramas válidos y se ignoró.`);
      return [];
    }

    const vista = VISTAS.has(p.vista) ? p.vista as VistaSprite : "lateral";
    const forma = FORMAS.has(p.forma) ? p.forma as FormaHojaSprite : "tira";
    return [{
      id,
      nombre: biblioteca?.nombre ?? baseNombre,
      que: texto(p.que ?? p.prompt, biblioteca?.que ?? baseNombre),
      vista,
      forma,
      despuesDe,
      depth,
      spr,
      ...(biblioteca ? { biblioteca } : {}),
    }];
  });

  return { sprites, avisos };
}
