import type { AccionSprite } from "./biblioteca";
import type { Escena, SuperficieNavegable, TipoSuperficie } from "./escena";
import type { PasoRutaSprite, SpriteEnCapa } from "./sprite-capa";

const TIPOS = new Set<TipoSuperficie>(["suelo", "escalera", "agua", "aire", "libre"]);
type AccionSuperficie = NonNullable<SuperficieNavegable["acciones"]>[number];
const ACCIONES = new Set<AccionSuperficie>(["caminar", "correr", "volar", "flotar", "nadar", "caer", "otro"]);
const acotar = (n: number, min = -0.5, max = 1.5) => Math.max(min, Math.min(max, n));
const num = (v: unknown, d: number) => Number.isFinite(Number(v)) ? Number(v) : d;

/** Valida las superficies escritas por IA y deriva apoyos sencillos del mapa antiguo. */
export function superficiesDeEscena(escena: Escena): SuperficieNavegable[] {
  const explicitas = Array.isArray(escena.navegacion?.superficies)
    ? escena.navegacion!.superficies.slice(0, 24).flatMap((s: any, i): SuperficieNavegable[] => {
      if (!s || typeof s !== "object" || !Array.isArray(s.puntos) || s.puntos.length < 2) return [];
      const puntos = s.puntos.slice(0, 16).flatMap((p: any): [number, number][] =>
        Array.isArray(p) && p.length >= 2
          ? [[acotar(num(p[0], 0)), acotar(num(p[1], 0.5))]]
          : [],
      );
      if (puntos.length < 2) return [];
      return [{
        id: String(s.id || `superficie-${i + 1}`).slice(0, 80),
        tipo: TIPOS.has(s.tipo) ? s.tipo : "libre",
        ...(Array.isArray(s.acciones)
          ? { acciones: s.acciones.filter((a: any) => ACCIONES.has(a)).slice(0, 8) }
          : {}),
        puntos,
        ...(Number.isFinite(Number(s.depth)) ? { depth: Math.max(0, Math.min(1, Number(s.depth))) } : {}),
        ...(typeof s.despuesDe === "string" ? { despuesDe: s.despuesDe.slice(0, 80) } : {}),
      }];
    })
    : [];
  if (explicitas.length) return explicitas;

  return escena.layers.flatMap((capa) => capa.objects.flatMap((o): SuperficieNavegable[] => {
    if (!["floor", "stairs", "water", "terrain"].includes(o.semantic)) return [];
    const tipo: TipoSuperficie = o.semantic === "stairs" ? "escalera"
      : o.semantic === "water" ? "agua" : "suelo";
    const acciones: AccionSuperficie[] = tipo === "agua" ? ["nadar", "flotar"] : ["caminar", "correr"];
    if (Array.isArray(o.points) && o.points.length >= 2) {
      return [{ id: `auto-${capa.id}-${o.id}`, tipo, puntos: o.points.slice(0, 16), acciones, depth: capa.depth, despuesDe: capa.id }];
    }
    if (typeof o.x === "number" && typeof o.y === "number" && typeof o.w === "number") {
      const y2 = tipo === "escalera" && typeof o.h === "number" ? o.y + o.h : o.y;
      return [{
        id: `auto-${capa.id}-${o.id}`,
        tipo,
        puntos: [[acotar(o.x), acotar(o.y)], [acotar(o.x + o.w), acotar(y2)]],
        acciones,
        depth: capa.depth,
        despuesDe: capa.id,
      }];
    }
    return [];
  }));
}

/** Altura de la polilínea en X; fuera de su rango usa el extremo más cercano. */
export function yEnSuperficie(superficie: SuperficieNavegable, x: number): number {
  const ps = superficie.puntos;
  let mejor = { distancia: Infinity, y: ps[0]?.[1] ?? 0.5 };
  for (let i = 1; i < ps.length; i++) {
    const [ax, ay] = ps[i - 1];
    const [bx, by] = ps[i];
    const min = Math.min(ax, bx), max = Math.max(ax, bx);
    const px = Math.max(min, Math.min(max, x));
    const t = Math.abs(bx - ax) < 1e-6 ? 0 : (px - ax) / (bx - ax);
    const distancia = Math.abs(px - x);
    if (distancia < mejor.distancia) mejor = { distancia, y: ay + (by - ay) * t };
  }
  return acotar(mejor.y);
}

export function elegirSuperficie(
  superficies: SuperficieNavegable[],
  id: unknown,
  accion: AccionSprite,
  x: number,
  y: number,
) {
  const exacta = typeof id === "string" ? superficies.find((s) => s.id === id) : undefined;
  const compatible = (s: SuperficieNavegable) => !s.acciones?.length
    || s.acciones.includes(accion as any)
    || (["quieto", "girar"].includes(accion) && ["suelo", "escalera", "libre"].includes(s.tipo));
  if (exacta && compatible(exacta)) return exacta;
  const compatibles = superficies.filter(compatible);
  return compatibles.reduce<SuperficieNavegable | undefined>((mejor, s) => {
    if (!mejor) return s;
    return Math.abs(yEnSuperficie(s, x) - y) < Math.abs(yEnSuperficie(mejor, x) - y) ? s : mejor;
  }, undefined);
}

/** Ajusta una ruta a su superficie y orienta automáticamente cada tramo lateral. */
export function ajustarSpriteALaEscena(
  sprite: SpriteEnCapa,
  superficie?: SuperficieNavegable,
): SpriteEnCapa {
  const spr: SpriteEnCapa = { ...sprite };
  if (superficie) {
    spr.superficieId = superficie.id;
    spr.y = yEnSuperficie(superficie, spr.x);
    if (spr.trayectoria) spr.trayectoria = {
      ...spr.trayectoria,
      y: yEnSuperficie(superficie, spr.trayectoria.x),
    };
  }

  const baseDerecha = spr.direccionBase !== "izquierda";
  let x = spr.x;
  const orientar = (destino: number, paso?: PasoRutaSprite) => {
    if (spr.vista !== "lateral" || Math.abs(destino - x) < 0.005) return paso;
    const espejo = (destino > x) !== baseDerecha;
    return paso ? { ...paso, espejo } : espejo;
  };
  if (spr.trayectoria) {
    const espejo = orientar(spr.trayectoria.x);
    if (typeof espejo === "boolean") spr.espejo = espejo;
  }
  if (spr.ruta?.pasos.length) {
    const pasos = spr.ruta.pasos.map((paso) => {
      if (paso.tipo !== "mover") return paso;
      const destino = paso.x ?? x;
      const ajustado = orientar(destino, paso) as PasoRutaSprite;
      x = destino;
      return {
        ...ajustado,
        ...(superficie ? { y: yEnSuperficie(superficie, destino) } : {}),
      };
    });
    const primero = pasos.find((p) => p.tipo === "mover" && typeof p.espejo === "boolean");
    if (primero && typeof primero.espejo === "boolean") spr.espejo = primero.espejo;
    spr.ruta = { ...spr.ruta, pasos };
  }
  return spr;
}
