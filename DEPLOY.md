# Guía de despliegue de TVPHI (Railway + Postgres)

Despliegue de **historias narradas**. El video/audio pesado se genera en el
navegador; el servidor guarda cuentas, capítulos (JSON) y cupos de IA.

## Piezas

| Pieza | Servicio | Notas |
|---|---|---|
| App (Next.js) | **Railway** | Dockerfile + `railway.json` |
| PostgreSQL | **Neon** o plugin Railway | Obligatorio |
| DNS | **Cloudflare** (opcional) | DNS / proxy |
| IA | OpenAI (`OPENAI_API_KEY`) | Cupos en `/admin` |
| Correo reset | Resend (opcional) | Sin clave, enlace en logs en dev |

Healthcheck: `GET /api/health`. Arranque: `pnpm start:prod` (`migrate deploy` + `next start`).

---

## Paso 1 — Base de datos

Neon → New Project → `DATABASE_URL`, **o** Railway → Database → PostgreSQL.

---

## Paso 2 — App en Railway

**New Project → Deploy from GitHub** → rama **`main`**. Usa el Dockerfile del repo.

---

## Paso 3 — Variables de entorno

```
NODE_ENV=production
APP_URL=https://tvphi.com
AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=<Postgres>
OPENAI_API_KEY=<clave>
STORY_DAILY_LIMIT=3
STORY_QUOTA_EXEMPT_EMAILS=tu@email.com
```

Opcionales: `RESEND_API_KEY`, `EMAIL_FROM`, Turnstile (`TURNSTILE_*`).

Comprueba `https://tu-url/api/health` → `ok: true`.

---

## Paso 4 — Dominio

Railway → Custom Domain. Actualiza `APP_URL`.

---

## Verificación

- Registro / login → `/story` → generar un capítulo (si hay cupo y clave OpenAI).
- Export / FFmpeg en cliente.

## Notas

- **main** = producción. Abre PRs.
- Migraciones: `pnpm prisma migrate dev --name …` en local; prod con `migrate deploy`.
- Tablas Prisma de canales/chat/billing son **legado** (schema aún las declara para no
  romper migraciones antiguas); no hay UI ni rutas activas. No hace falta
  configurar Stream, Stripe ni Redis para el producto actual.
- Assets pesados viven en IndexedDB: exporta ZIP para backup entre equipos.
