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
