# Backend Instructions

Apply to backend files.

- Keep domain logic framework-free.
- Define application ports before adding infrastructure adapters.
- Validate all external input at the boundary.
- Keep secrets server-side.
- Update API documentation when routes or response shapes change.
- Enforce authorization server-side per record, not only per route.
- Paginate every list endpoint and never load a relation inside a loop.
- Measure before optimizing, and revert an optimization that does not beat its baseline.
