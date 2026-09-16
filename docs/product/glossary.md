# Glossary

Terms used across `ERS.md`, the code and the docs. Spanish terms appear as the product uses
them; the code uses the same words.

| Term                       | Meaning                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Proyecto** (project)     | One uploaded spreadsheet and everything derived from it: its analysis, its blueprint and its generated application. Owns one schema.  |
| **Blueprint**              | The functional definition of an application before it exists: entities, fields, relations. ERS 5.4. The hinge of the whole system.    |
| **Entidad** (entity)       | A business concept that groups records of the same kind. Becomes one table and one module.                                            |
| **Campo** (field)          | A property of an entity. Becomes one column. Limited to ten types (RF-08).                                                            |
| **Relación** (relation)    | A link between two entities, always one-to-many. Declared from the "many" side, which is the side carrying the field.                 |
| **Módulo** (module)        | An entity as the user sees it in the generated application: a list, a create form and an edit form.                                   |
| **Campo mostrado**         | `displayField`. The field that represents a record in a list or a selector. Not in the ERS, but RF-17 is impossible without it.       |
| **Clave de deduplicación** | `dedupeField`. The field that decides whether two spreadsheet rows are the same record. Decides how many records will exist.          |
| **Plano de control**       | The `public` schema: users, projects, files, blueprints, jobs. Owned by Prisma.                                                       |
| **Plano de datos**         | A project's `proj_<id>` schema: the real tables holding the imported data. Created by runtime DDL.                                    |
| **Materializador**         | The component that turns a confirmed blueprint into a real schema, in one transaction.                                                |
| **Perfilado** (profile)    | The deterministic statistics of a column: distinct values, empties, cardinality, apparent type, samples. RF-04.                       |
| **Cardinalidad**           | Distinct values over non-empty values. Near 1 the column identifies rows; near 0 it groups them. The main signal for RI-01 and RI-02. |
| **Solapamiento**           | Two columns in different sheets holding the same values. What allows one unified model instead of one per sheet.                      |
| **Contención**             | Shared values over the smaller set. Used instead of Jaccard, which says nothing when the two sets differ greatly in size.             |
| **Estructura simple**      | The deterministic fallback of RE-04: one entity per sheet, no relations. Used when inference is unavailable or its output is invalid. |
| **Identificador físico**   | A table or column name in PostgreSQL. Always machine-generated, never derived from user text at SQL-composition time (ADR 0001).      |

## Naming Rules

- Use product language in UI copy: "módulo", not "tabla"; "grupo de información", not "entidad".
- Never expose `schemaName`, `tableName` or `columnName` outside the data layer.
- Error messages name the field by its **label**, the one the person sees on screen.
- Never require database vocabulary in the main flow (RX-03): no `foreign key`, `schema`, `SQL`.
