# Code Walkthrough

This document walks through each source file so a developer can understand, maintain, and extend the system.

## Entry Point: `src/index.ts`

The main file. Sets up the Hono app and wires all pieces together.

**Middleware order matters:**
1. `securityHeaders` — applied to ALL routes (global)
2. `/health` — public, no auth
3. `/verify` — Traefik ForwardAuth (no rate limit — called on every request)
4. `/.well-known/oauth-authorization-server` — public OAuth metadata (`setupOAuthMetadataRoute`)
5. `/oauth/*` — OAuth 2.1 authorize + token (`setupOAuthRoutes`). No rate limit distinct from defaults; PKCE + state do the heavy lifting
6. `/auth/*` — rate limited at 30/min (covers Google SSO **and** `/auth/mcp-token` bridge)
7. `/admin` and `/api/*` — rate limited + CSRF origin check on mutations

`startCodeCleanup()` from `src/oauth.ts` is invoked once at boot to run the 30 s expired-code sweeper.

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

**API path exemptions:** Instead of a hardcoded `/api/` bypass, exemptions are now managed via the admin panel and stored in `apiExemptions`. Each exemption has a `host` (or `*` for all) and a `pathPrefix`. The `isApiExempt(host, uri)` function checks at runtime. By default, all `/api/` paths are exempt for backwards compatibility.

**Host normalisation:** The `normaliseHost()` function strips `www.` prefixes so `www.cake.marketing.qih-tech.com` becomes `cake.marketing.qih-tech.com`. The `isOwnDomain()` function validates the host against `COOKIE_DOMAIN` (or `SERVER_URL` hostname as fallback) — foreign domains like `www.google-analytics.com` are rejected with 403 and never registered.

Auto-discovery: when an unknown own-domain host is seen, `registerHost()` adds it to the store with `protected: true`. This triggers a disk write (JSON persistence) but only once per new hostname. Auto-discovery is capped at 200.

## Admin: `src/admin.ts`

Single middleware function:
- `requireAdmin` — checks session, verifies admin role, stores email on Hono's per-request context via `c.set("userEmail", ...)`

All routes (both `/admin` and `/api/*`) require admin access. Non-admins see a styled "Access Denied" page (HTML routes) or get a `403` JSON response (API routes). Non-authenticated users are redirected to login (HTML) or get a `401` JSON (API).

Admin status is determined by:
```typescript
session.email === CONFIG.SUPER_ADMIN || isAdmin(session.email)
```

The super admin check is always against the env var — even if someone removes all admins from the JSON file, the super admin still has access.

The admin dashboard includes a **Users section** that shows all users who have logged in, their login count, last login time, and current role. Admins can promote/demote users directly from this table, or manually add an admin by email for users who haven't logged in yet.

## OAuth Authorization Server: `src/oauth.ts`

Implements `/oauth/authorize` and `/oauth/token` via `setupOAuthRoutes(app)`.

### In-memory code store
`authCodes` is a `Map<string, AuthCodeEntry>` scoped to the module. Each entry: `{ client_id, redirect_uri, code_challenge, email, name, expires_at, used }`. Single QG replica — no shared storage needed. `sweepExpiredCodes()` runs every 30 s via `startCodeCleanup()`.

### `GET /oauth/authorize`
1. Parse query params
2. Validate `client_id` via `getOAuthClient()` — unknown client → 400 (no redirect)
3. Validate `redirect_uri` via `isRedirectUriAllowed()` — mismatch → 400 + `oauth_redirect_uri_rejected` audit
4. Validate `response_type=code`, `state`, `code_challenge`, `code_challenge_method=S256`, `scope∈{∅,"mcp"}`
5. `parseSession(c)` — no cookie → 302 to `/auth/login?redirect=<this URL>`
6. Mint 32-byte random code, store with 60 s TTL
7. 302 to `redirect_uri?code=<code>&state=<state>`

### `POST /oauth/token`
1. Parse form body (`grant_type`, `code`, `redirect_uri`, `client_id`, `code_verifier`)
2. Require `grant_type=authorization_code` (else `unsupported_grant_type`)
3. Require all four fields present (else `invalid_request`)
4. Look up code in `authCodes`. Every failure path (unknown / used / expired / client mismatch / redirect mismatch / PKCE mismatch) returns the same `invalid_grant` body. Internal reason is audit-logged
5. Mark `entry.used = true` **before** signing — a thrown signer cannot yield a reusable code
6. `signAccessToken()` — HS256 JWT, `{sub, name, aud: "mcp-analytics", iss: SERVER_URL, iat, exp}`, 24 h lifetime
7. Return `{access_token, token_type: "Bearer", expires_in, scope: "mcp"}`

### `verifyPkceS256(verifier, challenge)`
Constant-time compare (`crypto.timingSafeEqual`) between `base64url(sha256(verifier))` and the stored challenge. Length-prefix check guards against `timingSafeEqual`'s equal-length requirement.

## OAuth Metadata: `src/oauth-metadata.ts`

One route: `setupOAuthMetadataRoute(app)` → `GET /.well-known/oauth-authorization-server`. Returns a static JSON document built from `CONFIG.SERVER_URL`. Advertised surface is deliberately minimal (code grant only, S256 only, public clients, single `mcp` scope). Cacheable and public.

## MCP Token Bridge: `src/mcp-token.ts`

Cookie-gated "paste the token" path for CLI users. Two routes under `/auth/mcp-token`:

