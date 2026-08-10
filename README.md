# TVPHI — Historias narradas

TVPHI es una app para **crear historias narradas con IA** (texto, imágenes, voz) y
componerlas/exportarlas **en el navegador**. El servidor guarda la **cuenta** y los
**capítulos** (JSON); audio, imágenes pesadas y el video final viven en el dispositivo.

## Qué incluye

- **Historias** (`/story`): generar capítulos con IA, personajes, voz, export ZIP/video.
- **Personajes** y **sprites** (`/sprites`, `/lab`): biblia y animaciones 2.5D.
- Composición + FFmpeg WASM en el cliente (el video no se sube al servidor).
- Auth (JWT httpOnly), cupos de IA, panel `/admin` para exentos.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **PostgreSQL** + Prisma
- Auth JWT en cookie + bcrypt
- OpenAI en rutas `/api/story/ia/*` (clave solo en servidor)

## Puesta en marcha

Requisitos: Node ≥ 20, pnpm y PostgreSQL.

```bash
pnpm install
cp .env.example .env
# Rellena DATABASE_URL (y AUTH_SECRET en producción)
docker compose up -d            # postgres, si usas el compose del repo
pnpm prisma migrate deploy
pnpm seed                       # opcional: phi / demo1234
pnpm dev                        # http://localhost:3000 → /story
```

Producción: `pnpm build && pnpm start` (o `pnpm start:prod` con migraciones).

## Tests

```bash
pnpm test
pnpm typecheck
pnpm lint
```

## Despliegue

Guía en [`DEPLOY.md`](./DEPLOY.md) (Railway + Postgres).

## Licencia

Proyecto privado de tvphi.com.
