"use client";

import { pedirJson, pedirJsonCrudo } from "@/lib/pedir-json";
import { urlSprite, type SpriteMeta } from "./biblioteca";
import type { SpriteEnCapa } from "./sprite-capa";
import type { SpritePlaneado } from "./plan-escena-viva";
import { cargarImagen } from "./quitar-fondo";
import { blobDeUrlDeImagen, pngBase64ABlob } from "./png-base64";
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
  lector.onerror = () => reject(new Error("No se pudo preparar la imagen del sprite."));
  lector.readAsDataURL(blob);
});

/**
 * Reutiliza un actor existente o fabrica, recorta y guarda el que falte.
 * Guarda la plantilla completa (editable en el taller) y publica la tira
 * en la biblioteca pública, enlazadas.
 */
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

  // Preferir IDs ya persistidos por el servidor (evita doble personaje).
  const pidSrv = typeof generado.personajeId === "string" ? generado.personajeId : undefined;
  const aidSrv = typeof generado.animacionId === "string" ? generado.animacionId : undefined;

  const hojaBlob = pngBase64ABlob(generado.imagen);
  const urlHoja = URL.createObjectURL(hojaBlob);
  let imagen: HTMLImageElement;
  try {
    imagen = await cargarImagen(urlHoja);
  } finally {
    URL.revokeObjectURL(urlHoja);
  }
  const forma = (generado.forma ?? plan.forma) as "tira" | "columna";
  const esperados = Number(generado.fotogramas ?? plan.spr.fotogramas);
  const columnas = Number(generado.columnas) || (forma === "columna" ? 1 : esperados);
  const filas = Number(generado.filas) || (forma === "columna" ? esperados : 1);
  const celdas = celdasSpriteEnRejilla(imagen.naturalWidth, imagen.naturalHeight, esperados, { columnas, filas });
  const croma = typeof generado.croma === "string" && /^#[0-9a-f]{6}$/i.test(generado.croma)
    ? generado.croma
    : "#FF00FF";
  const urlCorte = URL.createObjectURL(hojaBlob);
  let cortada: Awaited<ReturnType<typeof cortarHoja>>;
  try {
    cortada = await cortarHoja({
      dataUrl: urlCorte,
      fotogramas: esperados,
      forma,
      croma,
      celdas,
    });
  } finally {
    URL.revokeObjectURL(urlCorte);
  }
  if (!cortada.fotogramas.length) {
    throw new Error(
      generado.guardadoEnDb
        ? "La hoja del sprite salió sin fotogramas recortables, pero sí quedó guardada en tu taller."
        : "La hoja del sprite salió sin ningún fotograma recortable.",
    );
  }

  let tira: Awaited<ReturnType<typeof tiraDeFotogramas>>;
  let refBlob: Blob;
  try {
    tira = await tiraDeFotogramas(cortada.fotogramas);
    const primerUrl = cortada.fotogramas[0]?.url;
    refBlob = primerUrl
      ? await blobDeUrlDeImagen(primerUrl)
      : hojaBlob;
  } finally {
    cortada.fotogramas.forEach((f) => {
      if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
    });
  }

  const nombre = plan.nombre.slice(0, 60) || nombreSprite(plan.que);
  const [hojaB64, tiraB64, refB64] = await Promise.all([
    base64(hojaBlob),
    base64(tira.blob),
    base64(refBlob),
  ]);

  // 1) Plantilla editable (misma forma que el taller del Lab).
  //    Si el server ya creó borrador, actualizamos esa animación.
  const plantilla = await pedirJson("/api/story/sprite-characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personajeId: pidSrv,
      animacionId: aidSrv,
      nombrePersonaje: nombre,
      descripcionPersonaje: plan.que,
      nombre,
      que: plan.que,
      fotogramas: tira.fotogramas,
      fps: plan.spr.fps,
      vista: plan.vista,
      direccion: plan.direccion,
      accion: plan.accion,
      anclaje: plan.anclaje,
      croma,
      columnas,
      filas,
      anchoHoja: imagen.naturalWidth,
      altoHoja: imagen.naturalHeight,
      ancho: tira.ancho,
      alto: tira.alto,
      celdas: cortada.celdas,
      hojaOriginal: hojaB64,
      hojaTrabajo: hojaB64,
      tira: tiraB64,
      referencia: pidSrv || aidSrv ? undefined : refB64,
    }),
  });
  const animationId = plantilla?.animacionId as string | undefined;
  if (!animationId) throw new Error("El sprite se recortó, pero no se pudo guardar la plantilla.");

  // 2) Tira pública para montajes, enlazada a la plantilla.
  const guardado = await pedirJson("/api/story/lab/sprites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre,
      que: plan.que,
      fotogramas: tira.fotogramas,
      fps: plan.spr.fps,
      vista: plan.vista,
      direccion: plan.direccion,
      accion: plan.accion,
      anclaje: plan.anclaje,
      ancho: tira.ancho,
      alto: tira.alto,
      tira: tiraB64,
      animationId,
    }),
  });
  const meta = guardado?.sprite as SpriteMeta | undefined;
  if (!meta?.id) throw new Error("El sprite se recortó, pero no se pudo publicar en la biblioteca.");

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
