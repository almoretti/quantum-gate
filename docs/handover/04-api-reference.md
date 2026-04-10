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
