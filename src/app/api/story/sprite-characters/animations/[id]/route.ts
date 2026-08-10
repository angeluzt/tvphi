import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limpiarPaginasAtlasHuerfanas } from "@/lib/lab/atlas-sprite.server";
import { urlImagenAnimacion } from "@/lib/lab/personajes-sprite";

export const dynamic = "force-dynamic";

// Una animación del taller: SOLO metadatos.
//
// Las tres imágenes (hoja original, hoja de trabajo y tira) se piden por
// separado a `./image?que=…`. Antes venían aquí en base64 y una animación de
// 1536×1024 salía por varios megas en una sola respuesta —lenta en móvil, no
// cacheable y todo o nada—. Aquí van medidas y celdas: unos cientos de bytes.

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const a = await prisma.spriteAnimation.findFirst({
    where: { id: params.id, character: { userId: user.id } },
    select: {
      id: true, nombre: true, que: true, fotogramas: true, fps: true,
      vista: true, direccion: true, accion: true, anclaje: true, croma: true,
      columnas: true, filas: true, anchoHoja: true, altoHoja: true,
      ancho: true, alto: true, celdas: true, bytesTira: true, updatedAt: true,
      character: { select: { id: true, nombre: true } },
    },
  });
  if (!a) return NextResponse.json({ error: "Animación no encontrada" }, { status: 404 });

  return NextResponse.json({
    animacion: {
      id: a.id,
      personajeId: a.character.id,
      personajeNombre: a.character.nombre,
      nombre: a.nombre,
      que: a.que,
      fotogramas: a.fotogramas,
      fps: a.fps,
      vista: a.vista,
      direccion: a.direccion,
      accion: a.accion,
      anclaje: a.anclaje,
      croma: a.croma,
      columnas: a.columnas,
      filas: a.filas,
      anchoHoja: a.anchoHoja,
      altoHoja: a.altoHoja,
      ancho: a.ancho,
      alto: a.alto,
      celdas: a.celdas,
      bytes: a.bytesTira,
      actualizadoEn: a.updatedAt.toISOString(),
      hojaOriginalUrl: urlImagenAnimacion(a.id, "original"),
      hojaTrabajoUrl: urlImagenAnimacion(a.id, "trabajo"),
      tiraUrl: urlImagenAnimacion(a.id, "tira"),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const a = await prisma.spriteAnimation.findFirst({
    where: { id: params.id, character: { userId: user.id } },
    select: { id: true, nombre: true },
  });
  if (!a) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  await prisma.spriteAnimation.delete({ where: { id: a.id } });

  // Sus fotogramas pueden ser los últimos de alguna página del atlas. Si el
  // barrido falla, la animación YA está borrada: son bytes desperdiciados, no
  // un error que el usuario arregle reintentando.
  try {
    await limpiarPaginasAtlasHuerfanas(user.id);
  } catch (e) {
    console.error("[animations] atlas huérfano tras borrar", e);
  }

  return NextResponse.json({ ok: true, nombre: a.nombre });
}
