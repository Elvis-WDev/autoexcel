# Authentication Architecture

## Default

Use Better Auth.

Better Auth owns:

- User registration when enabled.
- Sign-in and sign-out.
- Password hashing.
- Session persistence.
- Session cookies.
- Auth database tables.
- Auth route handlers.

## Application Rules

- Public registration is disabled unless the product specification requires it.
- Protected REST routes must use an auth middleware.
- The frontend should call backend auth endpoints rather than handling credentials manually.
- Session cookies should be HTTP-only.
- Password changes and profile changes should go through authenticated routes.
- Logout should invalidate the server session and clear client-side cached user state.

## Initial Admin User

For internal tools, a first user can be seeded from environment variables:

```text
INITIAL_USER_EMAIL=admin@example.com
INITIAL_USER_PASSWORD=replace-with-secure-password
```

Rules:

- Never commit real credentials.
- Validate password length at startup.
- Do not expose initial credentials in frontend code.

## Frontend UX

- Show only login when public registration is disabled.
- Communicate invalid credentials clearly.
- Do not leave users on a blank screen during auth checks.
- Redirect authenticated users to the application shell.

## Security

- Keep `BETTER_AUTH_SECRET` server-side.
- Set production cookie and origin configuration explicitly.
- CORS must match the deployed frontend origin.
- Do not log passwords, tokens, cookies, or full auth headers.
