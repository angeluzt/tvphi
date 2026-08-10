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

**Importante (Railway) — una sola variable:**

En la **App** → Variables define:

```text
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
```

(Sustituye `Postgres` por el **nombre exacto** de tu servicio Postgres en Railway si es otro.)

- Prisma y el arranque leen **`DATABASE_URL`** (no otra clave).
- Con `DATABASE_PRIVATE_URL` como valor de referencia evitas el proxy público (`*.proxy.rlwy.net`) que corta conexiones → `failed to fetch` / P1017.
- **No** dejes `DATABASE_URL` vacío. Si la referencia no resuelve, arregla el nombre del servicio; no pegues la pública otra vez salvo como apaño temporal.

Opcional: si también defines `DATABASE_PRIVATE_URL` aparte, el arranque la preferirá; no hace falta si ya metiste la privada dentro de `DATABASE_URL`.

Sin migraciones aplicadas la app no sirve historias. En deploy, `start:prod` las aplica.

Las carpetas en `prisma/migrations` usan prefijos `00_`…`09_` para que el orden lexicográfico
coincida con el orden real (si no, `10_` corre antes que `4_` y falla en DB vacías).

Si reutilizas una DB **antigua** que ya aplicó nombres sin cero (`0_init`, `4_characters`, …),
actualiza los nombres en `_prisma_migrations` para que coincidan con las carpetas nuevas
(`00_init`, `04_characters`, …) **antes** del siguiente deploy. En una DB nueva basta con:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

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
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
```

(Cambia `Postgres` si el nombre del servicio es otro. Prisma lee solo `DATABASE_URL`.)

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
