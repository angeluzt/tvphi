import "server-only";
import { prisma } from "@/lib/prisma";
import { esAdminHistorias } from "@/lib/story/cupo";

const DIA = 24 * 60 * 60 * 1000;
const CLAVE_USOS = "usosIaCapitulo";

function desdeHace(dias: number): Date {
  return new Date(Date.now() - dias * DIA);
}

function usosIaEnVentana(models: unknown, desdeMs: number): number {
  const raw = (models as Record<string, unknown> | null)?.[CLAVE_USOS];
  if (!Array.isArray(raw)) return 0;
  return raw
    .map((x) => new Date(String(x)).getTime())
    .filter((t) => Number.isFinite(t) && t >= desdeMs).length;
}

export type AdminStats = {
  generadoEn: string;
  cuentas: {
    total: number;
    ultimos7d: number;
    ultimos30d: number;
    conHistoria: number;
    sinHistoria: number;
    admin: number;
  };
  historias: {
    total: number;
    ultimos7d: number;
    ultimos30d: number;
    editadas7d: number;
    enSerie: number;
    sueltas: number;
  };
  series: { total: number; ultimos30d: number };
  personajes: { total: number };
  ia: {
    generaciones24h: number;
    usuariosConCredencial: number;
  };
  topCuentas: {
    id: string;
    email: string;
    displayName: string;
    username: string;
    historias: number;
    series: number;
    creada: string;
  }[];
  altasRecientes: {
    id: string;
    email: string;
    displayName: string;
    username: string;
    creada: string;
  }[];
};

/** Agrega números globales de uso. Solo para admins (el caller debe comprobar). */
export async function cargarAdminStats(): Promise<AdminStats> {
  const ahora = Date.now();
  const d7 = desdeHace(7);
  const d30 = desdeHace(30);
  const d1 = ahora - DIA;

  const [
    cuentasTotal,
    cuentas7,
    cuentas30,
    historiasTotal,
    historias7,
    historias30,
    historiasEditadas7,
    historiasEnSerie,
    seriesTotal,
    series30,
    personajesTotal,
    conHistoria,
    credenciales,
    topRaw,
    altasRaw,
    todosEmails,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.storyProject.count(),
    prisma.storyProject.count({ where: { createdAt: { gte: d7 } } }),
    prisma.storyProject.count({ where: { createdAt: { gte: d30 } } }),
    prisma.storyProject.count({ where: { updatedAt: { gte: d7 } } }),
    prisma.storyProject.count({ where: { seriesId: { not: null } } }),
    prisma.storySeries.count(),
    prisma.storySeries.count({ where: { createdAt: { gte: d30 } } }),
    prisma.storyCharacter.count(),
    prisma.user.count({ where: { storyProjects: { some: {} } } }),
    prisma.aiCredential.findMany({ select: { models: true } }),
    prisma.user.findMany({
      take: 10,
      orderBy: { storyProjects: { _count: "desc" } },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        createdAt: true,
        _count: { select: { storyProjects: true, storySeries: true } },
      },
    }),
    prisma.user.findMany({
      take: 12,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({ select: { email: true } }),
  ]);

  const generaciones24h = credenciales.reduce(
    (a, c) => a + usosIaEnVentana(c.models, d1),
    0,
  );
  const admin = todosEmails.filter((u) => esAdminHistorias(u.email)).length;

  return {
    generadoEn: new Date().toISOString(),
    cuentas: {
      total: cuentasTotal,
      ultimos7d: cuentas7,
      ultimos30d: cuentas30,
      conHistoria: conHistoria,
      sinHistoria: Math.max(0, cuentasTotal - conHistoria),
      admin,
    },
    historias: {
      total: historiasTotal,
      ultimos7d: historias7,
      ultimos30d: historias30,
      editadas7d: historiasEditadas7,
      enSerie: historiasEnSerie,
      sueltas: Math.max(0, historiasTotal - historiasEnSerie),
    },
    series: { total: seriesTotal, ultimos30d: series30 },
    personajes: { total: personajesTotal },
    ia: {
      generaciones24h,
      usuariosConCredencial: credenciales.length,
    },
    topCuentas: topRaw.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      username: u.username,
      historias: u._count.storyProjects,
      series: u._count.storySeries,
      creada: u.createdAt.toISOString(),
    })),
    altasRecientes: altasRaw.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      username: u.username,
      creada: u.createdAt.toISOString(),
    })),
  };
}
