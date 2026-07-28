import { redirect } from "next/navigation";
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
    select: { id: true, name: true, updatedAt: true },
  });
  const projects = rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Historias narradas</h1>
        <p className="text-sm text-muted">
          Crea videos tipo YouTube sin cámara: sube imágenes, escribe el texto que se narra con
          voz IA, dale movimiento y transiciones, añade música y stickers, y descarga el video.
        </p>
      </div>
      <StoryApp initialProjects={projects} />
    </div>
  );
}
