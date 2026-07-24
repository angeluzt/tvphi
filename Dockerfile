# TVPHI — imagen de producción (Next.js + servidor Socket.IO)
FROM node:22-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# OpenSSL es necesario para el motor de Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Dependencias (capa cacheable). Los scripts de build permitidos en
#    package.json (pnpm.onlyBuiltDependencies) se ejecutan sin interacción.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2) Código fuente + build (prisma generate + next build)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
# Railway inyecta PORT; el servidor lo respeta (server.ts).
EXPOSE 3000

# Aplica migraciones y arranca el servidor (Next + Socket.IO).
CMD ["pnpm", "start:prod"]
