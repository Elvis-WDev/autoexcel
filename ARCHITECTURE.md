# Architecture Map

## System Style

Default architecture:

- Modular application with a TypeScript Express REST API and a TypeScript Next.js frontend.
- PostgreSQL is the primary database.
- Prisma owns database access and migrations.
- Better Auth owns authentication.
- External integrations are isolated behind typed infrastructure clients.
- Background jobs are persisted when they must survive page refreshes or server restarts.

## Main Components

- `backend/` or `src/`: Express API, application use cases, infrastructure adapters, auth, jobs, persistence.
- `frontend/`: Next.js app, UI components, forms, charts, client-side state.
- `docs/product/`: product specifications and domain knowledge.
- `docs/architecture/`: technical decisions and boundaries.
- `docs/plans/`: active and completed implementation plans.

## Dependency Direction

Define the allowed dependency flow.

Example:

```text
domain -> application/use-cases -> infrastructure
```

Rules:

- Domain must not depend on frameworks or databases.
- Application logic depends on ports/interfaces, not concrete infrastructure.
- Infrastructure implements ports and owns external tools.
- UI code should not know server-side secrets.

## Boundaries

Document the major boundaries:

- Authentication boundary.
- HTTP/API boundary.
- Database boundary.
- External-service boundary.
- Background-job boundary.
- Frontend/client boundary.

## Detailed Documents

- Architecture index: `docs/architecture/index.md`
- Stack baseline: `docs/architecture/stack.md`
- Bootstrap guide: `docs/architecture/bootstrap.md`
- Backend: `docs/architecture/backend.md`
- Frontend: `docs/architecture/frontend.md`
- Shared component contracts: `docs/architecture/component-system.md`
- Interface design: `docs/architecture/interface-design.md`
- Data tables: `docs/architecture/data-tables.md`
- Forms and workflows: `docs/architecture/forms-and-workflows.md`
- Feedback and states: `docs/architecture/feedback-and-states.md`
- Navigation and responsive behavior: `docs/architecture/navigation-responsive.md`
- Authentication: `docs/architecture/authentication.md`
- Database: `docs/architecture/database.md`
- Integrations: `docs/architecture/integrations.md`
- Deployment: `docs/architecture/deployment.md`
- ADRs: `docs/architecture/adr/`
