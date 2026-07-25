# TVPHI — Crea videos en el navegador (graba · recorta · descarga)

TVPHI es una herramienta **para crear videos** (cursos, YouTube) que funciona **enteramente en el
navegador**. Compones tu video con **capas y escenas** —cámara, pantalla, texto, imágenes, fondos y
cambios de escena en vivo—, **grabas** con pausa/reanudar, **recortas** el inicio/fin y lo
**descargas** en alta calidad (WebM, listo para YouTube).

> **Los videos no se suben a ningún servidor**: se graban y descargan en el equipo del usuario.
> El servidor solo guarda la **cuenta** y el **proyecto** (las escenas/capas en JSON).

## ✨ Funcionalidades

- **Studio de composición**: capas de cámara, pantalla compartida, texto, imágenes y fondos
  (color/degradado), con **arrastrar/redimensionar**, reordenar en Z y **escenas** con transiciones
  (corte/fundido/deslizar).
- **Grabación** con **cuenta atrás**, **pausar/reanudar** y cronómetro; cambia de escena mientras
  grabas para intros, títulos y pantallas de comentarios.
- **Música/sonido de fondo** mezclado en la grabación.
- **Recorte** de inicio/fin y **descarga** en WebM (720p/1080p).
- **Autoguardado** del proyecto (escenas/capas) en tu cuenta.

## 🧱 Stack

- **Next.js 14** (App Router) + **TypeScript** + **TailwindCSS**
- **PostgreSQL** + **Prisma** (solo cuentas y proyectos)
- Auth por **JWT en cookie httpOnly** (bcrypt)
- Motor de composición propio sobre **Canvas** (`src/lib/studio/compositor.ts`) + grabación con
  **`MediaRecorder`** (`recorder.ts`) y recorte con re-grabación (`trim.ts`) — 100% en el navegador.

## 🚀 Puesta en marcha

Requisitos: Node ≥ 20, pnpm y PostgreSQL (Docker recomendado).

```bash
pnpm install
cp .env.example .env
docker compose up -d            # postgres
pnpm prisma migrate deploy      # crea el esquema
pnpm seed                       # usuario demo: phi / demo1234 (opcional)
pnpm dev                        # http://localhost:3000  →  /studio
```

Producción: `pnpm build && pnpm start`.

## 🎬 Probar

1. Entra en `/studio`.
2. Añade capas (cámara, pantalla, texto, imagen, fondo) y crea 2-3 escenas.
3. Pulsa **Grabar** (cuenta atrás), cambia de escena, **pausa/reanuda**, añade música si quieres.
4. **Detener** → en el panel, previsualiza, **recorta** inicio/fin y **Descarga** el WebM.

## ☁️ Despliegue

Guía en [`DEPLOY.md`](./DEPLOY.md) (Railway + Postgres). Como el video nunca toca el servidor, la
infraestructura es mínima y barata.

## 📄 Licencia

Proyecto privado de tvphi.com.
