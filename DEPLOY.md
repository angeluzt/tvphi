# Guía de despliegue de TVPHI (Railway + Cloudflare Stream)

Esta guía te lleva de cero a **tvphi.com en producción**, sin administrar servidores.
Todos los servicios son gestionados y tienen plan gratis o de pocos dólares para empezar.

## Piezas

| Pieza | Servicio | Coste inicial |
|---|---|---|
| App (Next.js + chat en vivo) | **Railway** | ~$5/mes de uso |
| Base de datos PostgreSQL | **Neon** o el plugin Postgres de Railway | Gratis |
| Video en vivo (ingest + CDN) | **Cloudflare Stream** | Pago por uso |
| DNS de tvphi.com | **Cloudflare** | Gratis |
| Redis (opcional, escalar chat) | **Upstash** | Gratis |
| Pagos/donaciones (opcional) | **Stripe** | Comisión por transacción |

El repo ya está preparado: `Dockerfile`, `railway.json`, healthcheck en `/api/health`,
migraciones en `prisma/migrations/` y arranque que aplica migraciones automáticamente
(`pnpm start:prod` → `prisma migrate deploy` + servidor).

---

## Paso 1 — Base de datos (Neon)

1. Crea una cuenta en <https://neon.tech> → **New Project** (región cercana a tus usuarios).
2. Copia la **connection string** (formato `postgresql://usuario:pass@host/db?sslmode=require`).
   Guárdala para el Paso 3 como `DATABASE_URL`.

> Alternativa: en Railway, **New → Database → PostgreSQL**; Railway te da `DATABASE_URL`
> automáticamente como variable de referencia.

---

## Paso 2 — Desplegar la App en Railway

1. En Railway: **New Project → Deploy from GitHub repo** → elige `angeluzt/tvphi`.
   - Autoriza el acceso de Railway a GitHub si te lo pide.
2. Rama a desplegar: **`main`** (producción). *(La rama `claude/…` es tu rama de desarrollo.)*
3. Railway detecta el **`Dockerfile`** y construye automáticamente. No cambies el builder.
4. Aún fallará el arranque hasta que añadas las variables de entorno (Paso 3). Es normal.

---

## Paso 3 — Variables de entorno (en Railway → tu servicio → Variables)

Mínimas para arrancar:

```
NODE_ENV=production
APP_URL=https://tvphi.com
AUTH_SECRET=<genera uno: openssl rand -base64 32>
DATABASE_URL=<la de Neon del Paso 1>
MEDIA_PROVIDER=mock        # cámbialo a "cloudflare" tras el Paso 4
RESEND_API_KEY=<opcional: correo de restablecer contraseña>
EMAIL_FROM=TVPHI <noreply@tudominio.com>
```

Railway define `PORT` automáticamente; el servidor ya lo respeta (no lo fijes tú).

Para Historias con IA y el panel de uso (`/admin`), añade también:

```
OPENAI_API_KEY=<tu clave>
STORY_DAILY_LIMIT=3
STORY_QUOTA_EXEMPT_EMAILS=tu@email.com
```

`STORY_QUOTA_EXEMPT_EMAILS` (correos separados por coma): sin cupo IA, pueden elegir modelos
y ven **Uso** en la cabecera → `/admin` (estadísticas + cupo IA editable).
`STORY_DAILY_LIMIT` es el valor inicial del cupo; en `/admin` se puede cambiar sin redeploy.

Tras guardarlas, Railway redepliega. Cuando el deploy quede en verde, abre la URL temporal
de Railway (algo como `https://tvphi-production.up.railway.app`) y comprueba `…/api/health`
→ debe responder `{"ok":true,...}`.

Para que el enlace de «restablecer contraseña» abra bien, `APP_URL` debe ser la URL pública
real (p. ej. `https://tvphi.com`). Sin `RESEND_API_KEY`, en desarrollo el enlace se imprime
en los logs del servidor.

---

## Paso 4 — Video en vivo con Cloudflare Stream

1. En el **dashboard de Cloudflare** → menú **Stream** → actívalo (pide método de pago; es pago por uso).
2. Consigue dos datos:
   - **Account ID**: dashboard de Cloudflare → barra lateral derecha “Account ID”.
   - **API Token**: **My Profile → API Tokens → Create Token → Custom Token** con permiso
     **Account · Stream · Edit**. Copia el token (solo se muestra una vez).
3. Añade en Railway (Variables) y redepliega:

```
MEDIA_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=<tu account id>
CLOUDFLARE_STREAM_TOKEN=<tu api token>
```

A partir de aquí, al pulsar **Transmitir** en el Studio se crea un *Live Input* real:
- El navegador publica por **WHIP** (WebRTC).
- OBS puede publicar por **RTMP** con la clave que muestra el Studio.
- Los espectadores reciben **HLS** por la CDN de Cloudflare.

---

## Paso 5 — Conectar el dominio tvphi.com

En Railway → tu servicio → **Settings → Networking → Custom Domain** → escribe `tvphi.com`
(y opcionalmente `www.tvphi.com`). Railway te dará un destino **CNAME**.

En **Cloudflare → tu dominio tvphi.com → DNS**:
- Añade un registro **CNAME** `@` (o `www`) apuntando al destino que dio Railway.
  - Para el dominio raíz (`@`), Cloudflare permite CNAME “flattening”.
- Deja el proxy de Cloudflare en **DNS only** (nube gris) al principio; una vez que funcione,
  puedes activar el proxy (nube naranja). El **SSL** lo gestiona Railway/Cloudflare.

Actualiza también `APP_URL=https://tvphi.com` en Railway si aún no lo estaba.

---

## Paso 6 — Opcionales

### Redis (Upstash) — para escalar el chat a varias instancias
1. <https://upstash.com> → crea una base Redis → copia la **Redis URL** (`rediss://…`).
2. En Railway: `REDIS_URL=<url de upstash>`.

### Stripe — donaciones y suscripciones reales
1. <https://dashboard.stripe.com> → **Developers → API keys** → copia la **Secret key**.
2. **Developers → Webhooks → Add endpoint** → URL `https://tvphi.com/api/stripe/webhook`,
   evento `checkout.session.completed`. Copia el **Signing secret**.
3. En Railway:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_ENABLED=true
```
> `NEXT_PUBLIC_STRIPE_ENABLED` se inserta en el build; tras cambiarla, fuerza un redepliegue.

---

## Verificación final

- `https://tvphi.com/api/health` → `{"ok":true}`.
- Regístrate, abre **/studio**, añade capas y pulsa **Transmitir**.
- Abre tu canal en otra pestaña: video en vivo (con Cloudflare), chat en tiempo real y alertas.
- Prueba una donación (simulada o real según Stripe).

## Notas

- **Monetización por ads y retiros** siguen simulados (requieren red de anuncios aprobada +
  KYC/Stripe Connect). Ver `src/lib/billing/`.
- La **rama `main`** es producción; desarrolla en `claude/tvphi-streaming-platform-w8dpv4`
  y abre PRs hacia `main`. Cada push a `main` redepliega en Railway automáticamente.
- Para **migraciones futuras**: crea la migración en desarrollo (`pnpm prisma migrate dev --name X`)
  y al desplegarse `pnpm start:prod` la aplica sola con `prisma migrate deploy`.
