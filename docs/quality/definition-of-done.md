# Definition Of Done

A change is done only when:

- The implementation matches the relevant product specification.
- Acceptance criteria are satisfied or explicitly updated.
- Verification commands pass.
- API, database, architecture, security, or user workflow docs are updated when behavior changes.
- New dependencies are justified, and upgrades were reviewed one package at a time with the lockfile diff.
- New boundaries validate untrusted input, and authorization is enforced server-side per record.
- Performance-sensitive changes carry before and after numbers; neutral results were reverted.
- Generated files are produced by scripts or documented sources, not manually edited.
- No secrets are committed.
- Work is split into coherent commits, each one verified and reviewable on its own.
- Commit subjects describe what changed, and bodies stay short or absent.
- pnpm/Corepack commands were used.
- Stack decisions remain aligned with `docs/architecture/stack.md` or an ADR explains the deviation.

For backend work:

- Use cases do not import infrastructure.
- Domain code remains framework-free.
- HTTP validation and error handling are explicit.
- Protected endpoints use documented auth middleware.
- Better Auth owns auth behavior.
- Prisma migrations exist for schema changes.
- PostgreSQL behavior is considered for production.

For frontend work:

- Loading, empty, success, and error states are handled.
- Forms use validation.
- Large lists are paginated or virtualized.
- Text and controls fit on supported viewports.
- shadcn/ui conventions are followed.
- Authenticated and unauthenticated states are handled.
- Shared patterns are used for tables, pagination, filters, forms, dialogs, toasts, tooltips, date inputs, and navigation.
- Every module's list, create, edit, detail, and removal paths work against the real backend.
- Sections with their own records, actions, or permissions are sidebar submodules, not tabs.
- Every mutation reports pending, success, and error through the shared feedback helper.
- Destructive actions follow the confirmation ladder in `docs/architecture/forms-and-workflows.md`.
- No raw IDs, storage paths, provider internals, auth implementation names, secret references, or backend-only metadata are exposed without a documented user need.
- Module headings, summaries, cards, helper copy, and controls are not duplicated.
- Action feedback is semantic and transient; persistent page banners are reserved for states that remain relevant after the action ends.
- Row actions are permission-aware, state-aware, labeled by accessible tooltips, and usable with keyboard and touch.
- Light/dark themes and desktop/mobile layouts pass `docs/quality/frontend-checklist.md`.
