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

Healthcheck: `GET /api/health` → `{"ok":true,"db":"ok",…}`. Si la BD cae, **503**.

Arranque recomendado: `pnpm start:prod` (`prisma migrate deploy` + `next start`).

---

## Paso 1 — Base de datos

1. Neon → New Project → copia `DATABASE_URL` (`postgresql://…?sslmode=require`), **o**
2. Railway → Database → PostgreSQL.

**Importante (Railway):** enlaza la variable con la URL **privada**, no la pública.

En el servicio de la **App** → Variables:

- `DATABASE_URL` = referencia `${{Postgres.DATABASE_URL}}` (red interna), **o**
- `DATABASE_PRIVATE_URL` = `${{Postgres.DATABASE_PRIVATE_URL}}` (el arranque la preferirá)

Si pegas a mano una URL con `*.proxy.rlwy.net`, el contenedor a veces **no alcanza** Postgres
(`Prisma P1001` / `Connection reset`) y Cloudflare enseña **502 Bad gateway**. Antes
podía “funcionar a ratos”; tras un redeploy suele romper.

Sin migraciones aplicadas la app no sirve historias. En deploy, `start:prod` las aplica.

---

## Paso 2 — App en Railway

1. **New Project → Deploy from GitHub** → `angeluzt/tvphi`, rama **`main`**.
2. Usa el **Dockerfile** del repo.
3. Añade variables (Paso 3) antes de esperar un arranque sano.

---

## Paso 3 — Variables de entorno

**Obligatorias en producción** (la app falla al arrancar si faltan — fail-closed):

```
NODE_ENV=production
APP_URL=https://tvphi.com
AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=<Postgres privado / referencia Railway>
# Opcional en Railway (prioridad sobre DATABASE_URL):
# DATABASE_PRIVATE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
```

Recomendadas para Historias + admin:

```
OPENAI_API_KEY=<clave>
STORY_DAILY_LIMIT=3
STORY_QUOTA_EXEMPT_EMAILS=tu@email.com
RESEND_API_KEY=<opcional>
EMAIL_FROM=TVPHI <noreply@tudominio.com>
```

Opcionales: Turnstile (`TURNSTILE_*`).

- `STORY_QUOTA_EXEMPT_EMAILS`: sin cupo IA y acceso a `/admin`.
- Cupos (`historiasPorDia`, imágenes, voces, textos) se editan en `/admin`; **0** = cortar gasto.
- Rate limit de login es **en memoria** (por instancia Railway). Suficiente en un solo
  réplica; no es un firewall compartido entre nodos.

Comprueba `https://tu-url/api/health` → `ok: true` y `db: "ok"`.

---

## Paso 4 — Dominio

Railway → Custom Domain → `tvphi.com`. En Cloudflare DNS, CNAME al destino Railway.
Actualiza `APP_URL` a la URL pública real.

---

## Verificación

- `/api/health` → 200 y `db: "ok"`.
- Registro / login → `/story` → generar un capítulo con IA (si hay cupo y `OPENAI_API_KEY`).
- Guardar capítulo y reabrir desde la cuenta.
- Export / FFmpeg en cliente (sin subir el MP4 al servidor).

## Notas

- **main** = producción. Abre PRs; cada push a `main` redepliega.
- Migraciones: `pnpm prisma migrate dev --name …` en local; prod las aplica con `migrate deploy`.
- Tablas Prisma de canales/chat/billing son **legado** (schema aún las declara para no
  romper migraciones antiguas); no hay UI ni rutas activas. No hace falta
  configurar Stream, Stripe ni Redis para el producto actual.
- Assets grandes (imágenes/audio) van en IndexedDB del navegador: un cambio de PC
  no los restaura solos (exporta ZIP si quieres backup).
