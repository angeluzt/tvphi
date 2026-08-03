// Acceso central y tipado a variables de entorno.
//
// OPENAI_API_KEY se lee con corchetes a propósito: Next sustituye
// `process.env.ALGO` en compile-time; con `["…"]` se lee al ejecutar (deploy).

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  port: Number(process.env.PORT ?? 3000),
  authSecret: process.env.AUTH_SECRET ?? "dev-secret-change-me-please-0000000000000000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** Clave de OpenAI del despliegue. Nunca se pide ni se guarda desde el navegador. */
  get openaiApiKey() {
    return (process.env["OPENAI_API_KEY"] ?? "").trim();
  },
};

export const isProd = env.nodeEnv === "production";
