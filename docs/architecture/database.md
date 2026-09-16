# Database Architecture

## Two Planes

This project has **two** database planes, and the rules below apply differently to each.
See [ADR 0001](adr/0001-per-project-schema-ddl.md).

| Plane       | Schema      | Owner       | Rules                                        |
| ----------- | ----------- | ----------- | -------------------------------------------- |
| **Control** | `public`    | Prisma      | Everything in this document applies          |
| **Data**    | `proj_<id>` | Runtime DDL | Created per project; Prisma never touches it |

**"Prisma migrations are the source of truth" applies to the control plane only.** The data
plane's shape is decided by the user at runtime, so no build-time migration can describe it.
Its integrity is enforced instead by real foreign keys, unique indexes and check
constraints, created in a single transaction by the materializer.

## Primary Database

- Engine: PostgreSQL 16 (>= 13 required for `gen_random_uuid()`).
- ORM/query layer: Prisma, control plane only.
- Migration strategy: versioned Prisma migrations, control plane only.

## Roles

Two roles, and the separation is enforced by the database, not by convention:

| Role          | Grants                                | Used by                          |
| ------------- | ------------------------------------- | -------------------------------- |
| `ets_owner`   | DDL on `public` and on every `proj_*` | Prisma, materializer, importer   |
| `app_runtime` | `USAGE` + DML on `proj_*` tables only | The generated applications' CRUD |

`app_runtime` cannot `CREATE`, `ALTER`, `DROP` or `TRUNCATE`. A bug in the generated CRUD
can lose a project's rows; it cannot touch a schema.

## Quotas

Each project creates a PostgreSQL schema, and schemas per database are finite:

- `MAX_PROJECTS_PER_USER` (default 50) caps schemas per account.
- `MAX_ENTITIES` (30, in the blueprint validator) caps tables per project.
- `MAX_SHEET_ROWS`, `MAX_SHEETS`, `MAX_UNCOMPRESSED_BYTES` cap what one file can cost.

## Data Ownership

| Table/Collection | Owner        | Notes        |
| ---------------- | ------------ | ------------ |
| `{{TABLE}}`      | `{{MODULE}}` | Description. |

## Migration Rules

- Schema changes require a migration.
- Generated database docs must be refreshed after migrations.
- Destructive migrations require an explicit data plan.
- Production migration credentials should be limited after initial provisioning.
- Use PostgreSQL in production. Do not silently fall back to SQLite.
- Avoid data loss on redeploy. Application containers must not own production database storage.

## Indexing

Every generated table gets three kinds of index, all measured on 100.000 rows
(`corepack pnpm --filter @app/api bench`):

| Index                 | Query it serves                        | Measured effect        |
| --------------------- | -------------------------------------- | ---------------------- |
| `<table>_display_idx` | Default listing, sorted by the label   | 31 ms -> 0.8 ms (x39)  |
| `<table>_<col>_idx`   | `ON DELETE RESTRICT` check on a parent | 6.9 ms -> 0.5 ms (x15) |
| `<table>_dedupe_idx`  | `ON CONFLICT` deduplication (RF-20)    | Correctness, not speed |

**Known characteristic:** free-text search uses `ILIKE '%...%'`, which no B-tree index can
serve. It measures ~42 ms on 100.000 rows, with or without indexes. That is acceptable at
this scale. If it stops being acceptable, the fix is a `pg_trgm` GIN index, which needs the
extension available in the target environment and therefore an ADR.

## Auth Tables

Better Auth owns its auth-related tables. Application code should not manually mutate password/session internals except through documented Better Auth APIs.
