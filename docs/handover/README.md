# Quantum Gate — Handover Documentation

This documentation is for the development team to understand, maintain, fix, and extend Quantum Gate.

Quantum Gate is both a **Google-OAuth consumer** (issues `qm_session` cookies, acts as Traefik ForwardAuth for `*.marketing.qih-tech.com`) and an **OAuth 2.1 authorization server** (issues Bearer tokens to Claude Desktop / Claude.ai / Claude Code for downstream MCP servers).

## Documents

| # | Document | Who should read | Covers |
|---|----------|-----------------|--------|
| 01 | [System Overview](./01-overview.md) | Everyone | What it is, how it works, architecture diagram, roles |
| 02 | [Configuration](./02-configuration.md) | DevOps / Backend | Environment variables, Google OAuth setup, session settings |
| 03 | [Traefik Integration](./03-traefik-integration.md) | DevOps | How ForwardAuth works, Traefik config, enabling/disabling auth |
| 04 | [API Reference](./04-api-reference.md) | Backend developers | All endpoints, request/response formats |
| 05 | [Security Model](./05-security.md) | Security / Backend | Auth flow, CSRF, headers, rate limiting, audit logging |
| 06 | [Deployment & Operations](./06-deployment.md) | DevOps | Coolify setup, deploying, monitoring, disaster recovery |
| 07 | [Troubleshooting](./07-troubleshooting.md) | Everyone | Common issues and fixes, log reference |
| 08 | [Code Walkthrough](./08-code-walkthrough.md) | Backend developers | File-by-file explanation, how to extend |

## Quick Reference

- **Login page**: https://auth.marketing.qih-tech.com/auth/login
- **Admin panel**: https://auth.marketing.qih-tech.com/admin
- **Health check**: https://auth.marketing.qih-tech.com/health
- **OAuth metadata**: https://auth.marketing.qih-tech.com/.well-known/oauth-authorization-server
- **OAuth authorize**: https://auth.marketing.qih-tech.com/oauth/authorize
- **OAuth token**: https://auth.marketing.qih-tech.com/oauth/token
- **MCP token bridge page** (CLI users): https://auth.marketing.qih-tech.com/auth/mcp-token
- **GitHub repo**: https://github.com/digitaladv/qih-martech-marketing-gate
- **Coolify**: http://34.105.154.219:8000
- **Super admin**: Set via `SUPER_ADMIN` env var in Coolify

## Emergency: Disable Auth for All Services

If Quantum Gate is broken and all services are inaccessible:

1. Go to Coolify → Servers → localhost → Proxy
2. Edit the Traefik compose
3. Remove: `'--entrypoints.https.http.middlewares=quantum-gate-auth@file'`
4. Restart proxy
5. All services are now publicly accessible — fix the issue, then re-add the line
