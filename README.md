# excel-to-software

Convierte una hoja de cálculo en una aplicación de gestión: sube un Excel, el sistema
perfila su estructura, propone un modelo de datos, tú lo corriges y confirmas, y a partir
de ahí construye una base de datos real con sus tablas, formularios y relaciones, e importa
los datos originales.

No genera código. La unidad del producto es **la estructura de la información**.

| Documento                                                              | Qué contiene                              |
| ---------------------------------------------------------------------- | ----------------------------------------- |
| [`ERS.md`](ERS.md)                                                     | Especificación de requisitos (fuente)     |
| [`docs/product/overview.md`](docs/product/overview.md)                 | Resumen del producto y decisiones tomadas |
| [`docs/plans/active/backend-mvp.md`](docs/plans/active/backend-mvp.md) | Plan de backend por fases                 |
| [`ADR 0001`](docs/architecture/adr/0001-per-project-schema-ddl.md)     | Un schema PostgreSQL por proyecto         |
| [`AGENTS.md`](AGENTS.md)                                               | Reglas de trabajo para agentes            |

## Estado

**Backend y panel completos.** Subes un Excel, el sistema propone un modelo, lo corriges y
lo confirmas, y acabas usando una aplicación de gestión real —tablas, formularios,
selectores de relación— con tus datos dentro, deduplicados y enlazados. Si mañana subes otro
Excel, sale otra aplicación distinta sin tocar una línea de código.

|                              |                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Backend                      | F0–F9 · [plan](docs/plans/active/backend-mvp.md)                                        |
| Panel                        | W0–W9 · [plan](docs/plans/active/frontend-mvp.md)                                       |
| Tests                        | 366 en la API, 182 en el panel                                                          |
| Los 18 criterios del ERS §17 | Verificados tres veces: por HTTP, contra PostgreSQL y **en un navegador real**          |
| Accesibilidad                | [auditoría completa](docs/quality/frontend-audit.md) del checklist, con sus excepciones |

Sin `ANTHROPIC_API_KEY` el análisis usa la estructura simple de RE-04, así que el producto
funciona sin IA.

Queda una deuda de verificación, y es de entorno: la **calidad** de la propuesta del motor de
inferencia no se ha comprobado nunca, porque no hay credenciales de Anthropic en esta
máquina. Su contrato sí está verificado. El procedimiento —ejecutable— está en
[`docs/quality/inference-manual-check.md`](docs/quality/inference-manual-check.md). El resto
de deudas conocidas está en [`docs/plans/technical-debt.md`](docs/plans/technical-debt.md).

## Requisitos

- Node.js ≥ 22
- pnpm a través de Corepack (`corepack enable`)
- Docker con Compose

## Puesta en marcha

```bash
corepack enable
corepack pnpm install

cp apps/api/.env.example apps/api/.env   # ajusta lo que necesites
# genera el secreto de sesión:
openssl rand -hex 32                     # pégalo en AUTH_SECRET

corepack pnpm db:up                      # PostgreSQL 16 en el 5432
corepack pnpm --filter @app/api db:migrate

# el registro público está cerrado: la primera cuenta se siembra
SEED_EMAIL=tu@correo SEED_PASSWORD='una contrasena larga' \
  corepack pnpm --filter @app/api db:seed

corepack pnpm dev                        # API en el 4000
```

Comprobación:

```bash
curl -s http://127.0.0.1:4000/health
# {"data":{"status":"ok","version":"0.1.0","uptimeSeconds":3,
#          "checks":{"control":"up","runtime":"up"}}}
```

## Comandos

| Comando                  | Qué hace                                     |
| ------------------------ | -------------------------------------------- |
| `corepack pnpm dev`      | API en modo watch                            |
| `corepack pnpm verify`   | formato + lint + tipos + tests + build       |
| `corepack pnpm test`     | tests                                        |
| `corepack pnpm db:up`    | levanta PostgreSQL                           |
| `corepack pnpm db:reset` | borra el volumen y vuelve a levantar la base |
| `corepack pnpm db:logs`  | sigue el log de PostgreSQL                   |

Usa siempre pnpm a través de Corepack. Nunca npm ni yarn.

Estos tres necesitan la base levantada y una cuenta sembrada, así que no entran en
`verify`:

