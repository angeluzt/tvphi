import { prisma } from "@/lib/prisma";
import { AVISO_SIN_VERIFICAR } from "@/lib/email-verify";

// Cupo de historias CON IA (escribir capítulo), no de videos manuales.
//
// Ventana móvil de 24 h: N generaciones; al agotar, espera a que caduque la
// más antigua. Los usos se guardan en AiCredential.models.usosIaCapitulo.
// N se lee de AppSetting (admin) o, si no hay, de STORY_DAILY_LIMIT (env).

const VENTANA_MS = 24 * 60 * 60 * 1000;
const CLAVE_USOS = "usosIaCapitulo";
const CLAVE_USOS_IMG = "usosIaImagen";
const CLAVE_LIMITE = "story_daily_limit";
const LIMITE_DEFECTO = 3;
const LIMITE_MIN = 1;
const LIMITE_MAX = 100;

function parseLimite(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < LIMITE_MIN) return null;
  return Math.min(LIMITE_MAX, Math.floor(n));
}

function limiteEnv(): number {
  return parseLimite(process.env["STORY_DAILY_LIMIT"]) ?? LIMITE_DEFECTO;
}

/** Cupo de capítulos IA / 24 h para usuarios normales. */
export async function leerLimiteIa(): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CLAVE_LIMITE } });
    const desdeDb = row ? parseLimite(row.value) : null;
    if (desdeDb != null) return desdeDb;
  } catch {
    // Si aún no existe la tabla (migración pendiente), cae al env.
  }
  return limiteEnv();
}

/** Guarda el cupo IA (admin). Devuelve el valor efectivo. */
export async function guardarLimiteIa(n: number): Promise<number> {
  const v = parseLimite(n);
  if (v == null) throw new Error(`El límite debe estar entre ${LIMITE_MIN} y ${LIMITE_MAX}.`);
  await prisma.appSetting.upsert({
    where: { key: CLAVE_LIMITE },
    create: { key: CLAVE_LIMITE, value: String(v) },
    update: { value: String(v) },
  });
  return v;
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
  const lim = await leerLimiteIa();
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

/**
 * Portero para TODA ruta que gaste tokens del servidor.
 *
 * Dos motivos para no dejar pasar, y los dos protegen lo mismo —la clave de
 * OpenAI, que la paga el dueño del despliegue—:
 *
 * 1. El correo sin confirmar. Si no, cualquiera se apunta con una dirección de
 *    usar y tirar, gasta el cupo del día, y vuelve a apuntarse con otra.
 * 2. El cupo agotado. No se llama a OpenAI para NADA: ni escribir, ni dibujar,
 *    ni narrar, ni rehacer una frase. Antes solo se miraba al escribir el
 *    capítulo, así que quien se quedaba sin historias podía seguir pidiendo
 *    imágenes —lo más caro de todo— sin límite ninguno.
 *
 * Lo que sigue funcionando en los dos casos: el editor entero y la voz del
 * navegador, que es gratis y no toca el servidor. Registrarse y no poder hacer
 * nada sería otra cosa; esto solo frena lo que cuesta dinero.
 *
 * Devuelve null si puede pasar, o el motivo si no.
 */
export type Bloqueo = {
  /** Para que la interfaz sepa qué ofrecer: confirmar el correo, o esperar. */
  codigo: "sin_verificar" | "cupo_ia";
  mensaje: string;
};

export async function bloqueoDeGasto(
  user: { id: string; email: string; emailVerifiedAt: Date | null },
): Promise<Bloqueo | null> {
  if (!user.emailVerifiedAt && !exento(user.email)) {
    return { codigo: "sin_verificar", mensaje: AVISO_SIN_VERIFICAR };
  }
  const cupo = await estadoCupoHistorias(user.id, user.email);
  if (cupo.exento || cupo.quedan > 0) return null;
  return { codigo: "cupo_ia", mensaje: mensajeCupoAgotado(cupo) };
}

/**
 * La respuesta del portero, igual en todas las rutas.
 *
 * Los dos casos NO son el mismo error y no pueden contestar lo mismo: al que
 * no ha confirmado el correo hay que mandarlo a confirmarlo (403), y al que
 * gastó su cupo, a esperar (429). Cuando los dos salían como «429 sin cupo»,
 * a quien acababa de registrarse le decíamos que esperase 24 horas por algo
 * que se arregla abriendo un correo.
 */
export function respuestaBloqueo(b: Bloqueo): Response {
  const sinVerificar = b.codigo === "sin_verificar";
  return Response.json(
    {
      error: b.mensaje,
      codigo: b.codigo,
      sinVerificar,
      // `sinCupo` es lo que mira el editor para caer a la voz del navegador.
      // Vale para los dos: en ninguno de los dos hay voz de pago disponible.
      sinCupo: true,
    },
    { status: sinVerificar ? 403 : 429 },
  );
}


// ── Cupo de IMÁGENES ────────────────────────────────────────────────────────
//
// Aparte del de historias porque se agotan a ritmos muy distintos: una historia
// son varias imágenes, y las imágenes son el 80% de la factura. Mismo mecanismo
// —ventana móvil de 24 h guardada en AiCredential— para no inventar otro.

import { leerAjustes } from "@/lib/story/ajustes";

function usosImagen(models: unknown): Date[] {
  const raw = (models as Record<string, unknown> | null)?.[CLAVE_USOS_IMG];
  if (!Array.isArray(raw)) return [];
  const desde = Date.now() - VENTANA_MS;
  return raw
    .map((x) => new Date(String(x)))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= desde)
    .sort((a, b) => a.getTime() - b.getTime());
}

export async function estadoCupoImagenes(userId: string, email: string): Promise<CupoHistorias> {
  const { imagenesPorDia: lim } = await leerAjustes();
  if (exento(email)) {
    return { exento: true, usadas: 0, limite: lim, quedan: lim, retryAt: null };
  }
  const cred = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const recientes = usosImagen(cred?.models);
  const usadas = recientes.length;
  const quedan = Math.max(0, lim - usadas);
  const retryAt =
    usadas >= lim && recientes[0]
      ? new Date(recientes[0].getTime() + VENTANA_MS).toISOString()
      : null;
  return { exento: false, usadas, limite: lim, quedan, retryAt };
}

/** Anota una imagen generada. Solo se llama si de verdad salió. */
export async function registrarUsoIaImagen(userId: string) {
  const cred = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const models = { ...((cred?.models as object) ?? {}) } as Record<string, unknown>;
  const vivos = usosImagen(models).map((d) => d.toISOString());
  vivos.push(new Date().toISOString());
  models[CLAVE_USOS_IMG] = vivos;
  await prisma.aiCredential.upsert({
    where: { userId },
    create: { userId, provider: "openai", encrypted: "env", hint: "servidor", models: models as object },
    update: { models: models as object },
  });
}

export function mensajeCupoImagenes(c: CupoHistorias): string {
  const cuando = c.retryAt
    ? new Date(c.retryAt).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : "más tarde";
  return `Se acabaron tus ${c.limite} imágenes con IA de hoy. Vuelve ${cuando}.`;
}
