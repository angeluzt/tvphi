// Acceso central y tipado a variables de entorno.
//
// OPENAI_API_KEY se lee con corchetes a propósito: Next sustituye
// `process.env.ALGO` en compile-time; con `["…"]` se lee al ejecutar (deploy).

export const isProd = (process.env.NODE_ENV ?? "development") === "production";

const DEV_AUTH_SECRET = "dev-secret-change-me-please-0000000000000000";

/**
 * `next build` también pone NODE_ENV=production, pero las secrets de Railway
 * (y la mayoría de PaaS) solo existen en runtime. Fallar en esa fase deja el
 * deploy roto aunque AUTH_SECRET esté bien configurado para servir.
 */
export function esFaseBuildNext() {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function secretOrFail(name: string, raw: string | undefined, faltanteDev?: string): string {
  const v = (raw ?? "").trim();
  if (v) return v;
  // Durante el build no exigimos secrets: se comprobarán al arrancar el server.
  if (isProd && !esFaseBuildNext()) {
    throw new Error(
      `Falta ${name} en producción. La app no arranca sin variables críticas.`,
    );
  }
  return faltanteDev ?? "";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  /**
   * La URL pública. Con la que se arman los enlaces de los correos, así que si
   * sale mal el correo llega pero no lleva a ninguna parte.
   *
   * Getter, y tratando la cadena vacía como ausente: con `APP_URL=""` puesta en
   * el servidor, `?? "…"` la dejaba pasar y `new URL("")` reventaba en vez de
   * caer al valor por defecto.
   */
  get appUrl() {
    return (process.env["APP_URL"] ?? "").trim() || "http://localhost:3000";
  },
  port: Number(process.env.PORT ?? 3000),
  /**
   * En producción (runtime) NO hay valor por defecto: un despliegue sin
   * AUTH_SECRET tiene que fallar al servir, no firmar sesiones con un secreto
   * público. El build de Next puede evaluarla: ahí se permite vacía.
   */
  get authSecret() {
    return secretOrFail("AUTH_SECRET", process.env.AUTH_SECRET, DEV_AUTH_SECRET);
  },
  get databaseUrl() {
    return secretOrFail("DATABASE_URL", process.env.DATABASE_URL, "");
  },
  /** Clave de OpenAI del despliegue. Nunca se pide ni se guarda desde el navegador. */
  get openaiApiKey() {
    return (process.env["OPENAI_API_KEY"] ?? "").trim();
  },
  /** Resend: correo de restablecer contraseña. Sin clave, en dev se imprime el enlace. */
  get resendApiKey() {
    return (process.env["RESEND_API_KEY"] ?? "").trim();
  },
  get emailFrom() {
    return (process.env["EMAIL_FROM"] ?? "TVPHI <onboarding@resend.dev>").trim();
  },
};

/** Comprueba variables que no pueden faltar al servir tráfico real (no en `next build`). */
export function assertEnvProduccion() {
  if (!isProd || esFaseBuildNext()) return;
  void env.authSecret;
  void env.databaseUrl;
}
