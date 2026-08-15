import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { estadoCupoHistorias, esAdminHistorias } from "@/lib/story/cupo";
import { StoryApp } from "@/components/story/story-app";

export const dynamic = "force-dynamic";

// El editor de historias, en pruebas.
//
// Es el MISMO editor y los MISMOS capítulos: lo que cambia es que aquí se
// enseña lo que todavía no está listo para nadie más —ahora mismo, partir una
// escena en láminas con profundidad—. No es una copia del código: duplicar tres
// mil líneas para probar una cosa se queda desincronizado a la semana y
// entonces lo que se prueba ya no es lo que la gente usa. Lo que sí está
// separado es la PUERTA: esta página se cierra a admin, y el editor de siempre
// no monta nada de esto.
//
// Los capítulos son los de tu cuenta, los mismos que en /story. Una escena con
// capas se ve con capas en los dos sitios —el motor es el mismo—; lo que solo
// está aquí es poder creármelas.
export default async function LabHistoriasPage({
  searchParams,
}: {
  searchParams: { id?: string; serie?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!esAdminHistorias(user.email)) redirect("/");

  const [rows, cupo] = await Promise.all([
    prisma.storyProject.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, seriesId: true, updatedAt: true },
    }),
    estadoCupoHistorias(user.id, user.email),
  ]);
  const projects = rows.map((r) => ({
    id: r.id, name: r.name, seriesId: r.seriesId, updatedAt: r.updatedAt.toISOString(),
  }));
  const openId = searchParams?.id && projects.some((p) => p.id === searchParams.id)
    ? searchParams.id
    : null;
  const serieInicial = searchParams?.serie && !openId ? searchParams.serie : null;

  return (
    <div className="space-y-4">
      <Link href="/lab" className="btn-ghost w-fit text-xs">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al laboratorio
      </Link>
      <div className="card border-gold/50 bg-gold/5 p-4">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Historias narradas · en pruebas</h1>
            <p className="mt-1 text-sm text-muted">
              El editor de siempre, con lo que todavía no ve nadie más. Son{" "}
              <b className="text-fg">tus capítulos de verdad</b>, los mismos que en Historias: lo
              que hagas aquí se guarda ahí.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              Lo nuevo: paleta al crear (2.5D, foto viva APNG, sprites), convertir cada
              escena, retocar con un prompt y animar una lámina. Son{" "}
              <b className="text-fg">tus capítulos de verdad</b>, los mismos que en Historias.
            </p>
          </div>
        </div>
      </div>
      <StoryApp
        initialProjects={projects}
        initialCupo={cupo}
        initialOpenId={openId}
        initialSerie={serieInicial}
        lab
      />
    </div>
  );
}
