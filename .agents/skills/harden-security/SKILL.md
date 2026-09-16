---
name: harden-security
description: Use when adding or changing a boundary that handles untrusted input, authentication, authorization, secrets, file uploads, or external services. Also use when reviewing a change for security defects.
---

# Harden Security

## Context To Load

Read:

- `docs/security/hardening.md`
- `docs/security/principles.md`
- `docs/security/threat-model.md`
- `docs/architecture/authentication.md` for auth work.
- Relevant feature specification for the permissions the product requires.

## Workflow

1. List the boundaries the change touches: HTTP, environment, database, auth, files, external services, background jobs.
2. For each boundary, name what is untrusted and where it is validated.
3. Confirm authorization is enforced server-side per record, not only in navigation.
4. Confirm secrets stay server-side and out of code, logs, responses, and the client bundle.
5. Confirm errors reaching the user are sanitized and diagnostics stay in logs.
6. Add or update tests for the rejection paths, not only the accepted ones.
7. Record any residual risk that the change does not close.

## Guardrails

- Do not trust a frontend check as authorization.
- Do not build queries, paths, or commands by concatenating user input.
- Do not accept an identifier from the client without verifying the caller may act on that record.
- Do not return provider payloads, stack traces, storage paths, or secret references.
- Do not add a dependency without verifying its name, maintenance, vulnerabilities, and license.
- Do not implement custom authentication primitives when the documented provider covers the need.
- Do not silence a security finding by narrowing its test.