| Comando                                           | Qué hace                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| `corepack pnpm --filter @app/api acceptance:live` | los 18 criterios contra PostgreSQL real                   |
| `corepack pnpm --filter @app/api inference:check` | llama al motor real y puntúa su propuesta (cuesta dinero) |
| `corepack pnpm --filter @app/api bench`           | mide el listado con 100.000 registros                     |

## Estructura

```
apps/api/                    API Express en TypeScript
  src/config/                validación de entorno con Zod
  src/domain/                errores y reglas, sin dependencias de framework
  src/infrastructure/        HTTP, base de datos, logging
docker/postgres/init/        roles de base de datos (ADR 0001)
docs/                        base de conocimiento del proyecto
```

## Los dos roles de base de datos

No es un detalle accidental. El [ADR 0001](docs/architecture/adr/0001-per-project-schema-ddl.md)
separa dos planos, y cada uno usa credenciales distintas:

- `ets_owner` emite DDL: Prisma sobre `public`, y el materializador sobre los schemas
  `proj_*` de cada proyecto.
- `app_runtime` solo puede leer y escribir filas. No puede crear ni alterar estructura, así
  que un fallo del CRUD generado no puede tocar el esquema.

El arranque rechaza una configuración donde ambas conexiones sean iguales.

## API

```
POST   /api/auth/sign-in/email     iniciar sesión   (Better Auth)
POST   /api/auth/sign-out          cerrar sesión
GET    /health                     sonda de los dos planos

POST   /api/projects               crear proyecto           { name }
GET    /api/projects               listar los propios       ?limit&offset
GET    /api/projects/:id           detalle + pasos posibles
DELETE /api/projects/:id           eliminar                 { confirmName }

POST   /api/projects/:id/file      subir un .xlsx           multipart: file
GET    /api/projects/:id/sheets    hojas + perfilado
PATCH  /api/projects/:id/sheets    incluir/excluir hojas, corregir encabezados

POST   /api/projects/:id/analyze   lanzar el análisis      -> 202 + proceso
GET    /api/projects/:id/jobs/:id  seguir un proceso
GET    /api/projects/:id/blueprint modelo propuesto
POST   /api/projects/:id/step      avanzar o volver atrás   { to }

PATCH  .../blueprint                       nombre de la aplicación
PATCH  .../blueprint/entities/:entidad     etiqueta, campo mostrado, clave
DELETE .../blueprint/entities/:entidad
POST   .../blueprint/entities/:entidad/fields
PATCH  .../blueprint/entities/:entidad/fields/:campo
DELETE .../blueprint/entities/:entidad/fields/:campo
PATCH  .../blueprint/relations/:entidad/:campo   { accepted }
GET    .../blueprint/summary               resumen previo a crear
POST   .../blueprint/confirm               congela la estructura
POST   /api/projects/:id/build             crea la base de datos e importa -> 202
GET    /api/projects/:id/jobs/:id/errors   filas que quedaron fuera  (?format=csv)
```

### La aplicación generada

```
GET    /api/projects/:id/app                        navegación y estructura
GET    .../app/:modulo/records    ?q=&sort=&dir=&limit=&offset=
POST   .../app/:modulo/records                      crear
GET    .../app/:modulo/records/:registro            abrir
PATCH  .../app/:modulo/records/:registro            editar (parcial)
DELETE .../app/:modulo/records/:registro
GET    .../app/:modulo/options    ?q=&limit=        opciones de un selector
```

Corre con el rol `app_runtime`, que solo tiene DML. Los módulos se direccionan por nombre y
ese valor se **resuelve** contra el modelo: nunca llega al SQL.

Las entidades y campos se direccionan por **nombre**, no por identificador: es legible y no
expone UUID internos.

El registro público está deshabilitado. `DELETE` exige el nombre exacto del proyecto,
comprobado en el servidor: se lleva por delante el schema de datos completo.

## Convenciones de respuesta

```jsonc
// éxito
{ "data": { }, "meta": { } }

// error
{ "error": { "code": "INVALID_STATE", "message": "…", "details": { }, "requestId": "…" } }
```

`code` es un código de dominio; la traducción a estado HTTP vive en un único sitio
(`infrastructure/http/error-mapping.ts`). Los mensajes están escritos para que los lea una
persona usuaria: nada de SQL ni de jerga técnica (ERS RX-03).
