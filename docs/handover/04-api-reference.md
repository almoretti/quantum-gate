# API Reference

## Public Endpoints (No Authentication)

### GET /health
Health check for monitoring and Docker health probes.

**Response:** `200 OK`
```json
{ "status": "ok", "service": "quantum-gate" }
```

### GET /verify
Called internally by Traefik ForwardAuth. Not meant for direct browser access.

**Headers (set by Traefik):**
- `X-Forwarded-Host` — hostname of the requested service
- `X-Forwarded-Proto` — http or https
- `X-Forwarded-URI` — original request path
- `Cookie` — session cookie (if user is authenticated)

**Responses:**
- `200 OK` — user is authenticated (or service is open). Sets `X-Auth-User` header.
- `302 Redirect` — redirects to `/auth/login?redirect={original_url}`

### GET /auth/login
Shows the Google sign-in page.

**Query params:** `redirect` (optional) — URL to return to after login

### GET /auth/google
Starts Google OAuth flow. Redirects browser to Google's consent screen.

**Query params:** `redirect` (optional) — passed through to callback

### GET /auth/callback
Google OAuth callback. Exchanges code for token, validates domain, sets cookie.

**Query params:** `code`, `state` (set by Google)

### GET /auth/logout
Clears session cookie and redirects to login page.

---

## OAuth 2.1 Authorization Server

Served under `auth.marketing.qih-tech.com`. Public clients only (no client secret). PKCE-S256 required. Code flow only.

### GET /.well-known/oauth-authorization-server
RFC 8414 authorization server metadata. Public, cacheable.

**Response:** `200 OK`
```json
{
  "issuer": "https://auth.marketing.qih-tech.com",
  "authorization_endpoint": "https://auth.marketing.qih-tech.com/oauth/authorize",
  "token_endpoint": "https://auth.marketing.qih-tech.com/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["mcp"]
}
```

### GET /oauth/authorize
Start the authorization code flow. Requires a valid `qm_session` cookie — if absent, 302s to `/auth/login?redirect=<this URL>` so the user goes through Google SSO first and returns here.

**Query params (all required unless noted):**
| Param | Value |
|-------|-------|
| `response_type` | `code` |
| `client_id` | Pre-registered (see `src/store.ts` `DEFAULT_OAUTH_CLIENTS`): `claude-desktop`, `claude-code`, `claude-web` |
| `redirect_uri` | Must match one of the client's whitelisted URIs (wildcard-aware, see below) |
| `state` | Non-empty CSRF token (opaque to QG) |
| `code_challenge` | Non-empty PKCE challenge |
| `code_challenge_method` | `S256` (only method supported) |
| `scope` | Optional. If present must equal `mcp` |

**Redirect URI matching (`isRedirectUriAllowed` in `src/store.ts`):**
- Scheme + hostname compared exactly (`*` wildcard allowed in host)
- If the pattern has no port, any candidate port matches (supports ephemeral localhost ports)
- Path + search + hash compared together; `*` in the pattern becomes regex `.+`. Forces query-string to be part of the match (prevents injection)

**Responses:**
- `302 Found` to `redirect_uri?code=<code>&state=<state>` on success. Code TTL = 60 seconds, single-use.
- `302 Found` to `/auth/login?redirect=<original>` when no `qm_session`.
- `400 Bad Request` with plain-text body on invalid params (no redirect — avoids open-redirector abuse).

### POST /oauth/token
Exchange an authorization code for an access token. Content-type `application/x-www-form-urlencoded` (JSON also accepted for debugging).

**Form body (all required):**
| Field | Value |
|-------|-------|
| `grant_type` | `authorization_code` |
| `code` | Code issued by `/oauth/authorize` |
| `redirect_uri` | Same URI used in the authorize call |
| `client_id` | Same client_id used in the authorize call |
| `code_verifier` | PKCE verifier. Checked via constant-time compare against `sha256(verifier) == code_challenge` |

**Success:** `200 OK`
```json
{
  "access_token": "<JWT HS256>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "mcp"
}
```

**Token payload:** `{ sub: email, name, aud: "mcp-analytics", iss: <SERVER_URL>, iat, exp }` — 24h lifetime. No refresh token; clients restart the flow on expiry.

**Errors:** `400 Bad Request`
```json
{ "error": "invalid_grant", "error_description": "code is invalid or expired" }
```
All failure modes (unknown code, already used, expired, client mismatch, redirect mismatch, PKCE mismatch) return the same generic `invalid_grant` — no information leak. The `oauth_code_rejected` audit log entry records the specific reason internally.

Other errors: `unsupported_grant_type` (grant_type != authorization_code), `invalid_request` (missing required field).

---

## MCP Token Bridge (CLI / advanced users)

Cookie-gated alternative to the OAuth flow, for users who want to paste a token directly into `claude_desktop_config.json`. Rate-limited under the existing `/auth/*` bucket (30/min per IP).

