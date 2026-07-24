// Acceso central y tipado a variables de entorno.
// No lanzamos en import para permitir arrancar en dev con valores por defecto.

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  port: Number(process.env.PORT ?? 3000),
  authSecret: process.env.AUTH_SECRET ?? "dev-secret-change-me-please-0000000000000000",

  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  mediaProvider: (process.env.MEDIA_PROVIDER ?? "mock") as "mock" | "cloudflare",
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
  cloudflareStreamToken: process.env.CLOUDFLARE_STREAM_TOKEN ?? "",
  mockPlaybackUrl:
    process.env.MOCK_PLAYBACK_URL ??
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeEnabled: (process.env.NEXT_PUBLIC_STRIPE_ENABLED ?? "false") === "true",

  pointsPerUsd: Number(process.env.POINTS_PER_USD ?? 1000),
};

export const isProd = env.nodeEnv === "production";
