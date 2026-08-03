import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { esAdminHistorias } from "@/lib/story/cupo";

// Credenciales de OpenAI: SOLO en el servidor (OPENAI_API_KEY al desplegar).
// El usuario normal no elige modelos ni ve claves: usa los de abajo.
// Solo el admin (STORY_QUOTA_EXEMPT_EMAILS) puede cambiar modelos en la UI.

/** Mensaje genérico si la IA del servidor no responde. Sin detalles técnicos. */
export const IA_NO_DISPONIBLE =
  "La IA no está disponible ahora. Inténtalo más tarde.";

/** Clave del servidor. null si no está configurada en el entorno. */
export function claveOpenAi(): string | null {
  const k = env.openaiApiKey;
  return k || null;
}

export function hayOpenAi(): boolean {
  return !!claveOpenAi();
}

// Modelos fijos para todo el mundo (salvo override de admin / env).
export const MODELOS_POR_DEFECTO = {
  texto: "gpt-5.6-luna",
  imagen: "gpt-image-2",
  voz: "gpt-4o-mini-tts",
  vozNombre: "alloy",
};
export type Modelos = typeof MODELOS_POR_DEFECTO;

/** Overrides opcionales del despliegue (Railway). */
export function modelosEnv(): Partial<Modelos> {
  return {
    texto: (process.env["OPENAI_MODEL_TEXTO"] ?? "").trim(),
    imagen: (process.env["OPENAI_MODEL_IMAGEN"] ?? "").trim(),
    voz: (process.env["OPENAI_MODEL_VOZ"] ?? "").trim(),
    vozNombre: (process.env["OPENAI_VOICE"] ?? "").trim() || undefined,
  };
}

function baseModelos(): Modelos {
  const e = modelosEnv();
  return {
    texto: e.texto || MODELOS_POR_DEFECTO.texto,
    imagen: e.imagen || MODELOS_POR_DEFECTO.imagen,
    voz: e.voz || MODELOS_POR_DEFECTO.voz,
    vozNombre: e.vozNombre || MODELOS_POR_DEFECTO.vozNombre,
  };
}

/**
 * Modelos a usar.
 * Usuario normal → siempre los de por defecto (o env del deploy).
 * Admin → puede tener preferencias guardadas encima.
 */
export async function preferenciasModelos(userId: string, email: string): Promise<Modelos> {
  const base = baseModelos();
  if (!esAdminHistorias(email)) return base;

  const cred = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const userMods = (cred?.models as Partial<Modelos> | null) ?? {};
  const pick = (k: keyof Modelos) =>
    (typeof userMods[k] === "string" && userMods[k]!.trim()) || base[k];
  return {
    texto: pick("texto"),
    imagen: pick("imagen"),
    voz: pick("voz"),
    vozNombre: pick("vozNombre") || "alloy",
  };
}

/** Solo admin puede guardar elección de modelos. */
export async function guardarModelos(
  userId: string,
  email: string,
  models: Partial<Modelos>,
) {
  if (!esAdminHistorias(email)) {
    throw new Error("Solo el administrador puede cambiar los modelos.");
  }
  const previos = await prisma.aiCredential.findUnique({
    where: { userId },
    select: { models: true },
  });
  const fusion = {
    ...baseModelos(),
    ...((previos?.models as object) ?? {}),
    ...models,
  };
  await prisma.aiCredential.upsert({
    where: { userId },
    create: {
      userId,
      provider: "openai",
      encrypted: "env",
      hint: "servidor",
      models: fusion as object,
    },
    update: { models: fusion as object },
  });
  return fusion as Modelos & Record<string, unknown>;
}

export const OPENAI = (ruta: string) =>
  `${(process.env["OPENAI_BASE_URL"] || "https://api.openai.com").replace(/\/+$/, "")}${ruta}`;
