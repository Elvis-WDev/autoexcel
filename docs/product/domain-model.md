# Domain Model

The product has two distinct models, and keeping them apart is what makes the system
tractable. See the [glossary](glossary.md) for terms and
[ADR 0001](../architecture/adr/0001-per-project-schema-ddl.md) for the storage decision.

## 1. Platform model

Fixed, known at build time, owned by Prisma in the `public` schema.

### `Project`

- **Purpose:** one uploaded spreadsheet and everything derived from it.
- **Key attributes:** `name` (what the user typed), `slug` (URL, unique per owner),
  `schemaName` (machine-generated, never derived from user text), `status`.
- **Invariants:**
  - `schemaName` matches `^proj_[0-9a-f]{16}$` and is unique across the platform.
  - `status` only moves along the transitions declared in `domain/project-status.ts`.
  - Every access checks `ownerId` server-side; a foreign project answers 404, not 403.
- **Relationships:** owns one `SourceFile`, at most one `Blueprint`, many `Job`.

### `SourceFile` / `Sheet` / `SourceColumn`

- **Purpose:** the uploaded file and its deterministic analysis (RF-03, RF-04).
- **Invariants:**
  - `storagePath` is machine-generated; `originalName` is a label and never a path.
  - Re-uploading replaces the whole analysis: no mixing two files' columns.
  - `SourceColumn.profile` is the input to inference, and it is the **only** thing that
    leaves the server when the model is called. Rows never do.

### `Blueprint` / `BpEntity` / `BpField` / `BpRelation`

- **Purpose:** the functional definition before anything exists (ERS 5.4). The hinge: AI
  writes here once, everything downstream is deterministic.
- **Invariants:**
  - Field types are restricted to the ten of RF-08. Nothing else can be persisted.
  - Relations are `many_to_one`, never self-referential, never cyclic.
  - Every entity has a `displayField` that exists among its fields.
  - `status: confirmed` freezes it; edits are refused from then on.
  - `tableName` and `columnName` are null until the application is built.

### `Job` / `ImportRowError`

- **Purpose:** long-running work the interface can follow (RNF-06), and the rows that did
  not make it (RE-06).
- **Invariants:** a job survives a page reload; it does **not** survive a server restart,
  so orphans are marked failed at startup.

## 2. Generated model

Not fixed. Decided by the user at runtime, one schema per project. The platform knows its
_shape_ (`Blueprint`) but not its _content_ at build time.

```
Application  ->  Entity[]  ->  Field[] + Relation[]      (ERS 12)
     |              |
  schema        table + module
```

Each generated table carries system columns the user never sees:

| Column                      | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `id`                        | UUID primary key                                   |
| `__dedupe_key`              | Normalized key backing RF-20's unique index        |
| `__source`                  | Sheet and row of origin, for traceability (RNF-02) |
| `created_at` / `updated_at` | Audit                                              |

## Business rules

1. **AI proposes, the user confirms** (P-01). Nothing is created before an explicit
   confirmation of the summary.
2. **The vocabulary is closed** (P-02). Ten field types, one relation kind. A deterministic
   validator enforces it regardless of what the model returns.
3. **After confirmation everything is deterministic** (P-03). The model is called once per
   project, behind a port, and never again.
4. **Import is never done by AI** (P-04). Moving rows is mechanical work where the only
   virtue is doing the same thing every time.
5. **The user's decision wins** (RI-06). Deleting an entity demotes the fields that pointed
   at it to plain fields; it does not delete data.
6. **Two rows are the same record when their normalized key matches** (decision 3):
   trimmed, whitespace-collapsed, lowercased, unaccented. `ACME`, `acme` and `  Acmé  ` are
   one client.
7. **A bad cell does not stop the import** (decision 4, RE-06). The row is reported and the
   rest goes in.
8. **User text never reaches SQL** (ADR 0001). Labels and physical identifiers are different
   things; the identifier is always machine-generated, validated and persisted.
