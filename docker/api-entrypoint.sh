#!/bin/sh
# Arranque de la API en el despliegue de prueba.
#
# Tres pasos, en este orden y por este motivo:
#
#   1. Migrar. `migrate deploy` no pregunta nada y es idempotente, asi que
#      repetir un arranque es seguro.
#   2. Sembrar la cuenta. El registro publico esta cerrado (`disableSignUp`),
#      asi que sin esto no habria forma de entrar. El propio guion no hace nada
#      si la cuenta ya existe.
#   3. Arrancar.
#
# Migrar desde el arranque del servicio vale para una demo, no para produccion:
# con varias replicas, todas intentarian migrar a la vez.
set -e

echo "==> Aplicando migraciones"
pnpm --filter @app/api db:deploy

if [ -n "$SEED_PASSWORD" ]; then
  echo "==> Sembrando la cuenta inicial"
  pnpm --filter @app/api db:seed
else
  echo "==> Sin SEED_PASSWORD: no se siembra ninguna cuenta"
fi

echo "==> Arrancando la API"
exec pnpm --filter @app/api start
