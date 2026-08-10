import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { AVISO_SIN_VERIFICAR } from "@/lib/email-verify";
import { leerAjustes } from "@/lib/story/ajustes";

// Cupos de IA: ledger atómico en AiUsage (no JSON en AiCredential).
//
// Reserva ANTES de llamar a OpenAI: si dos peticiones llegan a la vez, solo
// las que quepan en el cupo insertan fila. Si OpenAI falla, se libera la reserva.

const VENTANA_MS = 24 * 60 * 60 * 1000;
const CLAVE_LIMITE = "story_daily_limit";
const LIMITE_DEFECTO = 3;
const LIMITE_MAX = 100;

export type KindUsoIa = "capitulo" | "imagen" | "voz" | "texto";

export type CupoHistorias = {
  exento: boolean;
  usadas: number;
  limite: number;
  quedan: number;
  /** ISO: cuándo vuelve a haber hueco. null si aún puedes generar con IA. */
  retryAt: string | null;
};

export type ReservaUso =
  | { ok: true; id: string; cupo: CupoHistorias }
  | { ok: false; cupo: CupoHistorias; mensaje: string };

/** Correos admin / sin cupo. Separados por coma en STORY_QUOTA_EXEMPT_EMAILS. */
export function esAdminHistorias(email: string): boolean {
  const raw = (process.env["STORY_QUOTA_EXEMPT_EMAILS"] ?? "").trim();
  if (!raw) return false;
  const yo = email.trim().toLowerCase();
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(yo);
}

function exento(email: string) {
  return esAdminHistorias(email);
}

function parseLimite(raw: unknown, max = LIMITE_MAX): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.floor(n));
}

function limiteEnv(): number {
  return parseLimite(process.env["STORY_DAILY_LIMIT"]) ?? LIMITE_DEFECTO;
}

/** Cupo de capítulos IA / 24 h. 0 = IA de historias (y portero global) apagada. */
export async function leerLimiteIa(): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CLAVE_LIMITE } });
    const desdeDb = row ? parseLimite(row.value) : null;
    if (desdeDb != null) return desdeDb;
  } catch {
    // migración pendiente → env
  }
  return limiteEnv();
}

export async function guardarLimiteIa(n: number): Promise<number> {
  const v = parseLimite(n);
  if (v == null) throw new Error(`El límite debe estar entre 0 y ${LIMITE_MAX}.`);
  await prisma.appSetting.upsert({
    where: { key: CLAVE_LIMITE },
    create: { key: CLAVE_LIMITE, value: String(v) },
    update: { value: String(v) },
  });
  return v;
}

async function limiteDeKind(kind: KindUsoIa): Promise<number> {
  const a = await leerAjustes();
  switch (kind) {
    case "capitulo": return a.historiasPorDia;
    case "imagen": return a.imagenesPorDia;
    case "voz": return a.vocesPorDia;
    case "texto": return a.textosPorDia;
  }
}

function lockKey(userId: string, kind: KindUsoIa): number {
  // Entero 32-bit con signo para pg_advisory_xact_lock
  const h = createHash("sha256").update(`aiusage:${userId}:${kind}`).digest();
  return h.readInt32BE(0);
}