- `GET` — serves `mcpTokenPageHtml(email, MCP_SERVER_URL)`. No session → 302 to `/auth/login`
- `POST` — signs an MCP token via `signMcpToken()` and returns `{token, expires_at, mcp_server_url}`. No session → 401 JSON

Tokens issued here are **byte-compatible** with the ones from `/oauth/token`: same secret (`JWT_SECRET`), same audience (`MCP_TOKEN_AUDIENCE = "mcp-analytics"`), same 24 h TTL (`MCP_TOKEN_TTL_SECONDS`). The MCP server has a single verify path.

## Bridge Page View: `src/views/mcp-token.ts`

Returns HTML for the `/auth/mcp-token` page. The page:
- Shows the signed-in user's email
- Generate-token button hits `POST /auth/mcp-token` and displays the returned JWT
- Pre-fills a copy-paste `claude_desktop_config.json` snippet using `MCP_SERVER_URL`

## OAuth Tests: `src/oauth.test.ts`, `src/mcp-token.test.ts`

- `oauth.test.ts` (24 cases): metadata shape, authorize validation (client, redirect_uri wildcards, response_type, state, PKCE method/presence, scope), session bounce, code mint + 302, token flow success + every failure path, single-use + expiry, PKCE constant-time compare behaviour
- `mcp-token.test.ts` (15 cases): HTML page gating, POST token issuance shape, session requirement, audit log emission

Codes are flushed between tests via `authCodes.clear()` — hence the module exports the Map.

## Data Store: `src/store.ts`

File-based JSON persistence. Loaded once at startup, kept in memory, written to disk on every change.

### Atomic Writes
The `persist()` function writes to a `.tmp` file first, then renames. This prevents data corruption if the process crashes mid-write. The `fs.renameSync()` operation is atomic on most filesystems.

### Data Structure
```typescript
{
  services: Record<hostname, { name, protected, discoveredAt }>,
  admins: string[],
  users: Record<email, { email, name, lastLogin, loginCount }>,
  recentLogins: Array<{ email, name, timestamp, ip }>,
  apiExemptions: Array<{ host, pathPrefix, label, createdAt }>,
  oauthClients: Record<client_id, { client_id, name, redirect_uris: string[] }>
}
```

The `users` map is updated on every login (upsert) and provides the data for the admin dashboard's Users section. Login history is capped at 100 entries (oldest are dropped). The `load()` function uses spread with defaults to handle missing fields when migrating from older data files.

### OAuth additions

- **`OAuthClient`** — exported interface: `{ client_id, name, redirect_uris[] }`. Each redirect_uri supports a single `*` wildcard (prefix+suffix match)
- **`DEFAULT_OAUTH_CLIENTS`** — seeded into `oauthClients` on first boot (when the map is empty): `claude-desktop`, `claude-code` (both `http://localhost/*` + `http://127.0.0.1/*`), `claude-web` (`https://claude.ai/api/organizations/*/mcp/oauth/*`)
- **`REQUIRED_EXEMPTIONS`** — re-applied on every boot (idempotent), unlike `DEFAULT_EXEMPTIONS` which is only seeded when the list is empty. Ensures already-deployed instances pick up newly-added required bypass rules. Currently covers `analytics-mcp.marketing.qih-tech.com` at `/mcp` and `/.well-known/`
- **`getOAuthClient(clientId)`** / **`getOAuthClients()`** — lookup helpers
- **`isRedirectUriAllowed(client, uri)`** — wildcard matcher used by `/oauth/authorize`. URL-parse both sides; scheme + hostname exact (host allows `*`); port — if pattern has no port, any port matches (ephemeral localhost); path+search+hash compared together with `*` -> `.+` regex. Query string is part of the match to prevent injection

## Security: `src/security.ts`

### `securityHeaders` Middleware
Sets all security headers. The CSP (Content-Security-Policy) allows inline scripts/styles because the admin panel uses inline `<script>` and `<style>` tags. If you move to external scripts, tighten this to remove `'unsafe-inline'`.

### `originCheck` Middleware
Only checks POST/PATCH/DELETE methods. Compares the `Origin` (or `Referer`) header against `CONFIG.SERVER_URL`. Requests with **neither** header are blocked. This prevents a malicious website from making API calls using a user's session cookie.

### `rateLimit(max, windowMs)` Factory
Returns a middleware. Each unique `max/windowMs` combination gets its own Map. IPs are extracted from `X-Real-IP` first (set by trusted proxies), falling back to `X-Forwarded-For`. Cleanup runs every 5 minutes.

## Views: `src/views/login.ts` and `src/views/admin.ts`

Both are functions that return HTML strings. No template engine — just template literals.

The admin view only takes the user's email (all viewers are admins). It renders the full dashboard with services management, user management (promote/demote), and login history. All data loading is done client-side via `fetch()` calls to the API.

The `esc()` function in `admin.ts` is used for HTML escaping in the server-side template — it escapes `& < > " '` (including single quotes to prevent JS string breakout in onclick attributes). The client-side `esc()` function uses DOM `textContent` plus single-quote escaping.

## Extending the System

### Adding a New API Endpoint
1. Add the route in `src/admin.ts` using the `router` (typed Hono instance)
2. Apply `requireAdmin` middleware (all admin routes use the same middleware)
3. Access the user's email via `c.get("userEmail")`
4. Add audit logging for security-relevant actions

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
