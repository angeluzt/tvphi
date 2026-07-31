import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CharactersApp } from "@/components/story/characters-app";
import { normalizeCharacterData } from "@/lib/story/characters";

export const dynamic = "force-dynamic";

export default async function CharactersPage({ searchParams }: { searchParams: { serie?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const [rows, seriesRows] = await Promise.all([
    prisma.storyCharacter.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }),
    prisma.storySeries.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Si se llega desde una serie, se abre ya en la suya.
  const serieInicial = searchParams?.serie && seriesRows.some((s) => s.id === searchParams.serie)
    ? searchParams.serie : null;
  const characters = rows.map((r) => ({
    id: r.id,
    name: r.name,
    seriesId: r.seriesId,
    data: normalizeCharacterData(r.data),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/story" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a las historias
        </Link>
        <h1 className="mt-1 text-xl font-bold">Personajes</h1>
        <p className="text-sm text-muted">
          Una ficha por personaje: sus imágenes base, cómo es, y con qué prompt salió cada imagen.
          Es una libreta —no genera nada ni toca tus videos— para que el personaje se parezca a sí
          mismo de un capítulo a otro.
        </p>
      </div>
      <CharactersApp initial={characters} series={seriesRows} serieInicial={serieInicial} />
    </div>
  );
}
