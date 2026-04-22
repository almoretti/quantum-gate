# Traefik Integration

## How Quantum Gate Connects to Traefik

Traefik is the reverse proxy managed by Coolify. It handles all incoming HTTPS traffic and routes it to the correct backend service. Quantum Gate integrates via Traefik's **ForwardAuth** mechanism.

## The Two Configuration Points

### 1. Traefik Entrypoint Middleware (Global)

**Location**: Coolify → Servers → localhost → Proxy → Compose file

In the Traefik proxy compose, this line in the `command` section enables Quantum Gate for ALL HTTPS traffic:

```yaml
- '--entrypoints.https.http.middlewares=quantum-gate-auth@file'
```

This means: "Before routing any HTTPS request to any backend, run it through the `quantum-gate-auth` middleware first."

**Important**: If you remove this line and restart the proxy, ALL services become publicly accessible without authentication.

### 2. ForwardAuth Middleware Definition

**Location**: Coolify → Servers → localhost → Proxy → Dynamic Configurations → `authentik.yaml`

```yaml
http:
  middlewares:
    quantum-gate-auth:
      forwardAuth:
        address: http://host.docker.internal:3099/verify
        trustForwardHeader: true
        authResponseHeaders:
          - X-Auth-User
```

**What each field means:**

| Field | Value | Purpose |
|-------|-------|---------|
| `address` | `http://host.docker.internal:3099/verify` | Internal URL where Traefik sends the auth check. `host.docker.internal` is the Docker host, port `3099` is mapped to Quantum Gate's port `3000` |
| `trustForwardHeader` | `true` | Traefik passes `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-URI` headers so Quantum Gate knows which service was requested |
| `authResponseHeaders` | `X-Auth-User` | When auth succeeds, this header (containing the user's email) is passed to the backend service |

### Why `host.docker.internal` Instead of a Hostname?

Traefik and Quantum Gate are in Docker containers. We need Traefik to reach Quantum Gate **without going through itself** (which would cause an infinite loop). `host.docker.internal` resolves to the Docker host machine, and port `3099` is mapped to Quantum Gate's container port `3000`.

### Port Mapping

Quantum Gate has a **port mapping** configured in Coolify:
```
3099:3000  (host:container)
```

This means:
- Quantum Gate listens on port `3000` inside its container
- Port `3099` on the host forwards to it
- Traefik uses `host.docker.internal:3099` to reach it

## The Verify Flow

When a request comes in:

```
1. Browser → https://n8n.marketing.qih-tech.com/workflows
2. Traefik receives request
3. Traefik calls: GET http://host.docker.internal:3099/verify
   Headers:
     X-Forwarded-Host: n8n.marketing.qih-tech.com
     X-Forwarded-Proto: https
     X-Forwarded-URI: /workflows
     Cookie: qm_session=eyJ... (if user has one)
4. Quantum Gate /verify logic:
   a. Strip www. prefix (www.cake.* → cake.*) and lowercase the host
   b. Is host "auth.marketing.qih-tech.com"? → 200 OK (bypass)
   c. Is this host+path in the API exemptions list? → 200 OK (managed via admin panel)
   d. Is host registered as "open"? → 200 OK (no auth needed)
   e. Is host unknown?
      - Not under *.marketing.qih-tech.com? → 403 Forbidden (foreign domain rejected)
      - Under our domain? → Register as protected (up to 200 auto-discoveries), continue to step f
   f. Is qm_session cookie valid? → 200 OK + X-Auth-User header
   g. No valid cookie? → 302 redirect to login page
5. Traefik acts on response:
   - 200 → Forward request to backend service
   - 302 → Send redirect to browser
```

## Disabling Auth for a Specific Service

### Option A: Use the Admin Panel
1. Go to https://auth.marketing.qih-tech.com/admin
2. Find the service in the table
3. Click "Make Open"

### Option B: Temporarily Disable All Auth
1. Go to Coolify → Servers → localhost → Proxy
2. Edit the Traefik compose
3. Remove or comment out: `'--entrypoints.https.http.middlewares=quantum-gate-auth@file'`
4. Restart the proxy
5. All services are now publicly accessible

**To re-enable**: Add the line back and restart the proxy.

## OAuth 2.1 / MCP Bridge Endpoints

`/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`, and `/auth/mcp-token` are **regular Hono routes served by Quantum Gate itself** — they are NOT protected by the Traefik ForwardAuth middleware (Traefik only calls `/verify`, which is a different route).

Incoming requests to these endpoints hit `auth.marketing.qih-tech.com` directly:
- `/.well-known/oauth-authorization-server` and `/oauth/*` are public (PKCE + state is the CSRF barrier for `/oauth/authorize`; PKCE verifier is the barrier for `/oauth/token`)
- `/auth/mcp-token` (GET + POST) requires a valid `qm_session` cookie — so Traefik's ForwardAuth bypass for `auth.marketing.qih-tech.com` does not apply to it; the route enforces the session check in-process

**Downstream MCP** (`analytics-mcp.marketing.qih-tech.com`) also passes through Traefik, but its `/mcp` and `/.well-known/` paths are listed in `REQUIRED_EXEMPTIONS` (see `src/store.ts`) so ForwardAuth returns 200 without a `qm_session`. The MCP server then does its own Bearer-token verification.

## Adding Auth to a New Service

No action needed. When you deploy a new service on `*.marketing.qih-tech.com` via Coolify, Quantum Gate automatically:
1. Detects it on first access
2. Registers it as protected
3. Shows it in the admin panel

## Troubleshooting Traefik Issues

### All services return 500
- Quantum Gate is likely down or unreachable
- Check if the app is running in Coolify
- Check the port mapping (3099:3000) is still configured
- Temporarily remove the entrypoint middleware line to restore access

### Auth loop (keeps redirecting to login)
- The session cookie might not be set correctly
- Check `COOKIE_DOMAIN` is `.marketing.qih-tech.com` (with leading dot)
- Check the browser's cookies in DevTools

### Specific service not protected
- Check the admin panel — it might be set to "open"
- The service might not have been accessed yet (auto-discovery happens on first request)

### "No available server" (503)
- The backend service itself is down, not a Quantum Gate issue
- Check the service's status in Coolify
