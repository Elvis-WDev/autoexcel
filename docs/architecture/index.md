# Architecture Index

## Read Order

1. `ARCHITECTURE.md`
2. `docs/architecture/stack.md`
3. `docs/architecture/bootstrap.md`
4. `docs/architecture/backend.md`
5. `docs/architecture/frontend.md`
6. Frontend pattern required by the task:
   - `docs/architecture/component-system.md`
   - `docs/architecture/interface-design.md`
   - `docs/architecture/data-tables.md`
   - `docs/architecture/forms-and-workflows.md`
   - `docs/architecture/feedback-and-states.md`
   - `docs/architecture/navigation-responsive.md`
7. `docs/architecture/authentication.md`
8. `docs/architecture/database.md`
9. `docs/architecture/integrations.md`
10. `docs/architecture/deployment.md`
11. `docs/architecture/adr/`

## Architecture Rules

- Document boundaries explicitly.
- Keep dependency direction enforceable.
- Prefer tests or lint rules for critical constraints.
- Record irreversible or costly decisions as ADRs.
- Use the default stack unless an ADR explains why a project deviates.
