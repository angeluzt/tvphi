#!/usr/bin/env sh
# Arranque de producción.
# Aplica migraciones y arranca el servidor. Reintenta las migraciones porque en
# Railway la red privada (*.railway.internal) puede tardar unos segundos en estar
# disponible tras arrancar el contenedor, y `prisma migrate deploy` correría antes.

set -e

# Preferir la URL privada de Railway si existe. El proxy público
# (*.proxy.rlwy.net) desde DENTRO del mismo proyecto es inestable y produce
# P1001 / Connection reset → Cloudflare 502 aunque AUTH_SECRET esté bien.
if [ -n "${DATABASE_PRIVATE_URL:-}" ]; then
  echo "🔌 Usando DATABASE_PRIVATE_URL (red interna Railway)."
  export DATABASE_URL="$DATABASE_PRIVATE_URL"
elif [ -n "${DATABASE_URL:-}" ] && echo "$DATABASE_URL" | grep -Eq 'proxy\.rlwy\.net|[.]rlwy\.net:[0-9]+'; then
  echo "⚠️  DATABASE_URL apunta al proxy PÚBLICO de Railway (*.proxy.rlwy.net / *.rlwy.net:puerto)."
  echo "   Eso suele fallar a ratos desde el contenedor de la app → Bad gateway 502."
  echo "   Arreglo en Railway → tu servicio App → Variables:"
  echo "   • Borra el DATABASE_URL pegado a mano (si lo hay)."
  echo "   • Añade referencia: \${{ Postgres.DATABASE_URL }}  (red privada), o"
  echo "   • Define DATABASE_PRIVATE_URL=\${{ Postgres.DATABASE_PRIVATE_URL }} y deja que este script la use."
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Falta DATABASE_URL (o DATABASE_PRIVATE_URL). Sin Postgres la app no arranca."
  exit 1
fi

# Enmascarar credenciales al mostrar el host.
DB_HOST=$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]+@##; s#/.*##')
echo "🗄️  Postgres target: $DB_HOST"

MAX="${MIGRATE_RETRIES:-20}"
DELAY="${MIGRATE_RETRY_DELAY:-3}"
i=1

while true; do
  if OUT=$(pnpm exec prisma migrate deploy 2>&1); then
    printf '%s\n' "$OUT"
    echo "✅ Migraciones aplicadas."
    break
  fi
  printf '%s\n' "$OUT"
  if echo "$OUT" | grep -q "P1001"; then
    echo "❌ Prisma P1001: no se alcanza el servidor de base de datos ($DB_HOST)."
  elif echo "$OUT" | grep -q "P1000\|P1017\|P1003"; then
    echo "❌ Error de conexión/credenciales a Postgres. Revisa usuario, password y que el plugin esté Running."
  fi
  if [ "$i" -ge "$MAX" ]; then
    echo "❌ Abortando tras $i intentos. La app NO arranca sin DB (evita un 502 silencioso)."
    echo "   Comprueba en Railway: Postgres Running + variable privada enlazada al servicio App."
    exit 1
  fi
  echo "⏳ Base de datos no disponible aún (intento $i/$MAX). Reintentando en ${DELAY}s..."
  i=$((i + 1))
  sleep "$DELAY"
done

exec pnpm exec next start
