# La API, para probar el producto en una maquina.
#
# `node:24-slim` y no alpine: Prisma y sus binarios se llevan mejor con glibc, y
# aqui no compensa pelearse con musl para ahorrar unos megas.
#
# La imagen conserva las dependencias de desarrollo a proposito. Las necesita
# para dos cosas que en este despliegue **son parte del arranque**: aplicar las
# migraciones y sembrar la cuenta inicial, que corre con `tsx`. Para un
# despliegue de verdad se separarian en un trabajo aparte y esta imagen se
# quedaria solo con `dist` y las dependencias de produccion.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

# Primero solo los manifiestos: mientras no cambien, la capa de dependencias se
# reaprovecha y reconstruir cuesta segundos en vez de minutos.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# El filtro instala la API y lo que necesita, no el panel entero con su
# navegador de pruebas.
RUN pnpm install --frozen-lockfile --filter @app/api...

COPY tsconfig.base.json ./
COPY apps/api apps/api

# El cliente de Prisma se genera dentro de la imagen: lo que hay en el
# repositorio podria ser de otra plataforma.
#
# La URL de mentira es solo para esta linea: `prisma.config.ts` exige
# `DATABASE_URL` aunque `generate` no se conecte a nada. Vale la pena aguantar
# esa friccion aqui antes que debilitar una comprobacion que en el arranque de
# verdad si sirve. La real llega por entorno al ejecutar.
RUN DATABASE_URL=postgresql://construccion:construccion@localhost:5432/construccion \
    pnpm --filter @app/api db:generate \
 && pnpm --filter @app/api build

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
