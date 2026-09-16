---
name: implement-feature
description: Use when adding or changing application behavior. Guides the agent through reading product specs, planning, implementing, validating, and documenting the change.
---

# Implement Feature

## Context To Load

Read:

- `AGENTS.md`
- Nearest scoped `AGENTS.md`, if present.
- Relevant feature spec under `docs/product/features/`.
- `docs/quality/definition-of-done.md`
- Relevant architecture document under `docs/architecture/`.
- `docs/architecture/stack.md`

## Workflow

1. Identify the feature specification and acceptance criteria.
2. If the task is non-trivial, create or update a plan in `docs/plans/active/`.
3. Update domain concepts first when business rules change.
4. Add or update application ports/interfaces before infrastructure adapters.
5. For backend work, use Express controllers/routes, Zod validation, Better Auth middleware, Prisma repositories, and typed Axios clients when needed.
6. For frontend work, use Next.js, shadcn/ui, React Hook Form, Zod, typed API helpers, and clear loading/error states.
7. Update generated references when contracts change.
8. Update feature decisions or ADRs when architecture changes.
9. Run the project verification command.
10. Commit each coherent unit separately, following `docs/quality/version-control.md`.

## Guardrails

- Keep domain code framework-free.
- Do not pass HTTP request/response objects into use cases.
- Keep response and error shapes consistent with architecture docs.
- Do not expose secrets to the frontend or logs.
- Do not implement custom auth when Better Auth covers the need.
- Do not bypass Prisma migrations for schema changes.
- Do not use npm or yarn.
