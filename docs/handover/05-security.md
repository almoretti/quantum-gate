# Security Model

## Authentication Layer

### Google OAuth 2.0
- Users authenticate via Google's OAuth 2.0 flow
- No passwords are stored or managed by Quantum Gate
- Only accounts from the configured domain (`@quantum.media`) are accepted
- Google's `hd` parameter forces the domain hint in the consent screen
- Server-side validation double-checks the email domain after login

### Session Management
- Sessions are **stateless JWT tokens** stored in a cookie
- The JWT contains: email, name, issued-at timestamp, expiration
- Signed with HS256 using the `JWT_SECRET`
- 24-hour expiration — users must re-authenticate daily
- No server-side session store — if the JWT is valid and not expired, the user is authenticated

### Cookie Security

| Attribute | Value | Protection |
|-----------|-------|------------|
| HttpOnly | true | JavaScript cannot access the cookie (XSS protection) |
| Secure | true | Cookie only sent over HTTPS |
| SameSite | Lax | Blocks cross-site POST requests with cookie (CSRF protection) |
| Domain | `.marketing.qih-tech.com` | Shared across subdomains but not other domains |

## CSRF Protection

### Origin/Referer Check
All mutation API requests (POST, PATCH, DELETE) are checked:
1. The `Origin` header must match the `SERVER_URL`
2. If no `Origin`, the `Referer` header is checked
3. If **neither** header is present, the request is blocked (prevents CSRF via header-stripping techniques)
4. Mismatched origins are blocked with 403 and logged

This prevents malicious websites from making API calls using the user's session.

### OAuth State Parameter
The Google OAuth flow uses a random state token:
- Generated with `crypto.randomBytes(16)`
- Stored in-memory with 5-minute expiration
- Validated on callback to prevent CSRF on the login flow
- One-time use — deleted after validation

### Redirect Validation
After OAuth login, the redirect URL is validated before use:
- Relative paths (`/dashboard`) are allowed
- Protocol-relative URLs (`//evil.com`) are blocked
- Absolute URLs must match the `SERVER_URL` hostname or the `COOKIE_DOMAIN` (including the bare domain and all subdomains)
- External URLs, `javascript:`, and `data:` URIs are rejected — users are redirected to `/` instead

### API Path Exemptions
Certain API paths bypass Quantum Gate auth (for services with their own auth like bearer tokens). These are managed from the admin panel under **API Exemptions**. Each exemption has a host (`*` for all hosts, or a specific hostname) and a path prefix (e.g., `/api/`). By default, all `/api/` paths are exempt for backwards compatibility. Admins can tighten this per-service.

### Admin Email Validation
Only `@quantum.media` email addresses can be added as admins. This prevents accidental or malicious promotion of external accounts.

### Host Auto-Discovery
- Only hosts under `*.marketing.qih-tech.com` are auto-discovered. Foreign domains (e.g., `www.google-analytics.com`) are rejected with 403.
- `www.` prefixes are stripped automatically — `www.cake.marketing.qih-tech.com` resolves to `cake.marketing.qih-tech.com` (no duplicates).
- Capped at 200 auto-discovered entries to prevent store flooding via crafted `X-Forwarded-Host` headers.

## OAuth 2.1 Provider Security

QG acts as an OAuth 2.1 authorization server for downstream MCP consumers. Hardening is defensive-by-default.

### PKCE (mandatory, S256 only)
- `code_challenge_method=S256` is the only accepted method — `plain` is rejected at `/oauth/authorize`
- PKCE verifier is checked at `/oauth/token` with `crypto.timingSafeEqual` (constant-time compare) — prevents verifier-probing via response-time analysis
- S256 is RFC 7636: `challenge = base64url(sha256(verifier))`, no padding

### Single-Use Authorization Codes
- 32 random bytes, base64url-encoded (`crypto.randomBytes(32)`)
- TTL = 60 seconds (`AUTH_CODE_TTL_SECONDS` in `src/oauth.ts`)
- Marked `used = true` **before** the token is signed — even if signing throws, the code cannot be replayed
- In-memory Map, swept every 30 s by `sweepExpiredCodes()`. Single QG replica, so no shared store needed

