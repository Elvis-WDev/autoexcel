# ADR 0001: Un schema PostgreSQL real por proyecto, creado con DDL dinámico

## Status

Accepted — 2026-09-15

## Context

El producto (ver `ERS.md`) convierte un Excel en una aplicación de gestión. Cada Excel
cargado produce un **proyecto** independiente con sus propias entidades, campos y
relaciones, y todos los proyectos conviven en la misma plataforma.

`docs/architecture/database.md` establece que _"las migraciones de Prisma son la fuente de
verdad del esquema"_. Eso es incompatible con un producto cuyo esquema de datos **se define
en tiempo de ejecución**, a partir de lo que el usuario confirma en el asistente. No existe
migración posible en tiempo de build para tablas que aún no se sabe que existirán.

Se evaluaron tres opciones:

1. **Metadata-driven / JSONB.** Tablas fijas (`Project`, `Entity`, `Field`, `Record`) con
   los valores en una columna `JSONB`. No ejecuta DDL. Integridad referencial en
   aplicación, sin claves foráneas reales.
2. **Tablas reales por proyecto (DDL dinámico).** Cada proyecto obtiene un schema
   PostgreSQL propio con tablas, columnas, claves foráneas e índices nativos.
3. **Híbrido.** Tabla única de registros con columnas tipadas genéricas.

## Decision

Se adopta la **opción 2**: cada proyecto materializa un schema PostgreSQL propio
(`proj_<id>`) con tablas reales, generadas por DDL en tiempo de ejecución.

El sistema queda dividido en dos planos:

- **Plano de control** (`public`): propiedad de Prisma, con migraciones versionadas
  normales. Contiene usuarios, proyectos, archivos, hojas, perfilado de columnas,
  blueprints, mapeos de trazabilidad y trabajos de construcción/importación.
- **Plano de datos** (`proj_<id>`): propiedad del materializador. SQL generado y
  ejecutado en tiempo de ejecución. Prisma **no** lo conoce ni lo tipa.

La frontera es estricta: Prisma nunca emite DDL sobre `proj_*`, y el materializador nunca
toca `public`.

## Consequences

### Positivas

- **Integridad real.** Las relaciones de RF-19 son claves foráneas de PostgreSQL. No es
  posible que un viaje apunte a un cliente inexistente, aunque la aplicación tenga un bug.
- **Deduplicación real.** RF-20 se resuelve con un índice único sobre la clave de
  deduplicación y `ON CONFLICT DO NOTHING`, no con lógica de aplicación.
- **DDL transaccional.** PostgreSQL permite `CREATE SCHEMA` / `CREATE TABLE` dentro de una
  transacción. Toda la creación de una aplicación ocurre en una sola transacción: si algo
  falla, no queda nada a medias. Esto satisface RNF-05 y RE-05 sin código compensatorio.
- **Aislamiento entre proyectos.** Un schema por proyecto; borrar un proyecto es
  `DROP SCHEMA ... CASCADE`.
- **Rendimiento nativo.** Índices, tipos y planificador de PostgreSQL trabajando sobre
  columnas reales, no sobre extracción de JSON.

### Negativas

- **Superficie de inyección de identificadores.** Es el riesgo dominante de esta decisión.
  Se mitiga con: identificadores generados por máquina y persistidos (nunca derivados de
  texto del usuario en el momento de construir el SQL), validación contra
  `^[a-z_][a-z0-9_]{0,62}$` inmediatamente antes de cada uso, `quote_ident` como segunda
  capa, y valores **siempre** parametrizados (`$1..$n`). Ver F5 del plan de backend.
- **Prisma no tipa el plano de datos.** El CRUD de las aplicaciones generadas usa SQL
  parametrizado a través de un repositorio genérico. Se pierde el tipado estático sobre
  esas tablas; se compensa con esquemas Zod construidos en tiempo de ejecución a partir del
  blueprint.
- **Dos roles de base de datos.** El materializador necesita permisos de DDL; el runtime no
  debe tenerlos. Requiere separar credenciales.
- **Límites de PostgreSQL entran en juego.** 63 bytes por identificador, y un límite
  práctico de schemas por base de datos. Debe haber cuota de proyectos por usuario.
- **Migrar la estructura de una aplicación ya creada es DDL, no metadatos.** Queda fuera
  del MVP (el ERS no lo pide), pero es deuda conocida: editar una entidad después de
  crearla exigirá `ALTER TABLE` con plan de datos.

### Follow-up

- Registrar la cuota de proyectos y el límite de entidades por proyecto en F8.
- Documentar en `docs/architecture/database.md` que la regla "Prisma es la fuente de
  verdad" aplica al plano de control únicamente, y enlazar este ADR.
- Si en el futuro se requiere editar la estructura de una aplicación ya construida, abrir
  un ADR sobre estrategia de migración del plano de datos.
