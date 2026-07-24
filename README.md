# TVPHI — Plataforma de streaming moderna (sin OBS obligatorio)

TVPHI es una plataforma de streaming en vivo tipo Twitch/Kick con una diferencia clave:
**puedes transmitir directamente desde el navegador**, componiendo tu directo con escenas,
capas, texto, imágenes, fondos y transiciones — como en OBS pero online. OBS sigue siendo
compatible de forma opcional (ingest RTMP).

> Dominio objetivo: **tvphi.com**

## ✨ Funcionalidades

- **Studio en el navegador (sin OBS)** — compositor con escenas y capas: cámara, pantalla
  compartida, texto, imágenes, fondos (color/degradado) y transiciones (corte, fundido, deslizar).
  Publica por **WHIP** (WebRTC) hacia el proveedor de medios.
- **OBS opcional** — cada canal tiene clave de stream **RTMP** y una URL de **overlay** (browser source).
- **Chat moderno** con roles (host, mod, sub, viewer), **timeout / ban / bloquear / borrar mensajes**,
  **modo lento**, **modo solo-suscriptores** (limita el chat a quienes pagan) y **dar puntos**.
- **Alertas** de donación / suscripción / redención, superpuestas al video (las ven los espectadores)
  y renderizadas dentro del stream saliente.
- **Puntos = dinero** — ledger contable de puntos. Los puntos representan dinero real proveniente de
  la publicidad (acumulación simulada en esta versión, ver *Monetización*).
- **Recompensas por puntos** que **disparan acciones en el directo** (mostrar mensaje, sonido, etc.).
- **Donaciones** con Stripe (o modo simulado en desarrollo) que aparecen como alertas al instante.
- **Panel de control** con KPIs, ajustes de canal/chat, gestión de recompensas y monetización.
- UI moderna, oscura y responsive, con una paleta agradable (violeta / cian / oro).

## 🧱 Stack

- **Next.js 14** (App Router) + **TypeScript** + **TailwindCSS**
- **PostgreSQL** + **Prisma**
- **Socket.IO** (chat, moderación, presencia, alertas) sobre un servidor Node personalizado
- **Redis** (opcional; para escalar presencia/pub-sub horizontalmente)
- Auth por **JWT en cookie httpOnly** (bcrypt)
- Capa de medios con abstracción `MediaProvider`: **Mock** (dev) y **Cloudflare Stream** (producción)

## 🚀 Puesta en marcha

Requisitos: Node ≥ 20, pnpm, y PostgreSQL (Docker recomendado).

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env          # ajusta si hace falta

# 3. Base de datos + Redis (Docker)
docker compose up -d
pnpm prisma db push           # crea el esquema
pnpm seed                     # usuarios demo: phi / gamer  (contraseña: demo1234)

# 4. Desarrollo (Next + realtime en el mismo proceso)
pnpm dev
# http://localhost:3000
```

Para producción: `pnpm build && pnpm start`.

## ☁️ Despliegue

Guía completa paso a paso (Railway + Neon + Cloudflare Stream + dominio tvphi.com) en
**[`DEPLOY.md`](./DEPLOY.md)**. El repo ya incluye `Dockerfile`, `railway.json`, healthcheck
en `/api/health` y migraciones que se aplican solas al arrancar (`pnpm start:prod`).

## 🎬 Probar el flujo "sin OBS"

1. Crea una cuenta en `/auth/register` (o entra con `phi` / `demo1234`).
2. Abre **`/studio`**: añade capas (Cámara, Pantalla, Texto, Imagen, Fondo), cambia de escena
   con una transición y pulsa **Transmitir**.
3. Abre tu canal en `/<tu-usuario>` en otra pestaña: verás el estado en vivo, el chat y las alertas.
4. Pulsa **Probar alerta** en el Studio y observa la notificación tanto en el preview como en el canal.
5. Desde otra cuenta, entra al canal y prueba el chat, canjear una recompensa o **Donar**.

> En desarrollo el proveedor de medios es **`mock`**: el "Go Live" muestra un HLS de muestra a los
> espectadores y el preview local del compositor. Para video real (WHIP + RTMP + HLS por CDN),
> configura `MEDIA_PROVIDER=cloudflare` con tus credenciales de Cloudflare Stream.

## 💰 Monetización (importante)

- El **ledger de puntos** y las **donaciones** son funcionales.
- La **acumulación de ingresos por publicidad** y los **retiros de dinero** están **simulados**
  (`src/lib/billing/ads-stub.ts`, `payout-stub.ts`). La integración real requiere una **red de
  anuncios aprobada** y **cumplimiento legal** (KYC, fiscalidad, Stripe Connect). Están aislados
  tras interfaces para conectarlos más adelante sin tocar el resto de la app.

## 🗂️ Estructura

```
server.ts                     Servidor Node: Next + Socket.IO
src/server/realtime.ts        Lógica de tiempo real (chat, moderación, puntos, alertas)
src/lib/media/                MediaProvider (mock, cloudflare) + cliente WHIP
src/lib/studio/compositor.ts  Motor del compositor (canvas → MediaStream)
src/lib/points/               Ledger de puntos y recompensas
src/lib/billing/              Stripe + stubs de ads/retiros
src/app/(main)/               Páginas con chrome: home, canal, studio, dashboard, auth
src/app/overlay/[token]/      Overlay transparente para OBS
src/app/api/                  Route handlers (auth, stream, donaciones, monetización, rewards)
prisma/schema.prisma          Modelo de datos
```

## ⚙️ Configuración de medios (Cloudflare Stream)

```env
MEDIA_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=xxxx
CLOUDFLARE_STREAM_TOKEN=xxxx   # token con permiso de Stream
```

Cloudflare acepta ingest por **WHIP** (Studio) y **RTMP** (OBS) y entrega **HLS** por CDN.

## 📄 Licencia

Proyecto privado de tvphi.com.
