# Troubleshooting Guide

## Common Issues

### Users Can't Log In

**Symptom**: "Error 400: redirect_uri_mismatch" on Google login

**Cause**: The redirect URI in Google Cloud Console doesn't match what Quantum Gate sends.

**Fix**: Go to Google Cloud Console → APIs & Services → Credentials → Edit the OAuth client. Ensure the authorized redirect URI is exactly:
```
https://auth.marketing.qih-tech.com/auth/callback
```

---

**Symptom**: "Access Denied — Only @quantum.media accounts are allowed"

**Cause**: User tried to log in with a personal Gmail or different domain.

**Fix**: This is working as intended. Only @quantum.media accounts are allowed. If you need to change the domain, update the `ALLOWED_DOMAIN` env var.

---

**Symptom**: User logs in successfully but gets redirected back to login in a loop

**Cause**: Session cookie not being set or read properly.

**Check**:
1. Is `COOKIE_DOMAIN` set to `.marketing.qih-tech.com`? (with leading dot)
2. Is `SERVER_URL` set to `https://auth.marketing.qih-tech.com`? (must be HTTPS for Secure cookie)
3. Open browser DevTools → Application → Cookies → look for `qm_session`
4. If the cookie exists but keeps getting rejected, the `JWT_SECRET` might have changed. Redeploy and clear browser cookies.

---

### All Services Return 500

**Cause**: Traefik can't reach Quantum Gate for the ForwardAuth check.

**Quick diagnosis**:
```bash
curl https://auth.marketing.qih-tech.com/health
```
- If this also returns 500 → Quantum Gate itself is behind the broken auth loop
- If this returns `{"status":"ok"}` → Quantum Gate is running but unreachable from Traefik internally

**Fix — Immediate (restore access)**:
1. Coolify → Servers → localhost → Proxy → Edit compose
2. Remove: `'--entrypoints.https.http.middlewares=quantum-gate-auth@file'`
3. Restart proxy
4. All services are now public — fix the root cause then re-enable

**Root causes to check**:
- Is Quantum Gate running? Check in Coolify app list
- Is port mapping `3099:3000` still configured?
- Is the dynamic config pointing to `http://host.docker.internal:3099/verify`?

---

### Specific Service Not Protected

**Symptom**: You can access a service without logging in.

**Check**: Go to the admin panel → is the service listed? Is it set to "Open"?

- If not listed: the service hasn't been accessed yet. Visit it once and it will auto-register as protected.
- If listed as "Open": an admin set it to open. Toggle it back to "Protected".
- If not listed even after visiting: check that the Traefik entrypoint middleware is enabled.

---

### Admin Panel Shows "Access Denied"

**Cause**: Your account isn't in the admin list. The admin panel is restricted to admins only — regular authenticated users cannot access it.

**Fix**: The super admin or another admin needs to add you via the admin panel → Users section → "Make Admin" button (or "Add Admin" by email). Or update the `SUPER_ADMIN` env var in Coolify if you need to change the super admin.

---

### "Too Many Requests" (429) Error

**Cause**: Rate limiter triggered. Limits are:
- Auth endpoints: 30/min
- Admin page: 30/min
- API endpoints: 60/min

**Fix**: Wait 60 seconds. If the rate limit is too aggressive for your use case, adjust the values in `src/index.ts`:
```typescript
app.use("/auth/*", rateLimit(30, 60_000));  // Change 30 to higher number
```

---

### New Service Not Auto-Discovered

**Symptom**: Deployed a new service on `*.marketing.qih-tech.com` but it doesn't appear in the admin panel.

**Cause**: No one has visited it yet. Auto-discovery happens on first access.

**Fix**: Visit the service URL once. Quantum Gate will register it and redirect you to login. After logging in, it appears in the admin panel.

---

### Changes Not Taking Effect After Deploy

**Possible causes**:
1. Browser cache — hard refresh (Ctrl+Shift+R) or try incognito
2. Old container still running — check Coolify deployment status
3. Coolify cached the build — try deploying with "Force rebuild" option

---

## Log Messages Reference

Check logs in Coolify → Quantum Gate → Logs.

| Log event | Meaning | Action needed? |
|-----------|---------|----------------|
| `server_started` | App started successfully | No — normal |
| `host_discovered` | New subdomain first accessed | No — informational |
| `auth_success` | User logged in | No — normal |
| `auth_domain_rejected` | Wrong domain tried to login | Monitor — could be a misconfigured user |
| `auth_token_exchange_failed` | Google OAuth failed | Check Google credentials, check Google Cloud Console |
| `auth_callback_error` | Unexpected auth error | Check full error, likely a transient issue |
| `csrf_blocked` | Cross-origin API request blocked | Possible attack or misconfigured client. Investigate. |
| `service_protection_changed` | Admin toggled protection | Audit — check who and why |
| `admin_added` / `admin_removed` | Admin role change | Audit — verify this was intentional |

## Getting Help

1. **Check the logs first** — most issues have clear error messages
2. **Check Coolify** — is the app running? Is the proxy running?
3. **Check Google Cloud Console** — are the OAuth credentials valid?
4. **Check the GitHub repo** — is the code up to date?
5. **Test the health endpoint** — `curl https://auth.marketing.qih-tech.com/health`
