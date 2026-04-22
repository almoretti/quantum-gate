# Quantum Gate — System Overview

## What Is This?

Quantum Gate is a lightweight authentication gateway that protects all internal services running on `*.marketing.qih-tech.com`. It sits between the internet and your services, requiring users to sign in with their Google Workspace account before accessing any tool.

It plays **three distinct roles**:

1. **Google-OAuth consumer** — authenticates users against `@quantum.media` Google Workspace, issues a `qm_session` cookie.
2. **Traefik ForwardAuth provider** — `/verify` endpoint called on every HTTPS request to decide 200 / 302 / 403.
3. **OAuth 2.1 authorization server** — issues short-lived Bearer JWTs to Claude Desktop / Claude.ai / Claude Code so they can call downstream MCP servers (e.g. `analytics-mcp.marketing.qih-tech.com`). PKCE-S256 only, code flow only, public clients only.

## How It Works (Simple Version)

```
User visits n8n.marketing.qih-tech.com
    ↓
Traefik (reverse proxy) intercepts the request
    ↓
Traefik asks Quantum Gate: "Is this user authenticated?"
    ↓
No cookie? → User gets redirected to Google Sign-In
    ↓
User signs in with @quantum.media Google account
    ↓
Quantum Gate sets a session cookie (valid for 24 hours)
    ↓
User is redirected back to n8n — Traefik lets them through
```

## Key Facts

| What | Detail |
|------|--------|
| **URL** | https://auth.marketing.qih-tech.com |
| **Admin panel** | https://auth.marketing.qih-tech.com/admin |
| **Protects** | All `*.marketing.qih-tech.com` subdomains |
| **Auth method** | Google OAuth (Workspace accounts only) |
| **Allowed domain** | `@quantum.media` |
| **Session duration** | 24 hours |
| **Tech stack** | Hono (Node.js), TypeScript |
| **Database** | None — uses a JSON file |
| **Deployed via** | Coolify (Dockerfile build from GitHub) |
| **GitHub repo** | https://github.com/digitaladv/qih-martech-marketing-gate |

## What It Protects

Every service on `*.marketing.qih-tech.com` goes through Quantum Gate automatically:
- n8n (workflow automation)
- KPI Dashboard
- CAKE Dashboard
- FileSearch AI
- MDManager
- QuantumMerchant
- Any future service deployed on a subdomain

New subdomains are **auto-discovered** — the first time someone visits a new subdomain, Quantum Gate registers it as protected. Admins can then toggle it to "open" if it should be public.

## Architecture Diagram

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │   Traefik      │  (reverse proxy, handles HTTPS/TLS)
              │   Port 443     │
              └───────┬────────┘
                      │
         ┌────────────┼────────────┐
         │   ForwardAuth check     │
         │   on EVERY request      │
         ▼                         │
  ┌──────────────┐                 │
  │ Quantum Gate │                 │
  │ Port 3000    │                 │
  │ /verify      │──── 200 OK ────┤──── Pass to backend service
  │              │                 │
  │              │──── 302 ────────┤──── Redirect to Google login
  └──────────────┘                 │
                                   ▼
                          ┌────────────────┐
                          │ Backend Service │
                          │ (n8n, KPI, etc)│
                          └────────────────┘
```

### OAuth 2.1 flow (separate from ForwardAuth)

```
  Claude Desktop / Claude.ai / Claude Code
             │
             │ 1. GET /.well-known/oauth-authorization-server
             ▼
  ┌──────────────────────┐
  │   Quantum Gate       │
  │   OAuth Authz Server │
  └──────────┬───────────┘
             │ 2. GET /oauth/authorize (PKCE-S256, state)
             │    → if no qm_session: 302 to /auth/login → Google SSO
             │    → if session:       302 redirect_uri?code=...&state=...
             ▼
  Client exchanges code + verifier:
             │ 3. POST /oauth/token
             ▼
  Claude receives access_token (JWT, HS256, 24h, aud=mcp-analytics)
             │
             │ 4. Authorization: Bearer <token>
             ▼
  analytics-mcp.marketing.qih-tech.com/mcp (verifies JWT locally)
```

## Roles

| Role | Can do |
|------|--------|
| **Regular user** (@quantum.media) | Access all protected services. No admin panel access (sees "Access Denied" page with link to marketing.qih-tech.com) |
| **Admin** | Full admin panel: view/manage services, view/manage users, toggle protection, view login history |
| **Super Admin** | Same as admin, cannot be removed. Set via `SUPER_ADMIN` env var |

## File Structure

```
quantum-gate/
├── src/
│   ├── index.ts              ← App entry point, wires everything together
│   ├── config.ts             ← Environment variables and validation
│   ├── auth.ts               ← Google OAuth login/logout/callback
│   ├── verify.ts             ← Traefik forwardAuth endpoint (the gatekeeper)
│   ├── admin.ts              ← Admin panel API routes
│   ├── store.ts              ← JSON file persistence (services, admins, users, logins, OAuth clients)
│   ├── security.ts           ← Headers, CSRF protection, rate limiting, audit log
│   ├── oauth.ts              ← OAuth 2.1 authorize + token endpoints
│   ├── oauth-metadata.ts     ← RFC 8414 /.well-known/oauth-authorization-server
│   ├── mcp-token.ts          ← Cookie-gated MCP bridge token (CLI path)
│   └── views/
│       ├── login.ts          ← Login page HTML
│       ├── admin.ts          ← Admin dashboard HTML
│       └── mcp-token.ts      ← MCP bridge copy-paste page HTML
├── data/
│   └── services.json  ← Runtime data (auto-created, persisted across deploys)
├── Dockerfile
├── package.json
├── tsconfig.json
├── biome.json         ← Linter/formatter config
├── vitest.config.ts   ← Test configuration
└── .env.example
```
