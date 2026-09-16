# Project Agent Guide

## Project

`{{PROJECT_NAME}}` is a TypeScript application built with:

- Node.js.
- Express.js REST API.
- Next.js frontend.
- Better Auth for authentication.
- PostgreSQL as the primary database.
- Prisma for ORM and migrations.
- Tailwind CSS and shadcn/ui for UI.
- React Hook Form and Zod for forms.
- Axios for external HTTP integrations.
- pnpm through Corepack as the only package manager.

## Read Before Working

- Product overview: `docs/product/overview.md`
- Architecture map: `ARCHITECTURE.md`
- Architecture details: `docs/architecture/index.md`
- Stack baseline: `docs/architecture/stack.md`
- Authentication: `docs/architecture/authentication.md`
- Frontend architecture: `docs/architecture/frontend.md`
- Interface design: `docs/architecture/interface-design.md`
- Active plans: `docs/plans/active/`
- Definition of done: `docs/quality/definition-of-done.md`
- Version control: `docs/quality/version-control.md`
- Frontend review checklist: `docs/quality/frontend-checklist.md`
- Security principles: `docs/security/principles.md`
- Security hardening: `docs/security/hardening.md`
- Performance: `docs/quality/performance.md`

## Workflow

1. Read this file and the nearest `AGENTS.md` for the files you will touch.
2. Open only the relevant docs for the current task.
3. For non-trivial work, create or update a plan in `docs/plans/active/`.
4. Implement the smallest coherent change.
5. Update documentation when behavior, architecture, API, data, or decisions change.
6. Run the project's verification commands before calling work complete.
7. Commit each coherent unit separately, with a short descriptive message.

## Required Verification

Use pnpm through Corepack. Replace placeholders only when the project exposes different script names:

- Install: `corepack pnpm install`
- Format: `corepack pnpm format`
- Lint: `corepack pnpm lint`
- Test: `corepack pnpm test`
- Typecheck: `corepack pnpm typecheck`
- Build: `corepack pnpm build`
- Full validation: `corepack pnpm verify`

## Constraints

- Do not put product or architecture knowledge in `.codex/`.
- Always use pnpm through Corepack; never use npm or yarn in this repository.
- Use Better Auth for authentication; do not hand-roll password hashing, login flows, or session storage.
- Use PostgreSQL as the primary production database.
- Use Prisma migrations for database schema changes.
- Use environment variables for configuration and validate them at startup.
- Keep provider tokens and secrets server-side.
- Do not introduce production dependencies without documenting why.
- Do not modify generated files manually.
- Do not bypass validation at HTTP, environment, auth, database, or external-service boundaries.
- Enforce authorization server-side for each record; a frontend permission gate is presentation only.
- Measure before optimizing, and revert any optimization that does not beat its baseline.
- Do not mark work complete while verification is failing.
- Keep secrets out of committed files.
- Commit one coherent unit at a time; never batch a whole working session into one commit.
- Write commit subjects as `type(scope): imperative subject` under 72 characters, and keep bodies to three short lines at most.
- Commit and push only when asked, and never rewrite published history without an explicit request.
- Do not expose internal IDs, provider names, storage paths, auth implementation details, or other technical references in product UI when a business-facing label or automatic backend value is possible.
- Reuse the documented table, form, dialog, feedback, navigation, and responsive patterns instead of inventing a different interaction model per module.
- Optimize operational screens for scanning and repeated work. Remove redundant summaries, duplicated headings, explanatory boxes, and nested cards that do not help the user decide or act.
- Separate a module's areas as sidebar submodules, not as tabs inside one page.
- Route every mutation through the shared feedback helper; no action ends without pending, success, or error feedback.
- Confirm irreversible actions by typing the record name, and keep reversible ones to a single step.

## Definition Of Done

Implementation, verification, documentation, and acceptance criteria must agree.
