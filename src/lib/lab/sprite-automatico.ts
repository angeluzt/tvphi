"use client";

import { pedirJson, pedirJsonCrudo } from "@/lib/pedir-json";
import { urlSprite, type SpriteMeta } from "./biblioteca";
import type { SpriteEnCapa } from "./sprite-capa";
import type { SpritePlaneado } from "./plan-escena-viva";
import { cargarImagen } from "./quitar-fondo";
import { celdasSpriteEnRejilla, cortarHoja, nombreSprite, tiraDeFotogramas } from "./sprites";

export interface SpriteMontado {
  id: string;
  nombre: string;
  url: string;
  despuesDe: string;
  depth: number;
  spr: SpriteEnCapa;
  fuente: "biblioteca" | "generado";
  aviso?: string;
}

const base64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result).replace(/^data:[^,]+,/, ""));
  lector.onerror = () => reject(new Error("No se pudo preparar la tira del sprite."));
  lector.readAsDataURL(blob);
});

/** Reutiliza un actor existente o fabrica, recorta y guarda el que falte. */
export async function resolverSpritePlaneado(
  plan: SpritePlaneado,
  calidad: "low" | "medium" | "high" = "low",
): Promise<SpriteMontado> {
  if (plan.biblioteca) {
    return {
      id: plan.id,
      nombre: plan.biblioteca.nombre,
      url: urlSprite(plan.biblioteca.id),
      despuesDe: plan.despuesDe,
      depth: plan.depth,
      spr: {
        ...plan.spr,
        id: plan.biblioteca.id,
        fotogramas: plan.biblioteca.fotogramas,
        fps: plan.biblioteca.fps,
      },
      fuente: "biblioteca",
    };
  }

  const { datos: generado, respuesta } = await pedirJsonCrudo("/api/story/ia/lab/sprite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      que: plan.que,
      fotogramas: plan.spr.fotogramas,
      forma: plan.forma,
      vista: plan.vista,
      direccion: plan.direccion,
      accion: plan.accion,
      calidad,
    }),
  });
  if (!respuesta.ok) throw new Error(generado?.error || "No se pudo generar el sprite.");

  const dataUrl = `data:image/png;base64,${generado.imagen}`;
  const imagen = await cargarImagen(dataUrl);
  const forma = (generado.forma ?? plan.forma) as "tira" | "columna";
  const esperados = Number(generado.fotogramas ?? plan.spr.fotogramas);
  const columnas = Number(generado.columnas) || (forma === "columna" ? 1 : esperados);
  const filas = Number(generado.filas) || (forma === "columna" ? esperados : 1);
  const cortada = await cortarHoja({
    dataUrl,
    fotogramas: esperados,
    forma,
    croma: generado.croma,
    celdas: celdasSpriteEnRejilla(imagen.naturalWidth, imagen.naturalHeight, esperados, { columnas, filas }),
  });
  if (!cortada.fotogramas.length) {
    throw new Error("La hoja del sprite salió sin ningún fotograma recortable.");
  }

  let tira: Awaited<ReturnType<typeof tiraDeFotogramas>>;
  try {
    tira = await tiraDeFotogramas(cortada.fotogramas);
  } finally {
    cortada.fotogramas.forEach((f) => {
      if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
    });
  }
  const guardado = await pedirJson("/api/story/lab/sprites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: plan.nombre.slice(0, 60) || nombreSprite(plan.que),
      que: plan.que,
      fotogramas: tira.fotogramas,
      fps: plan.spr.fps,
      vista: plan.vista,
      direccion: plan.direccion,
      accion: plan.accion,
      anclaje: plan.anclaje,
      ancho: tira.ancho,
      alto: tira.alto,
      tira: await base64(tira.blob),
    }),
  });
  const meta = guardado?.sprite as SpriteMeta | undefined;
  if (!meta?.id) throw new Error("El sprite se recortó, pero no se pudo guardar en la biblioteca.");

  return {
    id: plan.id,
    nombre: meta.nombre,
    url: urlSprite(meta.id),
    despuesDe: plan.despuesDe,
    depth: plan.depth,
    spr: {
      ...plan.spr,
      id: meta.id,
      fotogramas: meta.fotogramas,
      fps: meta.fps,
    },
    fuente: "generado",
    ...(cortada.descartados
      ? { aviso: `${plan.nombre}: ${cortada.descartados} fotogramas vacíos se descartaron.` }
      : {}),
  };
}
