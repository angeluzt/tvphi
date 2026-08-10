# TVPHI — Historias narradas (y composición en el navegador)

TVPHI es una app para **crear historias narradas con IA** (texto, imágenes, voz) y
componerlas/exportarlas **en el navegador**. El servidor guarda la **cuenta**, los
**capítulos** (JSON) y aplica cupos/auth; audio, imágenes pesadas y el video final
viven en el dispositivo (IndexedDB / descarga).

## Qué incluye

- **Historias** (`/story`): generar capítulos con IA, personajes, voz, export ZIP/video.
- **Personajes** y **sprites** (`/sprites`, lab): biblia y animaciones sin mezclar flujos.
- **Composición + FFmpeg WASM** en el cliente (no sube el video al servidor).
- Auth (JWT httpOnly), cupos diarios de IA atómicos, panel `/admin` para exentos.

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
# Rellena DATABASE_URL y AUTH_SECRET (obligatorios en producción)
docker compose up -d            # postgres, si usas el compose del repo
pnpm prisma migrate deploy
pnpm seed                       # opcional
pnpm dev                        # http://localhost:3000 → /story
```

Producción: `pnpm build && pnpm start` (o `pnpm start:prod` con migraciones).

## Seguridad / ops (resumen)

- Sin `AUTH_SECRET` / `DATABASE_URL` en producción la app **no arranca**.
- `/api/health` responde **503** si Postgres no contesta.
- Cupos IA atómicos (`AiUsage`); `historiasPorDia = 0` corta gasto de IA.
- Rate limit de login en memoria (una instancia); cabeceras CSP/HSTS vía middleware.
- CI: lint, typecheck, test y build en cada PR.

## Despliegue

Guía en [`DEPLOY.md`](./DEPLOY.md) (Railway + Postgres). Cloudflare Stream / chat en vivo
es **legado opcional**, no el producto principal.

## Licencia

Proyecto privado de tvphi.com.
