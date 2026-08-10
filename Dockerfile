# TVPHI — imagen de producción (Next.js)
FROM node:22-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
# Usa la versión de pnpm fijada en package.json (packageManager) sin prompt interactivo.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# OpenSSL es necesario para el motor de Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Dependencias (capa cacheable).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2) Código fuente + build (prisma generate + next build)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
# Railway inyecta PORT; Next lo respeta.
EXPOSE 3000

# Aplica migraciones y arranca Next.
CMD ["pnpm", "start:prod"]
