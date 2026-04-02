# Configuration Guide

## Environment Variables

All configuration is done through environment variables. These are set in **Coolify** under the Quantum Gate application → Environment Variables.

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | `134682421362-xxx.apps.googleusercontent.com` | Google OAuth client ID. From Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | Google OAuth client secret. Same location as above |
| `JWT_SECRET` | `e6f525dc271158f2...` | Random string used to sign session cookies. Must be at least 32 characters. Generate with: `openssl rand -hex 32` |

### Optional Variables (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the app listens on. Don't change unless you also update Coolify port mapping |
| `SERVER_URL` | `http://localhost:3000` | Public URL of Quantum Gate. In production: `https://auth.marketing.qih-tech.com` |
| `NODE_ENV` | `development` | Set to `production` in Coolify |
| `ALLOWED_DOMAIN` | `quantum.media` | Only Google accounts from this domain can log in |
| `COOKIE_DOMAIN` | _(empty)_ | Domain scope for the session cookie. In production: `.marketing.qih-tech.com` (note the leading dot — this shares the cookie across all subdomains) |
| `COOKIE_NAME` | `qm_session` | Name of the session cookie |
| `SUPER_ADMIN` | `alessandro.moretti@quantum.media` | Email of the super admin. This user always has admin access and cannot be removed |

### How to Change the Super Admin

1. Go to Coolify → Quantum Gate app → Environment Variables
2. Update the `SUPER_ADMIN` value to the new email
3. Redeploy the application

### How to Generate a New JWT Secret

If you suspect the secret has been compromised:

```bash
openssl rand -hex 32
```

1. Copy the output
2. Update `JWT_SECRET` in Coolify environment variables
3. Redeploy — all existing sessions will be invalidated (users need to re-login)

## Google OAuth Setup

The Google OAuth credentials live in **Google Cloud Console** under project credentials.

### Current Setup
- **Client ID**: `134682421362-4la0r347jqotsr2t6rp3e3l26ftmvvpj.apps.googleusercontent.com`
- **Authorized redirect URI**: `https://auth.marketing.qih-tech.com/auth/callback`

### If You Need New Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services → Credentials**
3. Click **Create Credentials → OAuth Client ID**
4. Application type: **Web application**
5. Add authorized redirect URI: `https://auth.marketing.qih-tech.com/auth/callback`
6. Copy the Client ID and Secret
7. Update the env vars in Coolify and redeploy

### Important: Redirect URI Must Match Exactly

The redirect URI in Google Cloud Console must exactly match:
```
https://auth.marketing.qih-tech.com/auth/callback
```

If it doesn't match, users will see "Error 400: redirect_uri_mismatch" when trying to log in.

## Session Cookie Details

| Property | Value | Why |
|----------|-------|-----|
| Name | `qm_session` | Configurable via `COOKIE_NAME` |
| Domain | `.marketing.qih-tech.com` | Shared across ALL subdomains |
| Duration | 24 hours | Hardcoded in `config.ts` as `COOKIE_MAX_AGE: 86400` |
| HttpOnly | `true` | JavaScript cannot read/steal the cookie |
| Secure | `true` (in production) | Only sent over HTTPS |
| SameSite | `Lax` | Prevents cross-site request attacks, but allows same-site redirects |

### Changing Session Duration

Edit `src/config.ts`:
```typescript
COOKIE_MAX_AGE: 86400, // Change this value (in seconds)
```
- 12 hours = `43200`
- 24 hours = `86400`
- 7 days = `604800`

Then push to GitHub and redeploy.

## Data Storage

All runtime data is stored in `/app/data/services.json` inside the container. This file is persisted via a **Coolify directory mount** or **Docker volume**.

### What's Stored
- **Services**: hostname, display name, protection status, discovery timestamp
- **Admins**: list of admin email addresses
- **Recent logins**: last 100 login events (email, name, IP, timestamp)

### Where on the Host
In Coolify, the persistent volume maps to:
```
/data/coolify/applications/{app-uuid}/
```

### Backup
To backup the configuration:
```bash
cp /data/coolify/applications/{app-uuid}/services.json ~/services-backup.json
```
