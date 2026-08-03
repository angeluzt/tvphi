import { prisma } from "@/lib/prisma";

// Cupo de historias CON IA (escribir capítulo), no de videos manuales.
//
// Ventana móvil de 24 h: 3 generaciones; al agotar, espera a que caduque la
// más antigua. Los usos se guardan en AiCredential.models.usosIaCapitulo.

const VENTANA_MS = 24 * 60 * 60 * 1000;
const CLAVE_USOS = "usosIaCapitulo";

function limite(): number {
  const n = Number(process.env["STORY_DAILY_LIMIT"] ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/** Correos admin / sin cupo. Separados por coma en STORY_QUOTA_EXEMPT_EMAILS. */
export function esAdminHistorias(email: string): boolean {
  const raw = (process.env["STORY_QUOTA_EXEMPT_EMAILS"] ?? "").trim();
  if (!raw) return false;
  const yo = email.trim().toLowerCase();
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(yo);
}

function exento(email: string): boolean {
  return esAdminHistorias(email);
}

export type CupoHistorias = {
  exento: boolean;
  usadas: number;
  limite: number;
  quedan: number;
  /** ISO: cuándo vuelve a haber hueco. null si aún puedes generar con IA. */
  retryAt: string | null;
};

function usosRecientes(models: unknown): Date[] {
  const raw = (models as Record<string, unknown> | null)?.[CLAVE_USOS];
  if (!Array.isArray(raw)) return [];
  const desde = Date.now() - VENTANA_MS;
  return raw
    .map((x) => new Date(String(x)))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= desde)
    .sort((a, b) => a.getTime() - b.getTime());
}

export async function estadoCupoHistorias(userId: string, email: string): Promise<CupoHistorias> {
  const lim = limite();
  if (exento(email)) {
    return { exento: true, usadas: 0, limite: lim, quedan: lim, retryAt: null };
  }
  const cred = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const recientes = usosRecientes(cred?.models);
  const usadas = recientes.length;
  const quedan = Math.max(0, lim - usadas);
  const retryAt =
    usadas >= lim && recientes[0]
      ? new Date(recientes[0].getTime() + VENTANA_MS).toISOString()
      : null;
  return { exento: false, usadas, limite: lim, quedan, retryAt };
}

/** Anota un uso tras generar un capítulo con IA con éxito. */
export async function registrarUsoIaCapitulo(userId: string) {
  const cred = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const models = { ...((cred?.models as object) ?? {}) } as Record<string, unknown>;
  const ahora = new Date();
  const vivos = usosRecientes(models).map((d) => d.toISOString());
  vivos.push(ahora.toISOString());
  models[CLAVE_USOS] = vivos;
  await prisma.aiCredential.upsert({
    where: { userId },
    create: {
      userId,
      provider: "openai",
      encrypted: "env",
      hint: "servidor",
      models: models as object,
    },
    update: { models: models as object },
  });
}

export function mensajeCupoAgotado(cupo: CupoHistorias): string {
  const cuando = cupo.retryAt
    ? new Date(cupo.retryAt).toLocaleString()
    : "dentro de 24 horas";
  return `Has generado ${cupo.limite} historias con IA en las últimas 24 horas. Podrás generar otra a partir de ${cuando}. Los videos a mano no tienen límite.`;
}
