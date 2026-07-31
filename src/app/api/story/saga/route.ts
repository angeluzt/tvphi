import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { referenciaParaIA } from "@/lib/story/catalogo";
import { migrateProject } from "@/lib/story/model";
import { normalizeCharacterData } from "@/lib/story/characters";

// La saga entera en un JSON: la serie, todos sus capítulos y sus personajes,
// más la referencia de efectos y reglas.
//
// Los archivos (imágenes, audios) NO van dentro: pesan demasiado. Van sus
// identificadores y sus nombres, que es justo lo que hace falta para reponerlos
// —y para que una IA sepa qué sonidos hay disponibles y cómo se llaman.
//
// GET ?id=<serie>  ·  sin id, todo lo que no tiene serie.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");

  const serie = id
    ? await prisma.storySeries.findFirst({ where: { id, userId: user.id } })
    : null;
  if (id && !serie) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const donde = { userId: user.id, seriesId: id ?? null };
  const [proyectos, personajes] = await Promise.all([
    prisma.storyProject.findMany({ where: donde, orderBy: { createdAt: "asc" } }),
    prisma.storyCharacter.findMany({ where: donde, orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({
    tvphi: "saga",
    version: 1,
    serie: serie
      ? { name: serie.name, data: serie.data }
      : { name: "Sin serie", data: { description: "", style: "", model: "", seed: "", notes: "" } },
    capitulos: proyectos.map((p) => ({ name: p.name, project: migrateProject(p.data) })),
    personajes: personajes.map((c) => ({ name: c.name, data: normalizeCharacterData(c.data) })),
    referencia: referenciaParaIA(),
  });
}
