# Code Walkthrough

This document walks through each source file so a developer can understand, maintain, and extend the system.

## Entry Point: `src/index.ts`

The main file. Sets up the Hono app and wires all pieces together.

**Middleware order matters:**
1. `securityHeaders` — applied to ALL routes (global)
2. `/health` — public, no auth
3. `/verify` — Traefik ForwardAuth (no rate limit — called on every request)
4. `/auth/*` — rate limited at 30/min
5. `/admin` and `/api/*` — rate limited + CSRF origin check on mutations

The server starts via `@hono/node-server`'s `serve()` function on `CONFIG.PORT`.

## Config: `src/config.ts`

Reads environment variables with fallbacks. The `env()` helper exits the process if a required variable is missing.

`validateConfig()` is called at startup and checks:
- JWT_SECRET is at least 32 characters
- Google credentials are present

Two computed properties:
- `isDev` — true when NODE_ENV is "development"
- `isSecure` — true when SERVER_URL starts with "https"

## Auth Flow: `src/auth.ts`

Four routes + one helper function.

### State Management
`pendingStates` is an in-memory Map that stores CSRF tokens during the OAuth flow. Each entry has a 5-minute TTL and includes the redirect URL. Entries are capped at 500 to prevent memory exhaustion. A cleanup interval runs every 60 seconds.

### Google OAuth Exchange
The callback handler (`GET /auth/callback`) does three HTTP calls:
1. `POST https://oauth2.googleapis.com/token` — exchanges the authorization code for an access token
2. `GET https://www.googleapis.com/oauth2/v2/userinfo` — fetches user email and name
3. Domain check — rejects non-matching domains

### Cookie Setting
Uses Hono's built-in `setCookie()`. Cookie options are conditional:
- `domain` is only set if `COOKIE_DOMAIN` is configured (empty for localhost dev)
- `secure` is only set if `SERVER_URL` is HTTPS

### `parseSession()` Helper
Used by `/verify`, `/admin`, and all `/api/*` routes. Extracts and verifies the JWT from the cookie. Returns `{ email, name }` or `null`. Uses Hono's built-in `verify()` with HS256.

## ForwardAuth: `src/verify.ts`

The most critical endpoint — called by Traefik on every single request.

**Design goal: ZERO I/O.** The services Map is in-memory. JWT verification is CPU-only. No database, no network calls. This keeps latency minimal.

The `AUTH_HOST` constant is extracted from `SERVER_URL` at module load time. This is compared against `X-Forwarded-Host` to bypass auth for the login page itself.

Auto-discovery: when an unknown host is seen, `registerHost()` adds it to the store with `protected: true`. This triggers a disk write (JSON persistence) but only once per new hostname.

## Admin: `src/admin.ts`

Two middleware functions:
- `requireAuth` — checks session, populates `currentUser`
- `requireAdminRole` — checks `currentUser.isAdmin`

**Note on the `currentUser` global:** This is a simple approach that works because Hono processes requests sequentially in Node.js. In a multi-threaded environment, this would need to be request-scoped. For this use case (low traffic admin panel), it's fine.

Admin status is determined by:
```typescript
isAdmin: session.email === CONFIG.SUPER_ADMIN || isAdmin(session.email)
```

The super admin check is always against the env var — even if someone removes all admins from the JSON file, the super admin still has access.

## Data Store: `src/store.ts`

File-based JSON persistence. Loaded once at startup, kept in memory, written to disk on every change.

### Atomic Writes
The `persist()` function writes to a `.tmp` file first, then renames. This prevents data corruption if the process crashes mid-write. The `fs.renameSync()` operation is atomic on most filesystems.

### Data Structure
```typescript
{
  services: Record<hostname, { name, protected, discoveredAt }>,
  admins: string[],
  recentLogins: Array<{ email, name, timestamp, ip }>
}
```

Login history is capped at 100 entries (oldest are dropped).

## Security: `src/security.ts`

### `securityHeaders` Middleware
Sets all security headers. The CSP (Content-Security-Policy) allows inline scripts/styles because the admin panel uses inline `<script>` and `<style>` tags. If you move to external scripts, tighten this to remove `'unsafe-inline'`.

### `originCheck` Middleware
Only checks POST/PATCH/DELETE methods. Compares the `Origin` (or `Referer`) header against `CONFIG.SERVER_URL`. This prevents a malicious website from making API calls using a user's session cookie.

### `rateLimit(max, windowMs)` Factory
Returns a middleware. Each unique `max/windowMs` combination gets its own Map. IPs are extracted from `X-Forwarded-For` (since we're behind Traefik). Cleanup runs every 5 minutes.

## Views: `src/views/login.ts` and `src/views/admin.ts`

Both are functions that return HTML strings. No template engine — just template literals.

The admin view takes `isAdmin` boolean to conditionally render edit controls. Non-admins see a read-only dashboard. All data loading is done client-side via `fetch()` calls to the API.

The `esc()` function in `admin.ts` is used for HTML escaping in the server-side template. The client-side `esc()` function uses DOM `textContent` for escaping.

## Extending the System

### Adding a New API Endpoint
1. Add the route in `src/admin.ts`
2. Use `requireAuth` for read-only, add `requireAdminRole` for mutations
3. Add audit logging for security-relevant actions

### Adding a New Config Option
1. Add to `CONFIG` object in `src/config.ts`
2. Add to `.env.example`
3. Add to Coolify env vars
4. Update this documentation

### Changing the Session Duration
Edit `COOKIE_MAX_AGE` in `src/config.ts`. Value is in seconds.

### Restricting to Specific Emails (Not Just Domain)
Add an email whitelist to the store and check in `auth.ts` callback after domain validation. The `isHostProtected()` pattern can be reused for this.

### Adding Multi-Domain Support
Currently restricted to one domain via `ALLOWED_DOMAIN`. To support multiple domains:
1. Change `ALLOWED_DOMAIN` to a comma-separated list
2. Update the domain check in `auth.ts` to use `.some()` instead of `.endsWith()`
