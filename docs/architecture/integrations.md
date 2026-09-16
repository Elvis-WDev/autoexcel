# Integrations

## External Services

| Service       | Purpose  | Auth    | Owner   |
| ------------- | -------- | ------- | ------- |
| `{{SERVICE}}` | Purpose. | Method. | Module. |

## Integration Rules

- Tokens stay server-side.
- Use typed payloads at boundaries.
- Normalize provider errors before exposing them internally.
- Avoid provider names in user-facing UI unless necessary.
- Document rate limits and usage gates.
- Use Axios for server-side external API calls.
- Do not call external provider APIs directly from the browser when tokens are required.
- Add runtime timeout configuration.
- Add backoff, queueing, or persisted jobs for bulk provider calls.

## Provider Template

### `{{PROVIDER_NAME}}`

- Base URL:
- Docs:
- Auth:
- Timeout:
- Rate limit:
- Usage endpoint:
- Internal route prefix:
- Error behavior:

## Usage / Quota Gates

When a provider exposes usage or quota endpoints:

- Query usage before starting bulk jobs.
- Block jobs when quota is exhausted.
- Respect provider requests-per-minute limits.
- Surface user-friendly availability state in the UI.
- Keep raw provider tokens and provider internals out of user-facing text unless needed.
