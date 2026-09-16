# Stack Baseline

This is the default technology stack for new applications using this context.

## Package Manager

- Use pnpm through Corepack.
- Do not use npm or yarn for installs, scripts, audits, or lockfile updates.
- Keep the package manager version declared in `packageManager` when a code repo exists.

Recommended commands:

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
corepack pnpm verify
```

## Backend

- Node.js.
- TypeScript.
- Express.js for REST APIs.
- Zod for request, response, and environment validation.
- Better Auth for authentication.
- Prisma for database access.
- PostgreSQL as the primary database.
- Axios for external HTTP APIs.

## Frontend

- Next.js with TypeScript.
- React.
- Tailwind CSS.
- shadcn/ui for reusable UI components.
- lucide-react for icons.
- React Hook Form for forms.
- Zod for form schemas.
- shadcn charts or a chart library integrated through shadcn conventions for dashboards.
- Auto-animate or equivalent small motion helpers only when motion improves clarity.

## Persistence

- PostgreSQL is the production database.
- Prisma migrations are the schema source of truth.
- SQLite can be used only for disposable local experiments if explicitly documented.

## Authentication

- Better Auth owns sign-in, sign-out, sessions, cookies, password hashing, and auth tables.
- Do not implement custom password hashing or session tables unless an ADR replaces Better Auth.

## Deployment

- Docker is the default packaging target.
- The database can be remote in production.
- Containers must not destroy database data on redeploy.
- Health checks should exist for API containers.
- Frontend and API can share one public domain when routed by path, for example `/` and `/api`.

## Documentation

When a project deviates from this stack, create an ADR in `docs/architecture/adr/`.
