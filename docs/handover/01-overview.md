# Quantum Gate — System Overview

## What Is This?

Quantum Gate is a lightweight authentication gateway that protects all internal services running on `*.marketing.qih-tech.com`. It sits between the internet and your services, requiring users to sign in with their Google Workspace account before accessing any tool.

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
| **GitHub repo** | https://github.com/almoretti/quantum-gate |

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

## Roles

| Role | Can do |
|------|--------|
| **Regular user** (@quantum.media) | View admin dashboard (read-only), access all protected services |
| **Admin** | Toggle service protection, add/remove services, manage admins |
| **Super Admin** | Same as admin, cannot be removed. Set via `SUPER_ADMIN` env var |

## File Structure

```
quantum-gate/
├── src/
│   ├── index.ts       ← App entry point, wires everything together
│   ├── config.ts      ← Environment variables and validation
│   ├── auth.ts        ← Google OAuth login/logout/callback
│   ├── verify.ts      ← Traefik forwardAuth endpoint (the gatekeeper)
│   ├── admin.ts       ← Admin panel API routes
│   ├── store.ts       ← JSON file persistence (services, admins, logins)
│   ├── security.ts    ← Headers, CSRF protection, rate limiting, audit log
│   └── views/
│       ├── login.ts   ← Login page HTML
│       └── admin.ts   ← Admin dashboard HTML
├── data/
│   └── services.json  ← Runtime data (auto-created, persisted across deploys)
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```