async function estadoDesdeTabla(
  userId: string,
  kind: KindUsoIa,
  limite: number,
  email: string,
): Promise<CupoHistorias> {
  if (exento(email)) {
    return { exento: true, usadas: 0, limite, quedan: limite, retryAt: null };
  }
  const desde = new Date(Date.now() - VENTANA_MS);
  const filas = await prisma.aiUsage.findMany({
    where: { userId, kind, createdAt: { gte: desde } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const usadas = filas.length;
  const quedan = Math.max(0, limite - usadas);
  const retryAt =
    usadas >= limite && filas[0]
      ? new Date(filas[0].createdAt.getTime() + VENTANA_MS).toISOString()
      : null;
  return { exento: false, usadas, limite, quedan, retryAt };
}

export async function estadoCupoHistorias(userId: string, email: string): Promise<CupoHistorias> {
  return estadoDesdeTabla(userId, "capitulo", await leerLimiteIa(), email);
}

export async function estadoCupoImagenes(userId: string, email: string): Promise<CupoHistorias> {
  const { imagenesPorDia } = await leerAjustes();
  return estadoDesdeTabla(userId, "imagen", imagenesPorDia, email);
}

export async function estadoCupoVoces(userId: string, email: string): Promise<CupoHistorias> {
  const { vocesPorDia } = await leerAjustes();
  return estadoDesdeTabla(userId, "voz", vocesPorDia, email);
}

export async function estadoCupoTextos(userId: string, email: string): Promise<CupoHistorias> {
  const { textosPorDia } = await leerAjustes();
  return estadoDesdeTabla(userId, "texto", textosPorDia, email);
}

/**
 * Reserva un uso (insert atómico). Llamar ANTES de OpenAI; liberar si falla.
 */
export async function reservarUsoIa(
  userId: string,
  email: string,
  kind: KindUsoIa,
): Promise<ReservaUso> {
  const limite = await limiteDeKind(kind);
  if (exento(email)) {
    const cupo = await estadoDesdeTabla(userId, kind, limite, email);
    return { ok: true, id: "exento", cupo };
  }
  if (limite <= 0) {
    const cupo = { exento: false, usadas: 0, limite: 0, quedan: 0, retryAt: null };
    return { ok: false, cupo, mensaje: mensajeCupoCero(kind) };
  }

  const key = lockKey(userId, kind);
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
      const desde = new Date(Date.now() - VENTANA_MS);
      const filas = await tx.aiUsage.findMany({
        where: { userId, kind, createdAt: { gte: desde } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const usadas = filas.length;
      if (usadas >= limite) {
        const cupo: CupoHistorias = {
          exento: false,
          usadas,
          limite,
          quedan: 0,
          retryAt: filas[0]
            ? new Date(filas[0].createdAt.getTime() + VENTANA_MS).toISOString()
            : null,
        };
        return { ok: false as const, cupo };
      }
      const row = await tx.aiUsage.create({ data: { userId, kind } });
      const cupo: CupoHistorias = {
        exento: false,
        usadas: usadas + 1,
        limite,
        quedan: Math.max(0, limite - usadas - 1),
        retryAt: null,
      };
      return { ok: true as const, id: row.id, cupo };
    });

    if (!resultado.ok) {
      return {
        ok: false,
        cupo: resultado.cupo,
        mensaje: kind === "imagen" ? mensajeCupoImagenes(resultado.cupo)
          : kind === "voz" ? mensajeCupoVoces(resultado.cupo)
            : kind === "texto" ? mensajeCupoTextos(resultado.cupo)
              : mensajeCupoAgotado(resultado.cupo),
      };
    }
    // Traza ligera para operación (sin PII más allá del id interno).
    console.info(JSON.stringify({
      evt: "ai_usage_reservado", kind, userId, usoId: resultado.id, quedan: resultado.cupo.quedan,
    }));
    return resultado;
  } catch (e) {
    console.error("[cupo] reserva falló", e);
    const cupo = await estadoDesdeTabla(userId, kind, limite, email);
    return { ok: false, cupo, mensaje: "No se pudo reservar el cupo de IA. Inténtalo de nuevo." };
  }
}

export async function liberarUsoIa(id: string | undefined | null) {
  if (!id || id === "exento") return;
  await prisma.aiUsage.deleteMany({ where: { id } }).catch(() => {});
}

/** @deprecated Preferir reservarUsoIa antes de OpenAI. Compat: anota después. */
export async function registrarUsoIaCapitulo(userId: string) {
  await prisma.aiUsage.create({ data: { userId, kind: "capitulo" } });
}

/** @deprecated Preferir reservarUsoIa. */
export async function registrarUsoIaImagen(userId: string) {
  await prisma.aiUsage.create({ data: { userId, kind: "imagen" } });
}

export function mensajeCupoAgotado(cupo: CupoHistorias): string {
  const cuando = cupo.retryAt
    ? new Date(cupo.retryAt).toLocaleString()
    : "dentro de 24 horas";
  return `Has generado ${cupo.limite} historias con IA en las últimas 24 horas. Podrás generar otra a partir de ${cuando}. Los videos a mano no tienen límite.`;
}

export function mensajeCupoImagenes(c: CupoHistorias): string {
  const cuando = c.retryAt
    ? new Date(c.retryAt).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : "más tarde";
  return `Se acabaron tus ${c.limite} imágenes con IA de hoy. Vuelve ${cuando}.`;
}

export function mensajeCupoVoces(c: CupoHistorias): string {
  const cuando = c.retryAt
    ? new Date(c.retryAt).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : "más tarde";
  return `Se acabaron tus ${c.limite} narraciones de pago de hoy. Vuelve ${cuando}.`;
}

export function mensajeCupoTextos(c: CupoHistorias): string {
  const cuando = c.retryAt
    ? new Date(c.retryAt).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : "más tarde";
  return `Se acabaron tus ${c.limite} reescrituras con IA de hoy. Vuelve ${cuando}.`;
}

function mensajeCupoCero(kind: KindUsoIa): string {
  switch (kind) {
    case "capitulo":
      return "La IA está apagada (0 historias por día). Solo el administrador puede volver a encenderla.";
    case "imagen":
      return "Las imágenes con IA están apagadas (cupo 0).";
    case "voz":
      return "La narración de pago está sin cupo (0). Usa la voz del navegador.";
    case "texto":
      return "Las reescrituras con IA están apagadas (cupo 0).";
  }
}

export type Bloqueo = {
  codigo: "sin_verificar" | "cupo_ia";
  mensaje: string;
};

/**
 * Portero global: correo verificado + historias≠0.
 * Los cupos por tarea (imagen/voz/texto) se reservan aparte en cada ruta.
 */
export async function bloqueoDeGasto(
  user: { id: string; email: string; emailVerifiedAt: Date | null },
): Promise<Bloqueo | null> {
  if (!user.emailVerifiedAt && !exento(user.email)) {
    return { codigo: "sin_verificar", mensaje: AVISO_SIN_VERIFICAR };
  }
  const lim = await leerLimiteIa();
  if (!exento(user.email) && lim <= 0) {
    return { codigo: "cupo_ia", mensaje: mensajeCupoCero("capitulo") };
  }
  const cupo = await estadoCupoHistorias(user.id, user.email);
  if (cupo.exento || cupo.quedan > 0) return null;
  return { codigo: "cupo_ia", mensaje: mensajeCupoAgotado(cupo) };
}

export function respuestaBloqueo(b: Bloqueo): Response {
  const sinVerificar = b.codigo === "sin_verificar";
  return Response.json(
    {
      error: b.mensaje,
      codigo: b.codigo,
      sinVerificar,
      sinCupo: true,
    },
    { status: sinVerificar ? 403 : 429 },
  );
}
