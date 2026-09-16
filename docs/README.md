# Documentation Index

Use this directory as the project knowledge base.

## Sections

- `product/`: what the system does and why.
- `architecture/`: how the system is built and constrained.
- `plans/`: current and completed implementation plans.
- `quality/`: testing, review, version control, performance, observability, and done criteria.
- `security/`: security principles, hardening controls, and threat model.
- `generated/`: generated or derived references.

## Maintenance Rule

When code changes behavior, update the relevant document in the same pull request.

For frontend work, start with `architecture/frontend.md`, open only the relevant
interface-pattern documents, and finish with `quality/frontend-checklist.md`.