### GET /auth/mcp-token
HTML bridge page with a one-click "generate token" button and a pre-filled `claude_desktop_config.json` snippet (uses `MCP_SERVER_URL` env var). Requires `qm_session` — otherwise 302 to `/auth/login?redirect=/auth/mcp-token`.

### POST /auth/mcp-token
Issues an MCP token. Requires `qm_session` cookie.

**Response:** `200 OK`
```json
{
  "token": "<JWT HS256>",
  "expires_at": 1745932800,
  "mcp_server_url": "https://analytics-mcp.marketing.qih-tech.com/mcp"
}
```

Token shape is identical to the one issued by `/oauth/token` (same `aud`, same lifetime, same secret) so the downstream MCP server has a single verification path.

**Errors:** `401` JSON `{ "error": "Authentication required" }` if no session.

---

## Admin-Only Endpoints

All endpoints below require a valid `qm_session` cookie AND the user must be an admin (super admin or in the admins list).

- Non-authenticated users: `302` redirect to login (HTML) or `401` JSON for `/api/*`
- Non-admin users: styled "Access Denied" page (HTML) or `403` JSON for `/api/*`

All mutation endpoints are also protected by **CSRF origin check** — requests must originate from `auth.marketing.qih-tech.com`.

### GET /admin
Returns the admin dashboard HTML page. Non-admins see an "Access Denied" page with a link to marketing.qih-tech.com.

### GET /api/services
Lists all registered services.

**Response:** `200 OK`
```json
{
  "n8n.marketing.qih-tech.com": {
    "name": "n8n",
    "protected": true,
    "discoveredAt": "2026-03-27T13:24:56.237Z"
  },
  "kpi.marketing.qih-tech.com": {
    "name": "KPI Dashboard",
    "protected": false,
    "discoveredAt": "2026-03-27T13:25:44.775Z"
  }
}
```

### GET /api/sessions
Lists last 100 login events.

**Response:** `200 OK`
```json
[
  {
    "email": "user@quantum.media",
    "name": "User Name",
    "timestamp": "2026-03-27T13:26:07.771Z",
    "ip": "203.0.113.1"
  }
]
```

### GET /api/admins
Lists super admin and all admins.

**Response:** `200 OK`
```json
{
  "superAdmin": "alessandro.moretti@quantum.media",
  "admins": ["other.admin@quantum.media"]
}
```

### GET /api/users
Lists all users who have logged in at least once.

**Response:** `200 OK`
```json
{
  "user@quantum.media": {
    "email": "user@quantum.media",
    "name": "User Name",
    "lastLogin": "2026-04-07T12:00:00.000Z",
    "loginCount": 5
  }
}
```

### PATCH /api/services/:host
Toggle protection or rename a service.

**URL param:** `host` — the hostname (e.g., `n8n.marketing.qih-tech.com`)

**Request body (JSON):**
```json
{ "protected": false }
```
or
```json
{ "name": "New Display Name" }
```
or both.

**Response:** `200 OK` → `{ "ok": true }` or `404` if host not found.

### POST /api/services
Manually add a service.

**Request body (JSON):**
```json
{
  "host": "new-tool.marketing.qih-tech.com",
  "name": "New Tool",
  "protected": true
}
```

**Response:** `201 Created` → `{ "ok": true }`

### DELETE /api/services/:host
Remove a service from the registry. It will be re-discovered on next access.

**Response:** `200 OK` → `{ "ok": true }` or `404` if not found.

### POST /api/admins
Add a new admin.

**Request body (JSON):**
```json
{ "email": "user@quantum.media" }
```

**Response:** `201 Created` → `{ "ok": true }` or `409` if already an admin.

### DELETE /api/admins/:email
Remove an admin. Cannot remove the super admin.

**Response:** `200 OK` → `{ "ok": true }` or `403` if trying to remove super admin, or `404` if not an admin.

### GET /api/exemptions
Lists all API path exemptions (paths that bypass Quantum Gate auth).

**Response:** `200 OK`
```json
[
  {
    "host": "*",
    "pathPrefix": "/api/",
    "label": "All API paths (legacy default)",
    "createdAt": "2026-04-10T12:00:00.000Z"
  }
]
```

### POST /api/exemptions
Add an API path exemption. Host can be `*` (all hosts) or a specific hostname.

**Request body (JSON):**
```json
{
  "host": "coolify.marketing.qih-tech.com",
  "pathPrefix": "/api/v1",
  "label": "Coolify API"
}
```

**Response:** `201 Created` → `{ "ok": true }` or `409` if already exists.

### DELETE /api/exemptions
Remove an API path exemption.

**Request body (JSON):**
```json
{
  "host": "*",
  "pathPrefix": "/api/"
}
```

**Response:** `200 OK` → `{ "ok": true }` or `404` if not found.
