# Plan de backend — MVP Excel → Aplicación

> Documento en español porque `ERS.md` y el equipo trabajan en español. El resto de
> `docs/` permanece en inglés según el contexto heredado.

## Goal

Backend completo y verificable que permita: cargar un Excel de varias hojas, perfilarlo,
proponer un modelo con asistencia de IA, dejar que el usuario lo corrija, materializar una
base de datos real por proyecto, importar los datos preservando relaciones y deduplicando,
y servir un CRUD genérico sobre la aplicación resultante.

El frontend no entra en este plan. Todo lo que sigue se verifica por HTTP y por tests.

## Cambios acordados respecto a `ERS.md`

Estas cuatro decisiones modifican o precisan el ERS y gobiernan el plan entero.

| #   | Tema                   | Decisión                                                                                                                            | Efecto sobre el ERS                                                                                                                                                           |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Almacenamiento         | Un schema PostgreSQL por proyecto, DDL dinámico. Ver `docs/architecture/adr/0001-per-project-schema-ddl.md`.                        | Concreta §12 y RF-13.                                                                                                                                                         |
| 2   | Multi-hoja             | Se leen **todas** las hojas y se construye **un modelo unificado**, con relaciones también **entre** hojas.                         | **Deroga la restricción 1 de §16** ("solo se procesará una hoja principal"). RF-02 pasa de "elegir una hoja" a "confirmar qué hojas se incluyen", todas marcadas por defecto. |
| 3   | Deduplicación          | Clave normalizada (trim, espacios colapsados, minúsculas, sin acentos) + columna identificadora sugerida y editable por el usuario. | Resuelve la ambigüedad de RF-20 ("según el criterio utilizado durante la inferencia").                                                                                        |
| 4   | Errores de importación | Continuar e informar filas fallidas con detalle descargable.                                                                        | Cierra la opción abierta de RE-06.                                                                                                                                            |

### Multi-proyecto

La plataforma es un panel con **N proyectos por usuario**. Cada Excel cargado genera un
proyecto nuevo e independiente, con su propio schema, su propia navegación y sus propios
datos. Esto no estaba en el ERS (que describe una aplicación única) y es un requisito
nuevo: el ciclo `cargar Excel → usar la app` es repetible sin límite.

---

## Arquitectura

### Dos planos

```
┌─ Plano de control ── schema public ── Prisma + migraciones versionadas ────────┐
│  User · Project · SourceFile · Sheet · SourceColumn                            │
│  Blueprint · BpEntity · BpField · BpRelation · ColumnMapping                   │
│  BuildJob · ImportRowError                                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │  materializa
                                     ▼
┌─ Plano de datos ── schema proj_<id> ── SQL generado en runtime ───────────────┐
│  clientes · vehiculos · conductores · viajes   (tablas reales, FKs reales)     │
└───────────────────────────────────────────────────────────────────────────────┘
```

Regla dura: **Prisma nunca emite DDL sobre `proj_*`; el materializador nunca toca
`public`.** Dos roles de base de datos distintos hacen cumplir esto a nivel de permisos.

### Capas (según `docs/architecture/backend.md`)

```
domain (tipos del blueprint, reglas de inferencia, normalización)
  ↑
application (casos de uso: analizar, validar, materializar, importar, consultar)
  ↑
infrastructure (Express, Prisma, pg, cliente Anthropic, almacenamiento de archivos)
```

El dominio no importa `pg`, ni Prisma, ni el SDK de Anthropic. El motor de inferencia se
expone como un **puerto** (`BlueprintProposer`) con dos implementaciones: la real basada en
Claude y una determinista de pruebas. Esto permite que toda la suite de tests corra sin
tocar la API.

---

## Fases

Las fases son secuenciales salvo donde se indica. Cada una termina con verificación propia
y es un candidato natural a commit independiente.

---

### F0 — Fundaciones ✅ completada (2026-09-15)

**Objetivo.** Repositorio ejecutable, con base de datos, configuración validada y las
decisiones de arquitectura registradas.

**Entregables.**

- Monorepo pnpm vía Corepack, con `apps/api` (el frontend llegará después como `apps/web`).
- TypeScript estricto, ESLint, Prettier, Vitest.
- `docker-compose.yml` con PostgreSQL 16 (se requiere ≥13 por `gen_random_uuid()`).
- Validación de entorno con Zod al arranque: `DATABASE_URL` (rol DDL),
  `DATABASE_URL_RUNTIME` (rol DML), `ANTHROPIC_API_KEY`, `STORAGE_DIR`, límites de tamaño.
  El proceso no arranca si falta algo.
- Express con manejador de errores global y sobre de respuesta consistente:
  `{ data, meta? }` / `{ error: { code, message, details? } }`.
- Endpoint `/health` que verifica conexión a base de datos.
- Scripts: `format`, `lint`, `test`, `typecheck`, `build`, `verify`.
- Completar `docs/product/overview.md` con el producto real (hoy es plantilla).
- ADR 0001 (ya escrito).

**Verificación.** `corepack pnpm verify` en verde. `GET /health` → 200 con base de datos
arriba, 503 con base de datos caída.

**Resultado.** `corepack pnpm verify` en verde (26 tests). `GET /health` verificado contra
PostgreSQL real: 200 con la base arriba, 503 con `docker compose stop postgres`, y vuelta a
200 al restaurarla sin reiniciar el proceso. Apagado por SIGTERM en 2 s.

**Desviaciones respecto a lo planificado.**

- El puerto por defecto es **4000**, no 3000: otro proyecto de la máquina ya ocupa el 3000
  y el 3001.
- `ANTHROPIC_API_KEY` es obligatoria solo cuando `NODE_ENV=production`. En desarrollo el
  arranque avisa y continúa, porque hasta F3 no hay nada que la use.
- Se añadió una regla que el plan no preveía: el arranque **rechaza** que `DATABASE_URL` y
  `DATABASE_URL_RUNTIME` sean iguales. Sin ella, la separación de roles del ADR 0001 se
  puede anular por descuido en un `.env` y nadie se entera.
- Se añadió `helmet` desde F0 en vez de dejarlo para F8. Cuesta una línea y no tiene
  configuración que discutir.

---

### F1 — Plano de control y proyectos ✅ completada (2026-09-15)

**Objetivo.** Usuarios autenticados que pueden crear, listar y borrar proyectos.

**Entregables.**

- Better Auth con email + contraseña, sesiones por cookie, registro cerrado salvo `seed`.
  Montado antes del middleware JSON.
- Middleware de autorización por registro: **todo** acceso a un proyecto verifica
  `project.ownerId === session.userId` en el servidor. Ningún endpoint confía en el cliente.
- Schema Prisma del plano de control:

  ```
  Project       id, ownerId, name, slug, schemaName, status, createdAt, updatedAt
  SourceFile    id, projectId, originalName, storagePath, sizeBytes, sha256
  Sheet         id, sourceFileId, name, index, rowCount, headerRowIndex, included
  SourceColumn  id, sheetId, index, header, normalizedHeader, profile(Json)
  ```

