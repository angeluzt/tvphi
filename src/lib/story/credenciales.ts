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

/**
 * Cuánto se espera a OpenAI antes de rendirse.
 *
 * Existe para GANARLE la carrera al proxy. Sin límite, una petición lenta
 * —dibujar una imagen tarda lo suyo— se alarga hasta que el borde de Railway
 * corta por su cuenta, y lo que llega al navegador es una PÁGINA de error, no
 * JSON. El editor entonces solo sabía decir «Unexpected token '<'», que no
 * ayuda a nadie. Cortando aquí primero, siempre sale un mensaje que se entiende.
 *
 * LAS IMÁGENES SUBIERON DE 100 A 240 s, y esto es un compromiso, no una mejora
 * limpia. En calidad baja una imagen tarda 20–40 s y 100 s sobraban; en calidad
 * ALTA, con un lienzo de 1024×1536, se pasa de 100 s a menudo y la generación
 * fallaba SIEMPRE —o sea que la calidad alta no se podía usar—. Con 240 s cabe.
 *
 * Lo que se paga a cambio: si el borde de Railway corta antes que nosotros, se
 * pierde el mensaje legible y vuelve la página de error. Por eso `pista()` en
 * pedir-json.ts dice explícitamente que pruebe con calidad media cuando pasa:
 * si no podemos explicar el fallo, al menos decimos qué hacer.
 */
export const ESPERA_MS = { texto: 90_000, imagen: 240_000, voz: 90_000 } as const;

/** El `signal` para un fetch a OpenAI, con su límite de tiempo. */
export const espera = (tipo: keyof typeof ESPERA_MS) => AbortSignal.timeout(ESPERA_MS[tipo]);

/** Traduce un fallo de red o un tiempo agotado a algo legible. */
export function motivoFallo(e: any, tipo: keyof typeof ESPERA_MS): string {
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return `OpenAI tardó más de ${Math.round(ESPERA_MS[tipo] / 1000)} s y se canceló. `
      + "Suele ser un pico de carga suyo: vuelve a intentarlo.";
  }
  return "No se pudo hablar con OpenAI: " + (e?.message ?? "");
}
