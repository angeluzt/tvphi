import { prisma } from "@/lib/prisma";
import { TOPE_BYTES } from "@/lib/lab/biblioteca";

// La copia pública de un sprite, atada a la privada que la originó.
//
// EL PROBLEMA. Hay dos sitios donde vive un sprite: la animación PRIVADA del
// taller —editable, con su hoja y sus celdas— y la copia PÚBLICA de la
// biblioteca común, que es solo la tira ya compuesta. La segunda nace de la
// primera y guarda `animationId` para recordar de cuál.
//
// Pero al publicar se hacía siempre `create`. Quien corregía un sprite y volvía
// a publicarlo acababa con DOS entradas en la biblioteca: la vieja, mal, y la
// nueva; y la vieja seguía siendo la que ya estaba metida en los montajes. El
// mismo dibujo ocupando el doble y, peor, la corrección invisible justo donde
// hacía falta.
//
// LO QUE HACE ESTO. Una sola copia pública por animación: si ya existe se
// actualiza, y si no se crea. Y cuando se guardan correcciones en el taller, la
// copia pública se refresca sola —quien la corrigió no tiene que acordarse de
// volver a publicar, que es exactamente lo que nadie hace—.

/** Lo que la biblioteca pública guarda de un sprite. */
export interface DatosPublicados {
  nombre: string;
  que: string;
  fotogramas: number;
  fps: number;
  vista: string;
  direccion: string;
  accion: string;
  anclaje: string;
  ancho: number;
  alto: number;
  tira: Buffer;
}

const campos = (d: DatosPublicados) => ({
  nombre: d.nombre,
  que: d.que,
  fotogramas: d.fotogramas,
  fps: d.fps,
  vista: d.vista,
  direccion: d.direccion,
  accion: d.accion,
  anclaje: d.anclaje,
  ancho: d.ancho,
  alto: d.alto,
  tira: d.tira,
  bytes: d.tira.byteLength,
});

/** La copia pública de esta animación, si la hay. */
export function publicadoDe(animationId: string) {
  return prisma.sprite.findFirst({
    where: { animationId },
    select: { id: true, creadoPor: true },
  });
}

/**
 * Publica o actualiza la copia pública de una animación.
 *
 * Devuelve la fila y si fue una actualización, para poder decirlo en pantalla:
 * «Publicado» y «Actualizado en la biblioteca» no significan lo mismo para
 * quien acaba de corregir un sprite que ya estaba puesto en un montaje.
 */
export async function publicar(
  animationId: string | undefined,
  datos: DatosPublicados,
  usuarioId: string,
) {
  const ya = animationId ? await publicadoDe(animationId) : null;
  if (ya) {
    const fila = await prisma.sprite.update({
      where: { id: ya.id },
      data: campos(datos),
      select: { id: true, createdAt: true, animationId: true },
    });
    return { fila, actualizado: true };
  }
  const fila = await prisma.sprite.create({
    data: { ...campos(datos), creadoPor: usuarioId, animationId },
    select: { id: true, createdAt: true, animationId: true },
  });
  return { fila, actualizado: false };
}

/**
 * Refresca la copia pública tras guardar correcciones en el taller.
 *
 * No publica nada nuevo: si la animación no estaba publicada, no lo estará
 * ahora. Publicar es una decisión, y corregir un sprite privado no puede
 * tomarla por quien lo corrige.
 *
 * Falla en silencio a propósito —devolviendo `false`—: esto es un efecto
 * secundario de guardar, y que la copia pública no se pueda refrescar no es
 * motivo para perder la corrección privada, que es lo que la persona pidió.
 */
export async function refrescarPublicado(
  animationId: string,
  datos: DatosPublicados,
): Promise<boolean> {
  try {
    if (datos.tira.byteLength > TOPE_BYTES) return false;
    const r = await prisma.sprite.updateMany({
      where: { animationId },
      data: campos(datos),
    });
    return r.count > 0;
  } catch (e) {
    console.error("No se pudo refrescar la copia pública del sprite", e);
    return false;
  }
}