- `Project.status` es el enum de §20 del ERS:
  `uploaded · sheet_selected · analyzing · reviewing_entities · reviewing_fields ·
reviewing_relations · reviewing_summary · creating · importing · completed · failed`.
- **Máquina de estados** en dominio, con transiciones permitidas declaradas en una tabla.
  Todo endpoint del asistente pasa por un guard que rechaza transiciones inválidas con
  `409 INVALID_STATE`. Esto implementa la regla de §20 ("el usuario solo deberá poder
  acceder a estados válidos").
- `schemaName` se genera al crear el proyecto (`proj_` + id corto), nunca desde el nombre
  que escribe el usuario.

**Endpoints.**

```
POST   /api/projects            crear proyecto vacío
GET    /api/projects            listar los del usuario
GET    /api/projects/:id        detalle + estado actual
DELETE /api/projects/:id        borra registro + DROP SCHEMA IF EXISTS ... CASCADE
```

**Riesgo.** El borrado ejecuta DDL destructivo. Se exige confirmación por nombre en la capa
HTTP (`confirmName` debe coincidir exactamente), según la escalera de confirmación de
`docs/architecture/forms-and-workflows.md`.

**Verificación.** Tests de integración de la máquina de estados (toda transición inválida
devuelve 409) y de aislamiento entre usuarios (un usuario no puede leer el proyecto de otro).

**Resultado.** `corepack pnpm verify` en verde (79 tests). Verificado además contra
PostgreSQL real con dos cuentas distintas: aislamiento, escalera de confirmación y borrado
de schema.

**Desviaciones y añadidos respecto a lo planificado.**

- **`draft` es un estado nuevo**, anterior a `uploaded`. El ERS empieza en `uploaded`
  porque asume una sola aplicación; aquí el proyecto se crea antes de tener archivo.
- **La máquina de estados permite retroceder** entre pasos de revisión (RX-04) y
  **reintentar desde `failed`** hacia `sheet_selected`, porque el archivo sigue estando.
  A partir de `creating` no hay vuelta atrás: ahí ya se emite DDL.
- **Las rutas responden 404, no 403**, ante un proyecto ajeno. Un 403 confirmaría que ese
  identificador existe y permitiría enumerar proyectos de otras personas.
- **El borrado suelta el schema antes de borrar la fila.** `DROP SCHEMA IF EXISTS` es
  idempotente, así que un fallo a mitad se arregla reintentando; al revés quedaría un
  schema huérfano sin registro de su existencia.
- **`createAuth` acepta `allowSignUp`**, usado solo por el script de siembra.
  `disableSignUp` bloquea también las llamadas desde el servidor, así que no había otra
  forma de crear la primera cuenta sin escribir el hash a mano.
- **Test de deriva del schema de Better Auth**: pregunta a la librería qué tablas y campos
  espera y comprueba que `schema.prisma` los cubre. No estaba en el plan; cierra el riesgo
  de que una actualización añada un campo y nadie se entere hasta producción.
- **La interfaz `Logger` se movió a `application/ports/`.** Un caso de uso la necesitaba y
  vivía en infraestructura, lo que rompía la dirección de dependencias.
- **Prisma 7 exige driver adapter y `prisma.config.ts`**: la URL ya no vive en
  `schema.prisma`. El cliente reutiliza el pool de control en vez de abrir uno propio.
- **La CLI de Prisma se fijó en 7.10.0.** Su `latest` en npm es un release candidate de la
  8, que no empareja con el cliente estable.
- **`pnpm-workspace.yaml` usa `allowBuilds`**, no `onlyBuiltDependencies`: esa clave es de
  pnpm 10 y la 11 la ignora en silencio.

---

### F2 — Ingesta y perfilado multi-hoja ✅ completada (2026-09-15)

**Objetivo.** Subir un `.xlsx`, leer todas las hojas y producir el perfilado determinista
que alimentará la inferencia. Sin IA en toda esta fase.

**Entregables.**

- `POST` de archivo con límite de tamaño, validación de extensión y **de contenido real**
  (firma ZIP + estructura OOXML, no solo el nombre). Se guarda con nombre generado, nunca
  con el nombre del usuario, fuera de cualquier ruta servida estáticamente.
- Lectura con SheetJS en modo streaming/denso para archivos grandes.
- **Detección de encabezados** (RF-03) por hoja: se busca la primera fila con suficientes
  celdas no vacías y sin tipo numérico dominante; se admite corrección manual del índice.
- **Perfilado por columna** (RF-04), todo determinista:
  `registros · vacíos · valores distintos · ratio de cardinalidad · hasta 20 ejemplos ·
tipo aparente` (fecha, entero, decimal, booleano, email, teléfono, texto, por regex y
  parseo, con el porcentaje de filas que encajan).
- **Índice de valores normalizados por columna**, reutilizado después para el solapamiento
  entre hojas y para la deduplicación.
- Errores del ERS: RE-01 (archivo ilegible), RE-02 (hoja vacía), RE-03 (encabezados
  indeterminables), con los mensajes en lenguaje de negocio.

**Endpoints.**

```
POST  /api/projects/:id/file              subir xlsx → perfila todas las hojas
GET   /api/projects/:id/sheets            hojas + columnas + perfil
PATCH /api/projects/:id/sheets            incluir/excluir hojas, ajustar fila de encabezado
```

**Riesgos.**

- **Zip bomb / XXE.** Límite de tamaño descomprimido, límite de filas y de celdas, y
  desactivación de features de la librería que resuelvan entidades externas.
- Excel con celdas combinadas o filas de título antes del encabezado: cubierto por la
  detección de fila de encabezado más la corrección manual.

**Verificación.** Corpus de archivos de prueba: una hoja limpia, varias hojas, hoja vacía,
encabezados en la fila 4, celdas combinadas, 50.000 filas, archivo corrupto, archivo con
extensión falsa. Cada uno con su resultado esperado.

**Resultado.** `corepack pnpm verify` en verde (156 tests, 81 nuevos). Verificado además
contra PostgreSQL con un Excel de 3 hojas y 400 filas: título saltado, las tres hojas
leídas, pestaña vacía excluida sin detener el proceso, y tipos inferidos correctamente
(`date`, `email`, `phone`, `integer`).

**Desviaciones y hallazgos respecto a lo planificado.**

- **No se usa SheetJS.** `xlsx@0.18.5`, la única versión en npm, arrastra dos avisos de
  seguridad vigentes (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) y sus versiones corregidas
  solo se publican en el CDN del proveedor, fuera del registro y del lockfile. Para el
  componente que parsea archivos de terceros no compensa. Se usa **ExcelJS 4.4.0**.
- **Tampoco se usa el lector en streaming de ExcelJS, que era el plan.** Tiene un fallo con
  libros de varias hojas: parsea una hoja en línea leyendo `this.model.sheets` sin
  comprobar que `this.model` exista, y `model` solo se rellena con `xl/workbook.xml`. El
  propio ExcelJS escribe esa entrada **al final** del ZIP, así que el lector se rompe con
  los archivos que él mismo genera. Se detectó como un test intermitente al 50%.
- **El techo se comprueba antes de parsear, no durante.** Se lee el directorio central del
  ZIP (`zip-inspector.ts`, sin dependencias nuevas) y se suman los tamaños **ya
  descomprimidos** que el archivo declara. Es mejor garantía que abortar a media lectura:
  se sabe lo que va a costar antes de empezar. Nueva variable `MAX_UNCOMPRESSED_BYTES`.
  De paso confirma la estructura OOXML (`xl/workbook.xml` + `xl/worksheets/`), que la firma
  de los primeros bytes no puede distinguir de un ZIP cualquiera.
- **RE-02 y RE-03 dejan de ser errores del proceso y pasan a ser avisos por hoja.** El ERS
  los trata como fallos porque asume una sola hoja; con varias, una pestaña de leyenda
  vacía no puede tumbar la carga. Se excluye, se explica y se sigue. Solo si **ninguna**
  hoja sirve se detiene.
- **La heurística de encabezados usa un umbral absoluto**, no una fracción de la fila más
  ancha. La fracción fallaba en los dos sentidos: en una hoja de dos columnas dejaba pasar
  el título, y en una con huecos por celdas combinadas rechazaba el encabezado bueno.
- **El `.xls` antiguo se detecta y se explica** en vez de caer en el "no pudimos leerlo"
  genérico.
- **`normalizeValue` es ya la función de la decisión 3** y vive en el dominio: de ella
  salen el conteo de distintos de F2, el solapamiento entre hojas de F3 y la clave de
  deduplicación de F6.

**Cubre.** RF-01, RF-02 (redefinido), RF-03, RF-04, RE-01, RE-02, RE-03.

---

### F3 — Motor de inferencia ✅ completada (2026-09-15)

**Objetivo.** Convertir el perfilado en un blueprint **propuesto**. Es el único punto del
sistema donde interviene la IA.

**Entregables.**

_Señales deterministas (se calculan antes de llamar al modelo y se le entregan):_

- Ratio de cardinalidad por columna (RI-02: baja cardinalidad sobre muchas filas sugiere
  entidad).
- Normalización semántica del encabezado (RI-03).
- **Solapamiento entre hojas**: índice Jaccard entre los conjuntos de valores normalizados
  de columnas de hojas distintas. Una hoja `Clientes` cuya columna clave cubre la columna
  `Cliente` de la hoja `Viajes` es evidencia fuerte de que son la misma entidad. Esta señal
  es la que hace posible la decisión 2 (modelo unificado).
- Detección de columnas candidatas a identificador único (cardinalidad ≈ 1, patrón estable,
  encabezado tipo `ruc`, `código`, `placa`, `id`).

_Llamada al modelo:_

- `claude-opus-5` con `thinking: { type: "adaptive" }` y `output_config: { effort: "high",
format: ... }` (structured outputs). Streaming, por tamaño de entrada.
- **Se le envía el perfil, nunca las filas completas.** Encabezados, estadísticas y hasta 20
  ejemplos por columna. Un Excel de 50.000 filas produce el mismo tamaño de prompt que uno
  de 50.
- Prompt cacheado: instrucciones y vocabulario cerrado en el prefijo estable, perfil del
  archivo después del último punto de caché.
- **Una sola llamada por análisis.** El resultado se persiste como blueprint borrador y el
  modelo no vuelve a invocarse en ningún momento posterior del ciclo de vida del proyecto.
  Esto es P-03 y P-04 hechos cumplir por arquitectura, no por disciplina.

_Validador (determinista, obligatorio, corre sobre la salida del modelo):_

- Tipos dentro de los 10 permitidos (RF-08); nada más se acepta.
- Relaciones solo `one_to_many` / `many_to_one`; se rechaza muchos-a-muchos y cualquier
  ciclo.
- Toda referencia a entidad/campo debe resolver.
- Toda columna de origen debe estar mapeada o explícitamente descartada (RNF-02).
- Guardas de las reglas de inferencia: se rechaza convertir en entidad una columna con
  cardinalidad casi única, y se degradan a `select` las columnas de pocos valores que el
  modelo haya propuesto como entidad sin evidencia (RI-01, RI-04, RI-05).
- Si el validador rechaza: un reintento de reparación con los errores como entrada; si
  vuelve a fallar, **fallback determinista RE-04** — una entidad por hoja con todas sus
  columnas como campos. La demo nunca se bloquea.

**Endpoints.**

```
POST /api/projects/:id/analyze     → 202 + jobId  (estado: analyzing)
GET  /api/projects/:id/blueprint   → blueprint propuesto + marca de "inferido"
```

**Riesgos.**

- Salida del modelo fuera de vocabulario → cubierto por structured outputs + validador +
  fallback. El validador es la garantía, no el schema.
- Coste y latencia → perfil en vez de filas, caché de prompt, una sola llamada.
- No determinismo → aceptado y acotado **solo** a esta fase; todo lo posterior es
  determinista y el blueprint queda persistido.

**Cubre.** RF-05, RF-07, RF-08, RF-10, RI-01…RI-06, RE-04, §21, §22.

**Resultado.** `corepack pnpm verify` en verde (200 tests, 44 nuevos). Verificado contra
PostgreSQL el camino completo `subir → seleccionar hojas → analizar → blueprint`.

**Verificación pendiente, y es importante.** No hay credenciales de Anthropic en esta
máquina, así que **la llamada real al modelo no se ha ejercitado**. Lo que sí está
cubierto: la forma exacta de la petición (modelo, `thinking`, `output_config`,
`cache_control`), la traducción de la respuesta, el reintento de reparación y los tres
caminos de fallo, todo mediante un transporte `fetch` interceptado. Falta comprobar con una
clave real que el modelo produce propuestas de calidad; es el test manual que el plan
ya preveía para F9.

**Desviaciones y añadidos respecto a lo planificado.**

- **Los modelos Prisma del blueprint entran en F3, no en F4.** El plan los situaba en F4,
  pero `POST /analyze` no puede persistir nada sin ellos. F4 conserva la _edición_.
- **Se añadió un modelo `Job` genérico**, reutilizable por F5 y F6. El plan solo pedía
  `202 + jobId` en F3 y `BuildJob` en F6; un solo modelo evita tener dos.
- **El trabajo corre dentro del proceso.** La fila sobrevive a recargas y navegación, que
  es lo que la interfaz necesita, pero **no a un reinicio del servidor**. `failOrphaned`
  marca al arrancar los trabajos que quedaron colgados, para que nadie vea "Analizando
  archivo..." indefinidamente. Una cola real es trabajo de F8.
- **El solapamiento entre hojas se calcula releyendo el archivo**, no desde el perfilado
  guardado. El perfil solo conserva 20 ejemplos por columna, insuficiente para comparar
  conjuntos; guardarlos todos abultaría la base de datos para algo que se usa una vez.
- **La métrica de solapamiento es la contención, no el índice Jaccard.** Una hoja
  `Clientes` con 3.000 registros "contiene" la columna `Cliente` de `Viajes` aunque esta
  use solo 80: el Jaccard sería 0,027 y no diría nada; la contención es 1.
- **El validador repara además de rechazar.** Un `select` sin opciones las recupera del
  perfil de su columna; una relación sin declarar se deduce del campo; un `displayField`
  inexistente se sustituye. Rechazar todo eso habría mandado a reparación propuestas
  perfectamente utilizables.
- **`describeRelation` es determinista, sin IA.** P-05 pide explicar la relación en
  lenguaje de negocio; generar esa frase con un modelo arriesgaría una frase mal formada
  justo en el paso donde la persona decide si confía en el sistema.
- **La singularización en español necesitó más matiz del previsto.** La primera versión
  producía "Cada viaj pertenece a un client". El plural se forma con "s" tras vocal y "es"
  tras consonante, así que deshacerlo exige mirar la raíz: `conductores → conductor`,
  pero `viajes → viaje`.

---

### F4 — Blueprint editable y validación ✅ completada (2026-09-15)

**Objetivo.** Que el usuario pueda corregir la propuesta, y que nada inválido llegue a
materializarse.

**Entregables.**

- Modelo persistido del blueprint:

  ```
  Blueprint     id, projectId, version, status(draft|confirmed)
  BpEntity      id, blueprintId, name, label, slug, tableName,
                displayFieldId, dedupeFieldId, origin(sheet|derived), originSheetId
  BpField       id, entityId, name, label, columnName, type, required,
                options(Json), isInferred
  BpRelation    id, blueprintId, sourceEntityId, targetEntityId, type,
                fieldId, naturalLanguage
  ColumnMapping id, sourceColumnId, bpFieldId, bpEntityId
  ```

- Dos añadidos que el ERS necesita pero no define:
  - **`displayField`** por entidad — el campo que representa al registro en un selector.
    RF-17 es imposible sin él.
  - **`BpRelation.fieldId`** — qué campo materializa la relación. §12.4 solo declara
    `source/target/type`, insuficiente cuando `Viajes` tiene tres relaciones.
- Edición: renombrar y eliminar entidades, renombrar/retipar/eliminar campos, aceptar o
  rechazar relaciones, elegir la clave de deduplicación, editar el nombre de la aplicación.
  Toda edición **respeta la decisión del usuario sobre la de la IA** (RI-06).
- `naturalLanguage` por relación, generado de forma determinista a partir de las etiquetas:
  _"Un cliente puede tener varios viajes. Cada viaje pertenece a un solo cliente."_ (P-05,
  RF-11). Sin IA.
- **Validador de blueprint** reutilizable, que corre en cada edición y otra vez antes de
  materializar (RNF-04): identificadores generables y únicos, tipos válidos, relaciones
  resolubles y acíclicas, `displayField` presente, toda entidad con al menos un campo,
  `select` con opciones.
- Vista resumen (RF-12) servida como datos agregados: entidades, campos, relaciones,
  conteos.

**Endpoints.**

```
GET    /api/projects/:id/blueprint
PATCH  /api/projects/:id/blueprint                    nombre de la aplicación
PATCH  /api/projects/:id/blueprint/entities/:eid
DELETE /api/projects/:id/blueprint/entities/:eid
PATCH  /api/projects/:id/blueprint/fields/:fid
DELETE /api/projects/:id/blueprint/fields/:fid
PATCH  /api/projects/:id/blueprint/relations/:rid      aceptar/rechazar
GET    /api/projects/:id/blueprint/summary             RF-12
POST   /api/projects/:id/blueprint/confirm             draft → confirmed
```

**Verificación.** Tests de propiedad: ningún blueprint que pase el validador puede hacer
fallar al materializador de F5. Esa invariante es la que sostiene RNF-03 y RNF-04.

**Resultado.** `corepack pnpm verify` en verde (235 tests, 35 nuevos). Verificado contra
PostgreSQL el ciclo `renombrar → retipar → elegir clave → borrar campo → resumen →
confirmar → intentar editar`, con el último devolviendo 409.

El test de propiedad existe: `blueprint-invariants.test.ts` aplica 208 ediciones distintas,
sueltas y en secuencias de 12, y afirma que o la edición se rechaza con un error de
negocio, o el resultado cumple las precondiciones de F5 (relaciones resolubles, sin ciclos,
toda entidad con campos y con campo mostrado, todo `select` con opciones). Lleva contadores
para que no pueda pasar en vacío: exige que al menos 40 ediciones lleguen a comprobarse y
que al menos 100 se rechacen.

**Desviaciones y decisiones respecto a lo planificado.**

- **Las entidades y campos se direccionan por nombre, no por identificador.** Cada edición
  reescribe el blueprint completo, así que los UUID cambiarían en cada llamada y el cliente
  tendría direcciones muertas. Los nombres son estables —renombrar cambia la _etiqueta_, no
  el `name`—, se leen en la URL, y de paso desaparecen los UUID de base de datos de la
  respuesta.
- **Eliminar una entidad no borra los datos que la referenciaban.** Los campos de otras
  entidades que apuntaban a ella se convierten en campos simples que conservan su columna de
  origen. Es literalmente el ejemplo de RI-06: si el usuario decide mantener `Producto`
  dentro de `Ventas`, su decisión prevalece y el dato sigue ahí. Borrarlos habría sido
  destruir información por una decisión de modelado.
- **Rechazar una relación no borra la entidad apuntada**, por el mismo motivo: puede seguir
  teniendo sentido por su cuenta.
- **No se permite convertir un campo normal en relación ni al revés por la vía del tipo.**
  Convertir un texto en relación no es cambiar un tipo: es decidir que existe otra entidad,
  con qué clave se agrupa y qué pasa con los valores que no encajen. Deshacer una relación
  tiene su propia vía (`rejectRelation`), que sí expresa esa intención.
- **`POST /projects/:id/step`** convierte RX-04 en una operación del servidor en vez de una
  promesa de la interfaz. Los pasos que tocan la base de datos (`creating`, `importing`) no
  son navegables: se alcanzan ejecutando trabajo.
- **Un campo añadido a mano nunca puede ser obligatorio**, y se explica por qué: no hay de
  dónde sacar ese dato para las filas que ya existen, y exigirlo haría que la importación
  rechazara todas.
- **`confirm` congela, no construye.** El blueprint confirmado es el contrato que F5
  consumirá; separar ambas acciones deja una frontera clara y un punto único donde RNF-04
  se comprueba por última vez.
- **`singularize` se movió al dominio** (`domain/spanish.ts`). La usaban el presentador y
  las notas de edición, y una divergencia entre ambas se notaría: salía "identificar cada
  empresas".

**Cubre.** RF-06, RF-09, RF-11, RF-12, RNF-02, RNF-04, RX-04, RX-05, RX-06.

---

### F5 — Materializador DDL ✅ completada (2026-09-15)

**Objetivo.** Convertir un blueprint confirmado en un schema PostgreSQL real. Determinista,
transaccional, y a prueba de inyección.

**Entregables.**

_Generación de identificadores._ El texto del usuario **nunca** llega al SQL. La etiqueta
visible y el identificador son cosas distintas y ambos se persisten:

```
toIdentifier(label):
  NFD → quitar diacríticos → minúsculas → [^a-z0-9_] → "_" →
  colapsar "_" → recortar "_" → prefijar si vacío o empieza por dígito →
  truncar a 63 bytes → desambiguar con sufijo numérico → rechazar palabra reservada
```

_Tres capas de defensa, todas obligatorias:_

1. El identificador se genera por máquina y se guarda en `BpEntity.tableName` /
   `BpField.columnName`. El constructor de SQL solo lee de ahí.
2. Assert contra `^[a-z_][a-z0-9_]{0,62}$` inmediatamente antes de cada interpolación; si
   falla, excepción, no saneamiento silencioso.
3. `quote_ident` / `format('%I')` al componer. Referencias siempre calificadas:
   `"proj_x"."clientes"`.

_Valores:_ siempre parámetros `$1..$n`. No existe una sola ruta donde un valor se
concatene. Un test de lint del repositorio prohíbe `$queryRawUnsafe` fuera del módulo
constructor de SQL.

_Mapeo de tipos:_

| Tipo ERS   | Columna PostgreSQL                               |
| ---------- | ------------------------------------------------ |
| `text`     | `TEXT`                                           |
| `integer`  | `BIGINT`                                         |
| `decimal`  | `NUMERIC(18,4)`                                  |
| `boolean`  | `BOOLEAN`                                        |
| `date`     | `DATE`                                           |
| `datetime` | `TIMESTAMPTZ`                                    |
| `email`    | `TEXT` + validación Zod en runtime               |
| `phone`    | `TEXT`                                           |
| `select`   | `TEXT` + `CHECK (col IN (...))`                  |
| `relation` | `UUID REFERENCES destino(id) ON DELETE RESTRICT` |

_Columnas de sistema en cada tabla generada_ (ocultas al usuario, según la _Technical
Information Boundary_ de `docs/architecture/frontend.md`):
`id UUID PK DEFAULT gen_random_uuid()`, `created_at`, `updated_at`, `__dedupe_key TEXT`
(solo entidades derivadas, con índice único), `__source JSONB` (hoja y fila de origen, para
RNF-02).

_Transaccionalidad._ `BEGIN → CREATE SCHEMA → CREATE TABLE (orden topológico) → ALTER TABLE
ADD FOREIGN KEY → CREATE INDEX → COMMIT`. PostgreSQL soporta DDL transaccional, así que un
fallo deja la base de datos exactamente como estaba. Compensación adicional:
`DROP SCHEMA IF EXISTS ... CASCADE` ante error irrecuperable.

_Roles._ El materializador usa `DATABASE_URL` (rol con DDL sobre `proj_*`). El runtime de
F7 usa `DATABASE_URL_RUNTIME`, sin `CREATE`. Un fallo del runtime no puede alterar
estructura.

**Riesgos.**

- Inyección de identificadores — el riesgo principal del ADR 0001. Mitigado por las tres
  capas; se cubre con un test dedicado que intenta nombres como
  `"; DROP TABLE users; --`, nombres con 300 caracteres, emoji, palabras reservadas y
  colisiones tras truncar a 63 bytes.
- Ciclos de claves foráneas — imposibles: el validador de F4 los rechaza antes.

**Cubre.** RF-13, RNF-03, RNF-05, RE-05.

**Resultado.** `corepack pnpm verify` en verde (264 tests, 29 nuevos). Verificado contra
PostgreSQL: tablas reales creadas desde un Excel, permisos del rol de runtime, y el DDL con
clave foránea ejecutado y comprobado (`ON DELETE RESTRICT` rechaza el borrado, el `CHECK`
rechaza un valor fuera de la lista).

**La prueba de adversario, de extremo a extremo.** Un Excel con estos encabezados produjo
estas columnas, y `public` conservó sus 14 tablas:

| Encabezado del Excel                 | Columna creada               |
| ------------------------------------ | ---------------------------- |
| `"; DROP TABLE "user"; --`           | `drop_table_user`            |
| `'); DROP SCHEMA public CASCADE; --` | `drop_schema_public_cascade` |
| `id`                                 | `id_2`                       |
| `__dedupe_key`                       | `dedupe_key`                 |
| `order`                              | `order_2`                    |
| `Gestión / Ñandú`                    | `gestion_nandu`              |

Y la separación de roles del ADR 0001, comprobada en la base real: `app_runtime` tiene
`USAGE` y DML, pero `CREATE` en el schema es `false`, `TRUNCATE` es `false`, y tanto
`DROP TABLE` como `CREATE TABLE` fallan con permiso denegado.

**Desviaciones y hallazgos respecto a lo planificado.**

- **Los nombres de índice se generan en el plan físico, no al componer el SQL.** El test de
  adversario encontró el fallo: con una etiqueta de 400 caracteres el nombre de tabla ocupa
  los 63 bytes y `nombre_display_idx` se pasa del límite, así que `assertSafeIdentifier`
  abortaba la construcción. Además los nombres de índice son únicos **por schema**, no por
  tabla, así que su desambiguación necesita un ámbito propio.
- **La regla de lint encontró una infracción en su primera ejecución**: `dropSchema`
  componía SQL fuera del constructor. Movido a `buildDropSchemaStatement`.
- **Las palabras reservadas se desambiguan, no se rechazan.** El plan decía "rechazar
  palabra reservada", pero como todo se cita, `"order"` funciona; rechazar una columna
  legítimamente llamada `Order` habría sido hostil sin ganar seguridad. Se les añade sufijo
  para que el esquema siga siendo legible a mano.
- **`email` y `phone` son `TEXT` sin restricción.** Su forma se valida en la aplicación,
  donde se puede explicar el problema; un `CHECK` rechazaría la fila entera del Excel por un
  teléfono mal escrito.
- **La clave de deduplicación se calcula en la aplicación**, no con una expresión en el
  índice. Así la regla vive en un solo sitio (`normalizeValue`) y no en dos definiciones que
  podrían divergir.
- **El DDL empieza con `DROP SCHEMA IF EXISTS`**, de modo que reintentar una construcción
  fallida no choca con los restos. No hay datos que perder: si se llega ahí, la anterior no
  terminó.
- **`POST /build` deja el proyecto en `creating`.** F5 crea la estructura; F6 continuará
  hasta `importing` y `completed`. El estado es el real, no uno provisional.

---

### F6 — Importador determinista ✅ completada (2026-09-15)

**Objetivo.** Trasladar los datos del Excel al schema, deduplicando y preservando
relaciones. Sin IA (P-04).

**Entregables.**

- **Job persistido** `BuildJob` (`queued · running · partial · completed · failed`), con
  contadores de progreso. Sobrevive a refresco, navegación y reinicio del servidor, según
  `docs/architecture/feedback-and-states.md`.
- Algoritmo en dos pasadas, por orden topológico de entidades:

  **Pasada 1 — entidades derivadas.** Para cada entidad obtenida de valores repetidos, se
  recorren las hojas de origen, se calcula `__dedupe_key` con la función de normalización
  acordada (trim, colapso de espacios, minúsculas, sin acentos) sobre el campo elegido como
  clave, y se insertan en lotes con `ON CONFLICT (__dedupe_key) DO NOTHING`. El resultado se
  indexa en memoria como `Map<dedupeKey, uuid>`.

  **Pasada 2 — entidades transaccionales.** Cada fila resuelve sus columnas de relación
  contra el mapa de la pasada 1 y se inserta en lotes de ~1.000 con parámetros.

- **Errores por fila** (decisión 4): si un lote falla, se reintenta fila por fila para
  aislar la culpable, se registra en `ImportRowError` (hoja, fila, motivo, datos crudos) y
  la importación continúa. Al final: `completed` si no hubo errores, `partial` si los hubo.
- Reporte descargable de filas fallidas.
- Resumen final (RF-21): módulos, registros, relaciones creadas.

**Verificación — esta es la fase con los tests más importantes del backend.**

- El caso canónico del ERS §13: 3 filas con `Comercial Andes` repetido → 2 clientes, 2
  vehículos, 2 conductores, 3 viajes, y cada viaje apuntando al cliente correcto.
- Variantes sucias: `ACME`, `acme`, `ACME`, `Acmé` → un solo registro.
- Dos clientes distintos con el mismo nombre pero distinto RUC, con el RUC elegido como
  clave → dos registros.
- Filas con celdas inválidas intercaladas → el resto importa, las malas se reportan.
- 50.000 filas dentro de un presupuesto de tiempo acordado.

**Cubre.** RF-18, RF-19, RF-20, RF-21, RE-06, RNF-02, RNF-06, P-04.

**Resultado.** `corepack pnpm verify` en verde (297 tests, 33 nuevos). El caso del ERS §13
verificado contra PostgreSQL real con el importador de producción: seis filas con tres
variantes de "Comercial Andes" (`Comercial Andes`, `COMERCIAL ANDES`, `  comercial andes  `)
produjeron **2 clientes y 5 viajes**, cada uno enlazado por clave foránea real al cliente
correcto, y la fila con fecha inválida reportada aparte.

**Volumen.** 50.000 filas con 400 clientes en ~4 s (importador en memoria): deduplicación
correcta, cero relaciones sin resolver. La medición contra PostgreSQL queda para F8, donde
el plan sitúa el trabajo de rendimiento con números de antes y después.

**El fallo que encontró la verificación contra la base real.** `01/09/26` se guardaba como
**2026-08-31**. El driver serializa un objeto `Date` en hora **local** con su
desplazamiento, y al convertirlo a una columna `DATE` desde un servidor al oeste de
Greenwich se pierde el día. Esta máquina está en UTC−5, así que el fallo era sistemático en
todas las fechas. Una fecha de negocio no tiene zona horaria: ahora las fechas sin hora
viajan como texto `YYYY-MM-DD`, que PostgreSQL interpreta sin zona horaria de por medio.
Las fechas **con** hora sí son un instante y siguen viajando como `Date`. Hay test de
regresión.

**Desviaciones y decisiones respecto a lo planificado.**

- **La construcción y la importación son un solo proceso.** `POST /build` crea la estructura
  y luego importa, con progreso continuo. Para la persona usuaria "Crear aplicación" es un
  botón, no dos.
- **La deduplicación ocurre dos veces, a propósito.** En memoria antes de insertar —para no
  mandar 50.000 filas y crear 400 registros— y en la base mediante el índice único, como red
  de seguridad.
- **Las relaciones se resuelven contra la columna mostrada, y también contra la clave si es
  distinta.** La hoja de origen puede traer el nombre del cliente o su código; ambos enlazan.
- **Un lote rechazado se reintenta fila a fila** para aislar la culpable. Es lento, pero solo
  ocurre en los lotes que fallan, y es lo que permite que 49.999 filas entren cuando una es
  mala.
- **Los errores de PostgreSQL se traducen a lenguaje de negocio** antes de llegar al reporte:
  `23514` pasa a ser "Uno de los valores de esta fila no está entre los permitidos" (RX-03).
- **El reporte de filas fallidas se descarga en CSV** (`?format=csv`), como pide
  _Import And Background Work_ en `docs/architecture/forms-and-workflows.md`. Se guardan como
  máximo 500 con detalle; el resto solo se cuentan.
- **Los fixtures de los tests necesitaron volumen realista.** Con dos o tres filas el
  validador rechaza cualquier entidad derivada por RI-01, porque una columna cuyos valores
  no se repiten no agrupa nada. El validador acierta; eran los tests los que mentían.

---

### F7 — Runtime CRUD genérico ✅ completada (2026-09-15)

**Objetivo.** Servir la aplicación generada: navegación, tablas, altas, ediciones y
selectores de relación. Es lo que convierte el schema en producto.

**Entregables.**

- **Manifiesto de aplicación**: navegación y metadatos de entidades y campos, expresados en
  etiquetas y `slug`, nunca en nombres de tabla ni de columna. El frontend jamás ve el
  identificador físico.
- **Repositorio genérico** parametrizado por blueprint:
  `list · get · create · update · delete`, con paginación, búsqueda sobre el `displayField`,
  orden y filtros, todo en SQL parametrizado.
- **Resolución de relaciones en lectura**: el listado hace `LEFT JOIN` a la entidad destino
  y devuelve la etiqueta, no el UUID. RF-17 y la regla de "no exponer IDs".
- **Esquemas Zod construidos en tiempo de ejecución** desde el blueprint, para validar altas
  y ediciones: tipo, obligatoriedad, opciones de `select`, existencia del registro
  relacionado (RF-23).
- **Endpoint de opciones** para selectores, con búsqueda por texto y paginación —
  un `select` sobre 10.000 clientes no puede cargarse entero.
- **Borrado**: la FK es `ON DELETE RESTRICT`; el error de PostgreSQL se traduce a lenguaje
  de negocio — _"No se puede eliminar este cliente porque tiene 3 viajes asociados"_ — nunca
  al mensaje crudo del motor (RX-03).

**Endpoints.**

```
GET    /api/projects/:id/app                                manifiesto + navegación
GET    /api/projects/:id/app/:entity/records                RF-14
POST   /api/projects/:id/app/:entity/records                RF-15, RF-23
GET    /api/projects/:id/app/:entity/records/:rid           RF-16
PATCH  /api/projects/:id/app/:entity/records/:rid           RF-24
DELETE /api/projects/:id/app/:entity/records/:rid
GET    /api/projects/:id/app/:entity/options?q=             RF-17
```

**Riesgo.** `:entity` viene de la URL. Se resuelve **siempre** buscando el `slug` en el
blueprint del proyecto y leyendo de ahí el `tableName`; nunca se usa el valor de la URL para
construir SQL. Mismo principio que F5.

**Cubre.** RF-14, RF-15, RF-16, RF-17, RF-22, RF-23, RF-24.

**Resultado.** `corepack pnpm verify` en verde (323 tests, 26 nuevos). Verificado contra
PostgreSQL el ciclo completo sobre la aplicación generada: navegación, tabla de 61
registros, búsqueda, creación, apertura, edición parcial, validación y borrado.

**Aquí el rol de runtime deja de ser teoría.** Todo el CRUD corre con `app_runtime`, que solo
tiene DML. Un fallo en este código no puede alterar estructura: la base lo impide.

**Tres fallos que encontró la verificación contra la base real.**

- **Las fechas volvían como `2026-09-11T05:00:00.000Z`.** El driver convierte una columna
  `DATE` a `Date` usando la zona local, y al serializar sale un instante. Es el mismo
  problema de F6 pero al **leer**. Se corrigió con un parser de tipo: una `DATE` vuelve como
  el texto `YYYY-MM-DD` que está guardado.
- **`BIGINT` y `NUMERIC` volvían como texto** (`ruc: "456"`). Es correcto por defecto —no
  todo `bigint` cabe en un número de JavaScript— pero devolver una cadena a un formulario
  que espera un número obliga a cada consumidor a adivinar. Ahora se convierte **solo** si el
  valor es representable con exactitud; si no, se queda como texto.
- **Buscar solo en la columna mostrada era una trampa.** En una tabla de Viajes cuya etiqueta
  es el cliente, escribir una placa no encontraba nada y la persona concluiría que ese viaje
  no existe. El plan decía "búsqueda sobre el `displayField`"; se amplió a todas las columnas
  de texto (acotadas a ocho), que es lo que el cuadro "Buscar..." de RF-14 promete.

**Decisiones respecto a lo planificado.**

- **Los módulos se direccionan por nombre, igual que en el asistente.** El valor de la URL se
  **resuelve** contra el descriptor antes de tocar la base: `/app/x";DROP SCHEMA public;--/records`
  devuelve 404, verificado contra PostgreSQL con `public` intacto.
- **El esquema de validación se construye en tiempo de ejecución desde el blueprint.** No está
  escrito a mano en ningún sitio, así que no puede divergir de las tablas que se crearon con
  esa misma definición (RF-23).
- **La edición es parcial**: un campo que no llega significa "no lo toques", no "bórralo".
  Verificado: editar solo `vehiculo` conserva `fecha` y `estado`.
- **`ON DELETE RESTRICT` se traduce nombrando el módulo que bloquea**: "No se puede eliminar
  este registro porque Viajes depende de él" (RX-03).
- **Los filtros por campo quedan fuera.** RF-14 pide mostrar, abrir y crear; ordenar y buscar
  ya están. Filtros estructurados son trabajo de F8, junto con sus índices.

---

### F8 — Endurecimiento ✅ completada (2026-09-15)

**Objetivo.** Que lo construido resista uso real y no solo la demo.

**Entregables.**

- **Seguridad**: autorización por registro revisada endpoint por endpoint; rate limiting en
  subida y en análisis (el endpoint que cuesta dinero); cuota de proyectos, de entidades por
  proyecto y de filas por importación; revisión de que ningún mensaje de error filtre nombre
  de schema, de tabla o SQL.
- **Rendimiento**: índices sobre las columnas de relación y sobre el `displayField`;
  `EXPLAIN` sobre el listado con 100.000 registros; medición antes y después según la
  Definition of Done, revirtiendo lo que no mejore.
- **Observabilidad**: logging estructurado con `projectId` y `jobId`; métricas de duración
  de análisis, materialización e importación; los prompts y respuestas del modelo se
  registran sin datos de negocio.
- **Límites del modelo**: control de coste por proyecto y manejo de `RateLimitError` con
  reintento y degradación al fallback de RE-04.
- Documentación actualizada: `docs/architecture/database.md` (aclarar que la regla de Prisma
  aplica al plano de control), `docs/product/domain-model.md`, `docs/product/glossary.md`.

**Resultado.** `corepack pnpm verify` en verde (336 tests, 13 nuevos). Cuotas, limitación de
tasa y correlación de logs verificadas contra el API real.

**Rendimiento, con números de antes y después.** `corepack pnpm --filter @app/api bench`
sobre 100.000 viajes y 500 clientes, usando el SQL de producción y midiendo la mediana de
siete ejecuciones:

| Operación                        | Sin índices | Con índices | Mejora |
| -------------------------------- | ----------: | ----------: | -----: |
| Primera página del listado       |     32,1 ms |      0,8 ms |    ×39 |
| Borrar un padre sin dependientes |      6,9 ms |      0,5 ms |    ×15 |
| Recuento total                   |      4,9 ms |      4,5 ms |   ×1,1 |
| Búsqueda de texto libre          |     42,2 ms |     42,1 ms |   ×1,0 |

Los tres índices que F5 crea quedan justificados: el de la columna mostrada por el listado,
el de la columna de relación por la comprobación `RESTRICT`, y el único de deduplicación por
correctitud (RF-20), no por velocidad. **Nada que revertir.**

**Hallazgo: el índice de relación no servía para lo que yo creía.** Lo medí primero
borrando un cliente **con** viajes y salió ×0,9 — ninguna mejora, porque `RESTRICT`
encuentra la primera coincidencia enseguida. El índice gana al borrar un cliente **sin**
viajes, donde hay que demostrar la ausencia recorriendo la tabla entera. La medición
correcta da ×15.

**Característica conocida, no corregida.** La búsqueda de texto usa `ILIKE '%…%'`, que
ningún índice B-tree puede servir: 42 ms sobre 100.000 filas, con índices o sin ellos. Es
aceptable a esta escala. Si deja de serlo, la solución es un índice GIN con `pg_trgm`, que
exige la extensión disponible en el entorno de destino y por tanto un ADR.

**Desviaciones y decisiones.**

- **La limitación de tasa se implementó a mano** en vez de añadir una dependencia: el proceso
  es uno solo, así que un contador en memoria es igual de preciso que uno externo, y el
  rechazo tiene que salir con el mismo sobre de error que todo lo demás. Limitación anotada:
  con varias instancias cada una llevaría sus contadores.
- **El contador es por persona, no por dirección IP.** Varias personas tras el mismo router
  de oficina no tienen por qué compartir cuota, y una sola con varias direcciones no debería
  multiplicarla.
- **Dos tests nuevos valen por una revisión manual**: uno recorre TODOS los endpoints —en
  respuesta correcta y en error— afirmando que nada técnico llega al cliente; otro comprueba
  que ninguno de los 18 endpoints de proyecto omite la comprobación de propiedad. Es el fallo
  que se cuela al añadir el endpoint número veinte.
- **La ruta del log se normaliza desde `originalUrl`.** Ni `request.route` ni `request.path`
  sirven: Express reescribe la URL dentro de un router montado y restablece `baseUrl` al
  salir, así que la misma operación se registraba con dos rutas distintas según se atendiera
  o se rechazara. Dos series para lo mismo hacen inservible un panel de métricas.
- **Seguimientos del ADR 0001 cerrados**: cuota de proyectos por persona
  (`MAX_PROJECTS_PER_USER`), límite de entidades por proyecto (30, en el validador), y
  `docs/architecture/database.md` aclara que "las migraciones de Prisma son la fuente de
  verdad" aplica **solo** al plano de control.

---

### F9 — Demo y aceptación ✅ completada (2026-09-15)

**Objetivo.** Demostrar los 18 criterios del ERS de forma automatizada.

**Entregables.**

- `viajes.xlsx` de demo (§18): columnas `Fecha, Cliente, RUC, Vehículo, Conductor, Valor,
Estado`, con repetición suficiente para que la deduplicación sea visible, más una segunda
  hoja `Clientes` con datos extra por cliente — el caso que justifica la decisión 2.
- **Test end-to-end** que recorre el flujo completo por HTTP y afirma CA-01 a CA-18, con el
  proposer determinista para que no dependa de la API.
- Un segundo test end-to-end con un Excel distinto, que verifica que el ciclo multi-proyecto
  funciona y que los dos schemas quedan aislados.
- Un test manual con el motor real de inferencia, documentado, para validar la calidad de la
  propuesta.

**Resultado.**

El archivo de demo vive en `tests/helpers/demo-fixture.ts`, no como binario versionado: se
genera con la misma librería que luego lo lee, así que no puede quedar desincronizado del
código. Son 122 filas de `Viajes` con 4 clientes —escritos en mayúsculas, con espacios
sobrantes y bien, para que deduplicar cambie el resultado de forma visible—, una segunda
hoja `Clientes` con correo, teléfono y ciudad que **no** están en la primera, y una pestaña
`Notas` vacía como la que trae cualquier archivo real. Dos filas llevan basura deliberada.

`tests/acceptance.test.ts` recorre el flujo entero por HTTP una sola vez y afirma los 18
criterios, **uno por caso con su nombre**, de modo que al fallar diga cuál se rompió.
`tests/multi-project.test.ts` construye dos aplicaciones distintas desde dos Excel
distintos y comprueba que quedan aisladas.

| Comprobación                                | Dónde                         |
| ------------------------------------------- | ----------------------------- |
| CA-01…CA-18 sobre dobles, en `pnpm verify`  | `tests/acceptance.test.ts`    |
| Ciclo multi-proyecto y aislamiento          | `tests/multi-project.test.ts` |
| Los mismos criterios contra PostgreSQL real | `pnpm acceptance:live`        |
| Calidad de la propuesta del motor real      | `pnpm inference:check`        |

La verificación en vivo pasa **15/15** contra la base real, mirando dentro del schema
creado: 4 tablas en `proj_*`, 4 clientes y 120 viajes desde 122 filas de Excel, 0 viajes
huérfanos, 3 claves foráneas declaradas, la edición de un registro importado llegando a la
tabla, y el schema desapareciendo al borrar el proyecto.

**Desviaciones y añadidos respecto a lo planificado.**

- **El plan pedía un test end-to-end; se entregaron dos niveles.** El automatizado corre
  sobre los dobles del plano de datos, que son fieles pero son dobles. Un test de
  aceptación que corre solo sobre dobles no puede afirmar que el producto funciona, así
  que se añadió `scripts/acceptance-live.ts`: el mismo recorrido contra PostgreSQL, con
  DDL real, importación real y el rol `app_runtime` real, más consultas directas al schema
  creado para comprobar que las filas están donde tienen que estar. No entra en
  `pnpm verify` porque necesita la base levantada.
- **Los dos dobles del plano de datos no se hablaban entre sí.** El importador reproduce el
  índice único; el repositorio de registros reproduce la clave foránea y el borrado
  restringido; hasta ahora ningún test necesitaba cruzarlos, porque cada uno probaba su
  mitad. La aceptación sí lo necesita —CA-17 exige que el CRUD vea lo que la importación
  escribió— y de ahí sale `tests/helpers/adopt-imported.ts`, que traduce nombres físicos de
  columna a nombres públicos de campo conservando los identificadores. Que tenga que existir
  es una limitación de los dobles, no del sistema, y es la razón concreta de la verificación
  en vivo.
- **`compose()` acepta sustituciones.** Los dos scripts necesitan el sistema real con dos
  piezas fijadas: una propuesta conocida y una sesión dada. Elegir implementaciones es el
  trabajo del composition root, así que el parámetro va ahí y no en una puerta trasera del
  resto del código. `main.ts` no pasa nada.
- **El test manual del motor real quedó ejecutable, no descrito.**
  `scripts/inference-check.ts` hace la llamada, imprime la propuesta entera y la puntúa
  contra nueve expectativas derivadas del §18. Lo que ninguna aserción puede juzgar —si los
  nombres son los del negocio, si los campos obligatorios están bien elegidos, si el resumen
  se lee con naturalidad— queda para quien lo ejecute, y por eso ve la propuesta impresa.
  El procedimiento y el registro de ejecuciones están en
  `docs/quality/inference-manual-check.md`.
- **CA-13 termina en `partial`, no en `completed`, y es la respuesta correcta.** El archivo
  de demo trae dos celdas malas a propósito; la decisión 4 dice continuar y reportar, así
  que el trabajo importa las otras 120 filas pero no finge que salió perfecto. El test lo
  afirma explícitamente para que nadie lo "arregle" después.
- **CA-10 se interpretó y la interpretación está escrita en el test.** El backend no dibuja
  formularios. Lo que se verifica es que entrega todo lo necesario para dibujar uno sin
  adivinar nada: etiqueta, tipo, obligatoriedad, opciones de las listas cerradas y el módulo
  al que apunta cada relación.
- **CA-18 se verifica por la negativa.** No hay aserción que demuestre "no hizo falta
  escribir código"; lo que se afirma es lo que nunca salió por la API: ni SQL, ni
  `tableName`, ni `columnName`, ni `proj_*`, ni columnas de sistema. El único texto libre
  que escribió la persona en todo el recorrido fue el nombre del proyecto.
- **El test de aceptación descubrió dos errores, ambos míos y ninguno del sistema.** Las
  filas rechazadas son la 122 y la 123, no la 123 y la 124 —conté mal el encabezado—, y la
  primera versión de CA-18 buscaba `SELECT` sin distinguir mayúsculas, que casa con
  `"type":"select"`, un tipo de campo perfectamente legítimo.

---

## Orden de dependencias

```
F0 ─ F1 ─ F2 ─ F3 ─ F4 ─ F5 ─ F6 ─ F7 ─ F8 ─ F9
               └─────┴── F4 y F5 pueden solaparse: el contrato del
                          blueprint se congela al final de F4
```

F3 puede desarrollarse en paralelo a F4/F5 usando el proposer determinista, porque está
detrás de un puerto.

---

## Riesgos principales

| Riesgo                                       | Fase | Mitigación                                                                     |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| Inyección de identificadores en el DDL       | F5   | Tres capas + test de adversario dedicado                                       |
| El modelo propone algo fuera del vocabulario | F3   | Structured outputs + validador determinista + fallback RE-04                   |
| La deduplicación duplica o fusiona de más    | F6   | Clave normalizada persistida + índice único + batería de tests de datos sucios |
| Excel real rompe el parser                   | F2   | Corpus de archivos difíciles desde el primer día                               |
| Coste/latencia de la inferencia              | F3   | Se envía el perfil, no las filas; caché de prompt; una sola llamada            |
| Crecimiento sin control de schemas           | F8   | Cuotas y borrado real de proyectos                                             |

---

## Decisions

- **2026-09-15** — Almacenamiento: schema real por proyecto con DDL dinámico. ADR 0001.
- **2026-09-15** — Multi-hoja: modelo unificado con relaciones entre hojas. Deroga la
  restricción 1 de §16 del ERS.
- **2026-09-15** — Deduplicación: clave normalizada + columna identificadora sugerida y
  editable.
- **2026-09-15** — Errores de importación: continuar y reportar (RE-06 resuelto).
- **2026-09-15** — La IA se invoca exactamente una vez por proyecto, en F3, detrás de un
  puerto. Todo lo demás es determinista.
- **2026-09-15** — Better Auth entra en el MVP: la plataforma es multi-proyecto y necesita
  propietario por proyecto. `AGENTS.md` ya lo exigía.

## Pendiente de decidir

- Nombre de la aplicación generada: ¿lo propone el modelo o lo escribe siempre el usuario?
- Editar la estructura de una aplicación **ya creada** (añadir un campo después de importar)
  está fuera del ERS y fuera de este plan. Si se quiere, exige `ALTER TABLE` con plan de
  datos y un ADR propio.
- ¿Se permite volver a importar otro Excel sobre un proyecto existente, o cada Excel es
  siempre un proyecto nuevo?

## Verification

Por fase, según se detalla arriba. Global, con el backend terminado (2026-09-15):

| Comprobación                                | Estado                                  |
| ------------------------------------------- | --------------------------------------- |
| `corepack pnpm verify`                      | ✅ 362 tests en 25 archivos             |
| Test end-to-end CA-01…CA-18                 | ✅ 18/18                                |
| Los mismos criterios contra PostgreSQL real | ✅ 15/15 (`pnpm acceptance:live`)       |
| Test de adversario de identificadores       | ✅ 21 tests                             |
| Batería de deduplicación                    | ✅ incluida en importación y aceptación |
| Importación de 50.000 filas                 | ✅ 5,3 s                                |
| Calidad de la propuesta del motor real      | ⬜ **pendiente**: sin credenciales aquí |

La última fila es la única deuda de verificación que queda, y es una deuda de entorno, no
de código: `scripts/inference-check.ts` está escrito y listo para ejecutarse. Hasta que
alguien lo corra con una clave, el estado honesto del motor de inferencia es que **su
contrato está verificado y su calidad no**. Ver
[`docs/quality/inference-manual-check.md`](../../quality/inference-manual-check.md).