### Generic `invalid_grant` on `/oauth/token`
All failure reasons (unknown code, already used, expired, client_id mismatch, redirect_uri mismatch, PKCE mismatch) return the same `invalid_grant` / `"code is invalid or expired"` body. The specific reason is emitted to the audit log (`oauth_code_rejected`) but never to the caller.

### State / CSRF on the Authorize Endpoint
- `state` parameter is required and must be non-empty. QG treats it as opaque and echoes it back verbatim in the success redirect
- Missing `state` returns `400` without redirect (avoids bouncing the user to an unvetted URL)

### Pre-registered Public Clients
- No dynamic client registration. Clients are seeded in `DEFAULT_OAUTH_CLIENTS` (`src/store.ts`): `claude-desktop`, `claude-code`, `claude-web`
- No client secret (`token_endpoint_auth_methods_supported=["none"]`) — PKCE is the replacement for client authentication per OAuth 2.1

### Wildcard Redirect URI Matching
Implemented by `isRedirectUriAllowed()` in `src/store.ts`:
- Scheme + hostname must match exactly (host allows a single `*` wildcard for Claude.ai's per-org callback path)
- If the pattern has no port, any candidate port is accepted — supports Claude Desktop / Claude Code binding ephemeral localhost ports
- Path + search + hash compared together with `*` -> `.+` regex. **Query string is part of the match** — prevents `?next=//evil.com`-style injection

### Error Handling Before vs After `redirect_uri` is Trusted
- Errors detected BEFORE `redirect_uri` is validated (missing client_id, unknown client_id, missing/invalid redirect_uri) return `400` plain text — never bounce the user to an unvetted URL
- Errors AFTER (missing state, bad PKCE method, unsupported response_type) also return `400` rather than redirecting, to reduce open-redirector exposure

### Token Signing — Shared HS256 (Current Limitation)
- Access tokens are signed HS256 with `JWT_SECRET`
- The downstream MCP server (`analytics-mcp`) verifies against the same secret — this is a **shared-secret bridge**, not public-key verification
- Consequence: anyone with read access to QG's env vars can forge MCP tokens. Acceptable while there is a single MCP consumer under the same deployment umbrella
- **Upgrade path when a second MCP consumer appears**: switch signing to RS256, expose a JWKS endpoint at `/.well-known/jwks.json`, have consumers verify via public key. Metadata document at `/.well-known/oauth-authorization-server` would then advertise `jwks_uri`

### REQUIRED_EXEMPTIONS on Every Boot
`src/store.ts` defines `REQUIRED_EXEMPTIONS` — applied to `apiExemptions` on every startup (idempotent). Covers downstream paths that must bypass QG's ForwardAuth:

| Host | Path prefix | Why |
|------|-------------|-----|
| `analytics-mcp.marketing.qih-tech.com` | `/mcp` | MCP server enforces its own Bearer auth |
| `analytics-mcp.marketing.qih-tech.com` | `/.well-known/` | OAuth protected-resource discovery must be publicly fetchable |

`DEFAULT_EXEMPTIONS` is only seeded when the list is empty — already-deployed instances would never pick up new entries added after their first boot. `REQUIRED_EXEMPTIONS` plugs this gap: any missing required entry is inserted on startup.

## HTTP Security Headers

Applied to every response:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | `default-src 'self'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'` | Restricts what the browser can load — prevents XSS via injected scripts |
| X-Frame-Options | DENY | Prevents clickjacking (no iframe embedding) |
| X-Content-Type-Options | nosniff | Prevents MIME-type confusion attacks |
| X-XSS-Protection | 1; mode=block | Legacy browser XSS filter |
| Referrer-Policy | strict-origin-when-cross-origin | Limits referrer leakage |
| Cache-Control | no-store | Prevents caching of authenticated responses |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | Forces HTTPS for 1 year |

## Rate Limiting

Per-IP rate limits prevent brute force and abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/*` | 30 requests | 60 seconds |
| `/admin` | 30 requests | 60 seconds |
| `/api/*` | 60 requests | 60 seconds |
| `/verify` | **No limit** | — (Traefik calls this on every request) |
| `/health` | **No limit** | — |

When exceeded, returns `429 Too Many Requests`.

## Authorization (RBAC)

Three levels:

| Level | Who | Can do |
|-------|-----|--------|
| Unauthenticated | Anyone | See login page, trigger Google OAuth |
| Authenticated | Any @quantum.media user | Access all protected services. Cannot access `/admin` or `/api/*` (gets "Access Denied" page or 403 JSON) |
| Admin | Super admin + promoted admins | Full admin panel: manage services, users, protection toggles, view login history |

The super admin (set via `SUPER_ADMIN` env var) cannot be demoted.

Admin role is stored per-request on Hono's context (not a shared variable) to prevent race conditions with concurrent requests.

## Audit Logging

All security-relevant events are logged as JSON to stdout (captured by Docker/Coolify logs):

```json
{"timestamp":"2026-03-27T13:26:07.771Z","event":"auth_success","email":"user@quantum.media"}
```

### Logged Events

| Event | When |
|-------|------|
| `server_started` | Application starts |
| `host_discovered` | New subdomain accessed for the first time |
| `auth_success` | User successfully authenticated |
| `auth_domain_rejected` | User from wrong domain tried to log in |
| `auth_token_exchange_failed` | Google token exchange failed |
| `auth_userinfo_failed` | Couldn't fetch user info from Google |
| `auth_callback_error` | Unexpected error during auth |
| `csrf_blocked` | CSRF protection triggered on API call |
| `service_protection_changed` | Admin toggled a service's protection |
| `service_added` | Admin manually added a service |
| `service_removed` | Admin removed a service |
| `admin_added` | Admin promoted a user |
| `admin_removed` | Admin demoted a user |
| `api_exemption_added` | Admin added an API path exemption |
| `api_exemption_removed` | Admin removed an API path exemption |
| `host_discovery_capped` | Auto-discovery limit reached (200 hosts) |
| `oauth_redirect_uri_rejected` | `/oauth/authorize` called with redirect_uri not whitelisted for the client |
| `oauth_code_issued` | `/oauth/authorize` minted an authorization code |
| `oauth_code_rejected` | `/oauth/token` rejected a code (includes internal reason: unknown/used/expired/client_mismatch/redirect_mismatch/pkce_mismatch) |
| `oauth_token_issued` | `/oauth/token` returned an access token |
| `mcp_token_issued` | `/auth/mcp-token` bridge issued a token |

### Viewing Logs

In Coolify: Go to Quantum Gate app → Logs tab

Or via CLI:
```bash
coolify app logs {quantum-gate-uuid} -n 50
```

## Docker Security

- Runs as **non-root user** (`app`) inside the container
- Only port 3000 is exposed
- Docker socket is NOT mounted (unlike some other tools)
- Data directory is owned by the `app` user

## What Would an Attacker Need?

| To access protected services | Compromise a @quantum.media Google account |
|------------------------------|---------------------------------------------|
| To change admin settings | Compromise an admin's Google account |
| To forge session cookies | Know the JWT_SECRET (64-char hex string) |
| To bypass auth entirely | Remove the Traefik entrypoint middleware line (requires server access) |
| To access exempt `/api/*` paths | These paths bypass Quantum Gate auth (managed via admin panel). Backend services must implement their own auth (e.g., bearer tokens) |
| To access the data file | SSH access to the VPS |

## Rotating the JWT Secret

If you suspect the secret has been leaked:

1. Generate new secret: `openssl rand -hex 32`
2. Update `JWT_SECRET` in Coolify env vars
3. Redeploy Quantum Gate
4. All existing sessions are immediately invalidated
5. Users simply re-authenticate via Google
