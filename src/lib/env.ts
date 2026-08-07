// Acceso central y tipado a variables de entorno.
//
// OPENAI_API_KEY se lee con corchetes a propósito: Next sustituye
// `process.env.ALGO` en compile-time; con `["…"]` se lee al ejecutar (deploy).

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  /**
   * La URL pública. Va con corchetes y como getter por lo mismo que la clave de
   * OpenAI: con `process.env.APP_URL` el valor se fija al compilar, así que si
   * no estaba puesta en el build quedaba clavado `localhost:3000` — y el enlace
   * de restablecer contraseña llegaba al correo apuntando a la máquina de
   * quien lo abría, o sea a ninguna parte.
   */
  get appUrl() {
    return (process.env["APP_URL"] ?? "").trim() || "http://localhost:3000";
  },
  port: Number(process.env.PORT ?? 3000),
  authSecret: process.env.AUTH_SECRET ?? "dev-secret-change-me-please-0000000000000000",
  databaseUrl: process.env.DATABASE_URL ?? "",
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

export const isProd = env.nodeEnv === "production";
