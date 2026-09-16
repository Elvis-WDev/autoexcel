# Threat Model

## Assets

- User data.
- Auth sessions.
- Database credentials.
- External provider tokens.
- Generated files and exports.

## Trust Boundaries

- Browser to API.
- API to database.
- API to external provider.
- Background job runner to database.
- CI/deployment to production environment.

## Threats

| Threat                       | Impact               | Mitigation                                      |
| ---------------------------- | -------------------- | ----------------------------------------------- |
| Token leakage                | Provider abuse       | Keep tokens server-side and out of logs.        |
| Unauthorized data access     | Privacy breach       | Enforce auth middleware and permission checks.  |
| Unvalidated bulk input       | Data corruption      | Validate, chunk, and report progress.           |
| Hand-rolled authentication   | Account compromise   | Use Better Auth and documented auth middleware. |
| Overprivileged database user | Production data loss | Reduce privileges after migrations.             |
| External outage              | Workflow failure     | Normalize errors and expose retry-safe states.  |
