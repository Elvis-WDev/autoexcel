# El panel, para probar el producto en una maquina.
#
# `API_ORIGIN` es un argumento de CONSTRUCCION y no solo de ejecucion. Next
# evalua `rewrites()` al construir y lo guarda en su manifiesto de rutas, asi
# que si solo se pasara al arrancar, el contenedor seguiria reescribiendo hacia
# `127.0.0.1:4000` —que dentro del contenedor es el propio panel— y ninguna
# llamada llegaria a la API. Se pasa en los dos sitios.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# `--ignore-scripts` evita que Playwright se descargue un navegador entero al
# instalar: aqui no se ejecutan pruebas.
RUN pnpm install --frozen-lockfile --filter @app/web... --ignore-scripts

COPY tsconfig.base.json ./
COPY apps/web apps/web

ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=${API_ORIGIN}

RUN pnpm --filter @app/web build

EXPOSE 3100
CMD ["pnpm", "--filter", "@app/web", "start"]
