import "server-only";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { archivarAnimacionEnAtlas } from "@/lib/lab/atlas-sprite.server";
import { nombreCorto } from "@/lib/lab/biblioteca";
import { refrescarPublicado } from "@/lib/lab/publicado.server";

import { sinSitioPersonajes, sinSitioAnimaciones, type TopesTaller } from "./topes-taller";

export type MetaSpriteGenerado = {
  que: string;
  fotogramas: number;
  columnas: number;
  filas: number;
  vista: string;
  direccion: string;
  accion: string;
  croma: string;
  /** Personaje existente al que colgar la nueva animación (opcional). */
  personajeId?: string;
  /**
   * Animación existente que esta hoja REEMPLAZA, en vez de crear otra.
   *
   * Es lo que pide «rehacer con IA»: se cambia el prompt o el número de cuadros
   * y sale otra versión DEL MISMO sprite. Sin esto cada intento dejaba una
   * animación nueva colgando, la biblioteca se llenaba de «Pescador 1, 2, 3» y
   * los montajes seguían apuntando a la primera, que era la mala.
   */
  rehacerId?: string;
};

/**
 * Guarda la hoja recién generada por IA antes de devolverla al navegador.
 * Así, si el cliente falla al convertir el base64 o se cae la pestaña,
 * la imagen pagada sigue en la DB (borrador editable).
 */
export async function persistirSpriteGenerado(
  userId: string,
  hoja: Buffer,
  meta: MetaSpriteGenerado,
  /**
   * Los topes YA resueltos, no el correo.
   *
   * Quien llama acaba de calcularlos para decidir si deja pagar la imagen; si
   * aquí se recalcularan, habría dos fuentes para la misma respuesta y bastaría
   * con que una se quedara vieja para que la ruta dejara generar y el guardado
   * lo rechazara.
   */
  topes: TopesTaller,
): Promise<{ personajeId: string; animacionId: string; enAtlas: boolean }> {
  const m = await sharp(hoja).metadata();
  const anchoHoja = m.width ?? 0;
  const altoHoja = m.height ?? 0;
  if (anchoHoja < 8 || altoHoja < 8) throw new Error("La hoja generada es inválida.");

  const columnas = Math.max(1, meta.columnas);
  const filas = Math.max(1, meta.filas);
  const fotogramas = Math.min(meta.fotogramas, columnas * filas);
  const cw = Math.floor(anchoHoja / columnas);
  const ch = Math.floor(altoHoja / filas);
  if (cw < 1 || ch < 1) throw new Error("La rejilla de la hoja es inválida.");

  const celdas = Array.from({ length: fotogramas }, (_, i) => {
    const col = i % columnas;
    const row = Math.floor(i / columnas);
    return { x: col * cw, y: row * ch, ancho: cw, alto: ch };
  });

  const frames = await Promise.all(
    celdas.map((c) =>
      sharp(hoja)
        .extract({ left: c.x, top: c.y, width: c.ancho, height: c.alto })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    ),
  );

  const tira = await sharp({
    create: {
      width: cw * frames.length,
      height: ch,
      channels: 4,
      background: { r: 255, g: 0, b: 255, alpha: 1 },
    },
  })
    .composite(frames.map((input, i) => ({ input, left: i * cw, top: 0 })))
    .png({ compressionLevel: 9 })
    .toBuffer();

  // El nombre NO es el prompt cortado: los prompts que funcionan son largos y
  // empiezan todos igual, así que la biblioteca se llenaba de párrafos idénticos
  // cortados a media palabra. `nombreCorto` se queda con lo que distingue.
  const nombre = nombreCorto(meta.que);
  const data = {
    nombre,
    que: meta.que.trim().slice(0, 400),
    fotogramas,
    fps: 8,
    vista: meta.vista,
    direccion: meta.direccion,
    accion: meta.accion,
    anclaje: "pies" as const,
    croma: meta.croma,
    columnas,
    filas,
    anchoHoja,
    altoHoja,
    ancho: cw,
    alto: ch,
    celdas,
    hojaOriginal: hoja,
    hojaTrabajo: null as Buffer | null,
    tira,
    bytesOriginal: hoja.length,
    bytesTrabajo: 0,
    bytesTira: tira.length,
  };

  const pack = async (id: string) => {
    try {
      return await archivarAnimacionEnAtlas(userId, id);
    } catch (e) {
      console.error("Atlas tras generar: se conserva la tira", e);
      return false;
    }
  };

  // REHACER: la versión nueva ocupa el sitio de la vieja.
  //
  // Se conservan tres cosas del original a propósito. El NOMBRE, porque lo puso
  // la persona y es por el que la busca —y por el que la llaman las animaciones
  // encadenadas—. Los FPS y el ANCLAJE, porque son ajustes finos que costó
  // encontrar y no tienen nada que ver con el dibujo nuevo.
  //
  // Y se limpia `atlasFrames`: si la animación estaba compactada, esas
  // coordenadas apuntan a los cuadros VIEJOS dentro de la lámina. Dejarlas con
  // una tira nueva haría que el sprite se pintara con los recortes de la
  // versión anterior, que es la que se acaba de tirar.
  if (meta.rehacerId) {
    const vieja = await prisma.spriteAnimation.findFirst({
      where: { id: meta.rehacerId, character: { userId } },
      select: { id: true, nombre: true, fps: true, anclaje: true, characterId: true },
    });
    if (!vieja) throw new Error("No encontré esa animación en tu taller.");
    const a = await prisma.spriteAnimation.update({
      where: { id: vieja.id },
      data: {
        ...data,
        nombre: vieja.nombre,
        fps: vieja.fps,
        anclaje: vieja.anclaje,
        atlasFrames: Prisma.DbNull,
      },
    });
    // Si además estaba publicado, la copia común se pone al día sola: es el
    // mismo sprite, y quien lo rehace no va a acordarse de volver a publicarlo.
    await refrescarPublicado(a.id, {
      nombre: vieja.nombre, que: data.que, fotogramas, fps: vieja.fps,
      vista: data.vista, direccion: data.direccion, accion: data.accion,
      anclaje: vieja.anclaje, ancho: cw, alto: ch, tira,
    });
    return { personajeId: vieja.characterId, animacionId: a.id, enAtlas: await pack(a.id) };
  }

  if (meta.personajeId) {
    const c = await prisma.spriteCharacter.findFirst({
      where: { id: meta.personajeId, userId },
      include: { _count: { select: { animaciones: true } } },
    });
    if (!c) throw new Error("Personaje no encontrado.");
    if (c._count.animaciones >= topes.animaciones) {
      throw new Error(sinSitioAnimaciones(topes.animaciones));
    }
    const a = await prisma.spriteAnimation.create({
      data: { ...data, characterId: c.id },
    });
    return { personajeId: c.id, animacionId: a.id, enAtlas: await pack(a.id) };
  }

  if (Number.isFinite(topes.personajes)) {
    const cuantos = await prisma.spriteCharacter.count({ where: { userId } });
    if (cuantos >= topes.personajes) throw new Error(sinSitioPersonajes(topes.personajes));
  }

  const c = await prisma.spriteCharacter.create({
    data: {
      userId,
      nombre,
      descripcion: meta.que.trim().slice(0, 600) || nombre,
      referencia: frames[0],
      bytesReferencia: frames[0].length,
      animaciones: { create: data },
    },
    include: { animaciones: { select: { id: true } } },
  });

  const animacionId = c.animaciones[0].id;
  return {
    personajeId: c.id,
    animacionId,
    enAtlas: await pack(animacionId),
  };
}
