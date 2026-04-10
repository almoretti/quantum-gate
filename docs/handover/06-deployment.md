# Deployment & Operations

## Where It Runs

- **Server**: Coolify instance at `34.105.154.219` (Google Cloud)
- **Coolify project**: "Authelia" (legacy name from earlier setup)
- **Application type**: Dockerfile build from GitHub repo
- **GitHub repo**: https://github.com/almoretti/quantum-gate
- **Branch**: `main`

## How Deployment Works

1. Push code to `main` branch on GitHub
2. In Coolify, go to Quantum Gate app → click **Deploy**
3. Coolify pulls the repo, builds the Docker image, and replaces the running container
4. The `data/services.json` file persists across deploys (directory mount)

### Automatic Deployments
You can enable auto-deploy in Coolify so it deploys on every push to `main`. Go to the app settings in Coolify and enable webhooks.

## Coolify Configuration

### Application Settings

| Setting | Value |
|---------|-------|
| FQDN | `https://auth.marketing.qih-tech.com` |
| Port | `3000` |
| Port mapping | `3099:3000` (host:container) |
| Build pack | Dockerfile |
| Health check | Disabled (Quantum Gate starts fast, no special health check needed) |
| NODE_ENV at build time | Must be `development` (or unchecked "Available at Buildtime"). The Dockerfile runs `NODE_ENV=development npm install` to include devDependencies (TypeScript), but if Coolify injects `NODE_ENV=production` at build time it can override this and break the build |

### Persistent Storage

A **named volume** maps to `/app/data` in the container. This is critical — without it, all services, users, admins, and login history are lost on container restart.

In Coolify volume mount settings:
- **Name**: `quantum-gate-data` (or similar, no spaces/special characters)
- **Source Path**: leave empty (Docker-managed)
- **Destination Path**: `/app/data`

Contains: `services.json` (services, admins, users, login history)

### Environment Variables

See [02-configuration.md](./02-configuration.md) for the full list.

## Redeploying

### From Coolify UI
1. Go to the Quantum Gate application
2. Click **Deploy**
3. Wait ~30 seconds for build + start

### From CLI
```bash
coolify deploy name quantum-gate
```

Or by UUID:
```bash
coolify deploy uuid hs48s0g8go8osgc0c4cwgc48
```

### After Code Changes
1. Make changes in the `quantum-gate/` folder
2. Build: `npx tsc` (verify no errors)
3. Commit and push: `git add -A && git commit -m "description" && git push`
4. Deploy from Coolify

## Monitoring

### Health Check
```bash
curl https://auth.marketing.qih-tech.com/health
# Should return: {"status":"ok","service":"quantum-gate"}
```

### Logs
View in Coolify → Quantum Gate → Logs tab

Or via CLI:
```bash
coolify app logs {uuid} -n 100
```

Logs are JSON-formatted, one event per line. Filter for specific events:
```bash
coolify app logs {uuid} -n 500 | grep "auth_domain_rejected"
```

### Check Which Services Are Discovered
```bash
curl -s https://auth.marketing.qih-tech.com/api/services
# (requires valid session cookie — use the admin panel instead)
```

## Restarting

### Restart Quantum Gate
In Coolify UI or:
```bash
coolify app restart {uuid}
```

### Restart Traefik Proxy
Coolify → Servers → localhost → Proxy → Restart

**Warning**: Restarting Traefik causes a brief (~5 second) interruption for ALL services.

## Disaster Recovery

### Quantum Gate Is Down (All Services Show 500)

**Quick fix — restore access without auth:**
1. Coolify → Servers → localhost → Proxy → Edit compose
2. Remove: `'--entrypoints.https.http.middlewares=quantum-gate-auth@file'`
3. Restart proxy
4. All services are now publicly accessible
5. Fix Quantum Gate, then re-add the line

### Lost services.json
If the data file is lost, Quantum Gate starts fresh:
- Services will be re-discovered on first access
- All services default to "protected"
- Admin list is empty (only super admin has access)
- Login history is lost

### Need to Change Google OAuth Credentials
1. Create new credentials in Google Cloud Console
2. Add redirect URI: `https://auth.marketing.qih-tech.com/auth/callback`
3. Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Coolify
4. Redeploy

### Moving to a New Server
1. Deploy Coolify on the new server
2. Create Quantum Gate app from the GitHub repo
3. Set all environment variables
4. Add the Traefik entrypoint middleware line
5. Add the dynamic config YAML
6. Update DNS for `auth.marketing.qih-tech.com`
7. Copy `services.json` from old server (optional — services auto-discover)

## Local Development

### Prerequisites
- Node.js 22+
- A Google OAuth app with `http://localhost:3099/auth/callback` as redirect URI

### Setup
```bash
cd quantum-gate/
npm install
cp .env.example .env
# Edit .env with your values (use PORT=3099, SERVER_URL=http://localhost:3099, COOKIE_DOMAIN= empty)
```

### Run
```bash
npm run dev
# Opens on http://localhost:3099
```

### Build
```bash
npm run build
# Compiled JS in dist/
```

### Test the verify endpoint locally
```bash
curl -H "X-Forwarded-Host: test.marketing.qih-tech.com" http://localhost:3099/verify
# Should return 302 redirect to login
```
