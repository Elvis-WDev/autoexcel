# Product Overview

> Source of truth for requirements: [`ERS.md`](../../ERS.md) (Spanish). This page is the
> short version plus the decisions taken after the ERS was written.

## Purpose

People run real operations on spreadsheets for years. A single sheet ends up mixing
customers, products, trips, vehicles, invoices and statuses in the same rows, which
produces duplicated data, no traceability and no way to relate records.

This product turns that spreadsheet into a working management application. The user
uploads an Excel file; the system profiles it, proposes a data model with AI assistance,
lets the user correct that proposal step by step, and then deterministically builds a real
database, tables, forms and relations, and imports the original data into it.

It is not a code generator and not an autonomous coding agent. The unit of the product is
**the structure of the information**, not source code.

## Users

- **Primary user — creator.** Knows their business and knows Excel. Does not know
  databases, and is never required to. Uploads files, reviews proposals, confirms
  structure, then uses the generated application.
- **Secondary user — none in the MVP.** One functional role only.
- **Admin/operator — none in the MVP.** Operational concerns are covered by `/health`,
  structured logs and quotas.

## Problems Solved

- Duplicated records in a flat sheet become one record plus relations.
- Business concepts trapped in columns become entities with their own list and forms.
- Manual translation from spreadsheet to database schema disappears.
- The person who owns the data no longer needs a developer to get a usable application.

## Core Workflows

1. **Create a project from a spreadsheet.** Upload an `.xlsx`, profile every sheet, detect
   headers and column shape. No AI involved.
2. **Review the proposed model.** Entities, fields, types and relations are proposed and
   then corrected by the user in a guided wizard. Nothing is created until the user
   confirms the summary.
3. **Build and import.** The confirmed blueprint materializes a real PostgreSQL schema in a
   single transaction, and the original rows are imported: repeated values are deduplicated
   into their own records, and relations between them are preserved.
4. **Use the generated application.** Navigate between modules, list, search, create and
   edit records. Related fields are record selectors, never raw identifiers.
5. **Repeat.** A second spreadsheet produces a second, fully independent project.

## Key Decisions

Taken after the ERS and binding for implementation:

| Decision                                                                | Where                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| One real PostgreSQL schema per project, created by runtime DDL          | [ADR 0001](../architecture/adr/0001-per-project-schema-ddl.md)                    |
| All sheets are read; one unified model with cross-sheet relations       | [Backend plan](../plans/active/backend-mvp.md) — supersedes ERS §16 restriction 1 |
| Deduplication by normalized key, with a suggested and editable identity | Backend plan, decision 3 — resolves the ambiguity in ERS RF-20                    |
| Import continues on row failure and reports the failed rows             | Backend plan, decision 4 — resolves the open choice in ERS RE-06                  |
| The platform is multi-project: each spreadsheet is its own application  | Backend plan — new requirement, not in the ERS                                    |

## Where AI Is Allowed

AI participates in exactly one step: proposing entities, which columns belong to which
entity, each field's basic type, and simple relations between entities (ERS §21).

It does not create storage, execute structural changes, insert records, render components,
import rows, or generate or run code (ERS §22). It is called once per project, behind a
port, and its output is validated by a deterministic validator before it can be persisted.
Everything after the user's confirmation is deterministic.

## Non-Goals

- Generating source code, or editing code.
- Dashboards, charts, KPIs, advanced reports.
- Automations, workflows, complex business rules, computed fields, formulas, scripting.
- Many-to-many relations, hierarchical entities.
- Reading Excel formulas or macros as application logic.
- Changing an application's structure after it has been built (known debt — see ADR 0001).
- Advanced permissions, roles, visual customization, mobile applications.

## Source Of Truth

- Requirements: `ERS.md`
- Backend plan: `docs/plans/active/backend-mvp.md`
- Domain model: `docs/product/domain-model.md`
- Glossary: `docs/product/glossary.md`
- Architecture: `ARCHITECTURE.md`
