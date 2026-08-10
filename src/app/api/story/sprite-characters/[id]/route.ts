import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limpiarPaginasAtlasHuerfanas } from "@/lib/lab/atlas-sprite.server";

export const dynamic = "force-dynamic";

// Borrar un personaje ENTERO, con todas sus animaciones.
//
// POR QUÉ HACÍA FALTA. Se podía borrar una animación suelta, pero no el
// personaje: los que salían mal se quedaban en la biblioteca para siempre,
// ocupando sitio en el tope de 20 y estorbando en la lista. Y con el tope de
// 120 MB por usuario, un personaje fallido que no se puede borrar es espacio
// que no vuelve.
//
// LAS ANIMACIONES CAEN SOLAS: `SpriteAnimation.characterId` tiene onDelete
// Cascade en el esquema. Lo que NO cae solo son las páginas del atlas, porque
// no cuelgan del personaje sino del usuario —una página puede tener fotogramas
// de varios personajes—, así que hay que barrerlas después.

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // El `userId` en el where es la autorización: si el personaje es de otro, no
  // aparece y se contesta 404 igual que si no existiera. No se filtra ni
  // siquiera que exista.
  const personaje = await prisma.spriteCharacter.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, nombre: true, _count: { select: { animaciones: true } } },
  });
  if (!personaje) {
    return NextResponse.json({ error: "Ese personaje ya no está." }, { status: 404 });
  }

  await prisma.spriteCharacter.delete({ where: { id: personaje.id } });

  // Si esto falla, el personaje YA está borrado y la respuesta debe ser un
  // éxito: dejar páginas huérfanas es un desperdicio de espacio, no un error
  // que el usuario pueda arreglar reintentando.
  let paginas = 0;
  try {
    const r = await limpiarPaginasAtlasHuerfanas(user.id);
    paginas = r.count;
  } catch (e) {
    console.error("[sprite-characters] atlas huérfano tras borrar", e);
  }

  return NextResponse.json({
    ok: true,
    nombre: personaje.nombre,
    animaciones: personaje._count.animaciones,
    paginasAtlasLiberadas: paginas,
  });
}
