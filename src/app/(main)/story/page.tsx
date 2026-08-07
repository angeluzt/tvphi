import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { estadoCupoHistorias } from "@/lib/story/cupo";
import { StoryApp } from "@/components/story/story-app";
import { ComoFunciona } from "@/components/story/como-funciona";
import { AvisoVerificar } from "@/components/auth/aviso-verificar";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  searchParams,
}: {
  searchParams: { id?: string; serie?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const [rows, cupo] = await Promise.all([
    prisma.storyProject.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, seriesId: true, updatedAt: true },
    }),
    estadoCupoHistorias(user.id, user.email),
  ]);
  const projects = rows.map((r) => ({ id: r.id, name: r.name, seriesId: r.seriesId, updatedAt: r.updatedAt.toISOString() }));
  // Si el id no es tuyo, se ignora: el cliente abre el inicio.
  const openId = searchParams?.id && projects.some((p) => p.id === searchParams.id)
    ? searchParams.id
    : null;
  const serieInicial = searchParams?.serie && !openId
    ? searchParams.serie
    : null;

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
      </div>
      {!user.emailVerifiedAt && <AvisoVerificar email={user.email} />}
      <ComoFunciona />
      <StoryApp
        initialProjects={projects}
        initialCupo={cupo}
        initialOpenId={openId}
        initialSerie={serieInicial}
      />
    </div>
  );
}
