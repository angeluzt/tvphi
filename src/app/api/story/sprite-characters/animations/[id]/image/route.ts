import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reconstruirTiraAnimacion } from "@/lib/lab/atlas-sprite.server";

export const dynamic = "force-dynamic";

// Las imágenes de una animación, una a una.
//
// POR QUÉ NO VAN EN EL JSON. Antes el GET de la animación devolvía las TRES
// —hoja original, hoja de trabajo y tira— en base64 dentro del mismo objeto.
// Base64 engorda un tercio, así que abrir una animación de 1536×1024 podía ser
// una sola respuesta de varios megas: lenta en móvil, imposible de cachear
// (cambia cualquier metadato y se vuelve a bajar todo) y todo o nada, que es
// justo el «Failed to fetch» que aparecía al abrir hojas grandes.
//
// Ahora el JSON lleva medidas y celdas —unos cientos de bytes— y cada imagen se
// pide por su cuenta, en paralelo, como binario y cacheable.
//
// EL PARÁMETRO NO CONSTRUYE NINGUNA RUTA: es una de tres palabras conocidas que
// eligen qué columna de la fila leer. No hay disco de por medio.

type Cual = "original" | "trabajo" | "tira";

const CUALES: Record<string, Cual> = {
  original: "original",
  trabajo: "trabajo",
  tira: "tira",
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const pedido = new URL(req.url).searchParams.get("que") ?? "tira";
  const cual = CUALES[pedido];
  if (!cual) return new NextResponse("Imagen desconocida", { status: 400 });

  // El `character: { userId }` es la autorización: la animación de otro no
  // existe para ti, y se contesta 404 sin decir si el id es real.
  const a = await prisma.spriteAnimation.findFirst({
    where: { id: params.id, character: { userId: user.id } },
    select: {
      hojaOriginal: cual === "original",
      hojaTrabajo: cual === "trabajo",
      tira: cual === "tira",
      atlasFrames: cual === "tira",
      fotogramas: cual === "tira",
      ancho: cual === "tira",
      alto: cual === "tira",
      updatedAt: true,
    },
  });
  if (!a) return new NextResponse("No encontrado", { status: 404 });

  let bytes: Buffer;
  try {
    if (cual === "tira") {
      // La tira puede no estar: si ya se compactó en el atlas, se rehace
      // pegando los fotogramas de sus páginas.
      bytes = await reconstruirTiraAnimacion({
        userId: user.id,
        tira: a.tira ?? null,
        atlasFrames: a.atlasFrames,
        fotogramas: a.fotogramas,
        ancho: a.ancho,
        alto: a.alto,
      });
    } else if (cual === "trabajo") {
      // Sin hoja de trabajo es que nadie la ha retocado: vale la original.
      const t = a.hojaTrabajo;
      if (t) bytes = Buffer.from(t);
      else {
        const o = await prisma.spriteAnimation.findFirst({
          where: { id: params.id, character: { userId: user.id } },
          select: { hojaOriginal: true },
        });
        if (!o) return new NextResponse("No encontrado", { status: 404 });
        bytes = Buffer.from(o.hojaOriginal);
      }
    } else {
      bytes = Buffer.from(a.hojaOriginal);
    }
  } catch {
    return new NextResponse("Imagen incompleta", { status: 500 });
  }

  const cuerpo = new Uint8Array(bytes);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(cuerpo.byteLength),
      // Corto y con ETag: la hoja de trabajo SÍ cambia (se edita), así que
      // «immutable» sería mentira. Con el ETag, reabrir la misma animación sin
      // haberla tocado se resuelve con un 304 y no baja nada.
      "Cache-Control": "private, max-age=60, must-revalidate",
      ETag: `"${params.id}-${cual}-${a.updatedAt.getTime()}"`,
    },
  });
}
