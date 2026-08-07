import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { estadoCupoHistorias, esAdminHistorias } from "@/lib/story/cupo";
import { StoryApp } from "@/components/story/story-app";
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
            Videos narrados a partir de imágenes. Sin cámara y sin instalar nada.
          </p>
        </div>
      </div>
      {/* Al admin no se le pide confirmar en ninguna de las rutas que gastan,
          así que tampoco aquí: el cartel le decía que confirmara para poder
          usar la IA que ya le funcionaba. */}
      {!user.emailVerifiedAt && !esAdminHistorias(user.email) && (
        <AvisoVerificar email={user.email} />
      )}
      {/* «Cómo funciona» vive dentro de StoryHome, debajo de crear con IA: en
          el editor no pinta nada y aquí salía también mientras editabas. */}
      <StoryApp
        initialProjects={projects}
        initialCupo={cupo}
        initialOpenId={openId}
        initialSerie={serieInicial}
      />
    </div>
  );
}
