#!/usr/bin/env sh
# Arranque de producción.
# Aplica migraciones y arranca el servidor. Reintenta las migraciones porque en
# Railway la red privada (*.railway.internal) puede tardar unos segundos en estar
# disponible tras arrancar el contenedor, y `prisma migrate deploy` correría antes.

set -e

MAX="${MIGRATE_RETRIES:-12}"
DELAY="${MIGRATE_RETRY_DELAY:-3}"
i=1

while true; do
  if pnpm exec prisma migrate deploy; then
    break
  fi
  if [ "$i" -ge "$MAX" ]; then
    echo "❌ No se pudo conectar a la base de datos tras $i intentos. Revisa DATABASE_URL."
    exit 1
  fi
  echo "⏳ Base de datos no disponible aún (intento $i/$MAX). Reintentando en ${DELAY}s..."
  i=$((i + 1))
  sleep "$DELAY"
done

exec pnpm exec next start
