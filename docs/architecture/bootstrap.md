# New Application Bootstrap

Use this guide when starting a new application from this context.

## 1. Create The Repository

Copy the context files first:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `.agents/skills/`
- `docs/`
- `.github/`
- `.codex/README.md`

Then initialize the application code using the selected stack.

## 2. Package Manager

Enable Corepack and use pnpm only:

```bash
corepack enable
corepack pnpm install
```

## 3. Backend Baseline

Create a TypeScript Express API with:

- Environment validation through Zod.
- Better Auth configured before protected routes.
- Prisma connected to PostgreSQL.
- Layered folders for domain, use cases, infrastructure, and HTTP.
- Health endpoint.
- Global error handler.
- Typed external API clients using Axios when needed.

## 4. Frontend Baseline

Create a Next.js frontend with:

- Tailwind CSS.
- shadcn/ui.
- lucide-react icons.
- React Hook Form.
- Zod validation.
- Typed API helper.
- Auth-aware app shell.

## 5. Database Baseline

Use PostgreSQL and Prisma migrations:

- Define `DATABASE_URL`.
- Run initial migration.
- Generate Prisma Client.
- Document schema changes in `docs/generated/`.

## 6. Auth Baseline

Use Better Auth:

- Configure secret and trusted origins.
- Seed or create the first admin user only when needed.
- Protect API routes with auth middleware.
- Keep registration disabled unless the product requires it.

## 7. Deployment Baseline

Prepare Docker files when code exists:

- API container.
- Frontend container.
- Remote PostgreSQL in production.
- Health checks.
- No database data deletion on redeploy.

## 8. Documentation Baseline

Before implementing features:

- Complete `docs/product/overview.md`.
- Create feature specs under `docs/product/features/`.
- Update `ARCHITECTURE.md` for project-specific boundaries.
- Create ADRs for deviations from this stack.
