import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StoryApp } from "@/components/story/story-app";

export const dynamic = "force-dynamic";

export default async function StoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const rows = await prisma.storyProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, seriesId: true, updatedAt: true },
  });
  const projects = rows.map((r) => ({ id: r.id, name: r.name, seriesId: r.seriesId, updatedAt: r.updatedAt.toISOString() }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Historias narradas</h1>
          <p className="text-sm text-muted">
            Crea videos tipo YouTube sin cámara: sube imágenes, escribe el texto que se narra con
            voz IA, dale movimiento y transiciones, añade música y stickers, y descarga el video.
          </p>
        </div>
        {/* La libreta de personajes: aparte, porque no es parte del montaje. */}
        <Link href="/story/personajes" className="btn-ghost shrink-0 text-xs">
          <Users className="h-4 w-4 text-accent" /> Personajes
        </Link>
      </div>
      <StoryApp initialProjects={projects} />
    </div>
  );
}
