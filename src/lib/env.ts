// Acceso central y tipado a variables de entorno.

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  port: Number(process.env.PORT ?? 3000),
  authSecret: process.env.AUTH_SECRET ?? "dev-secret-change-me-please-0000000000000000",
  databaseUrl: process.env.DATABASE_URL ?? "",
};

export const isProd = env.nodeEnv === "production";
