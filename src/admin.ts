import type { Hono, MiddlewareHandler } from "hono";
import { parseSession } from "./auth.js";
import { CONFIG } from "./config.js";
import { auditLog } from "./security.js";
import {
  addAdmin,
  addApiExemption,
  addService,
  getAdmins,
  getApiExemptions,
  getRecentLogins,
  getServices,
  getUsers,
  isAdmin,
  removeAdmin,
  removeApiExemption,
  removeService,
  setProtection,
  updateServiceName,
} from "./store.js";
import { adminPageHtml } from "./views/admin.js";

type Env = { Variables: { userEmail: string } };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function accessDeniedHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Access Denied — Quantum Gate</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',sans-serif; background:#f8fafe; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.card { text-align:center; padding:48px; background:white; border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,0.08); max-width:420px; }
h2 { color:#3d4449; margin-bottom:8px; }
p { color:#5a6268; margin-bottom:24px; line-height:1.6; }
.email { font-weight:600; color:#3d4449; }
a { display:inline-block; padding:10px 24px; border-radius:8px; text-decoration:none; font-weight:600; font-size:0.9rem; }
.back { background:#0086ff; color:white; }
.back:hover { background:#0070d6; }
.logout { color:#5a6268; margin-left:12px; }
</style>
</head><body>
<div class="card">
  <h2>Access Denied</h2>
  <p>Signed in as <span class="email">${esc(email)}</span><br>You don't have admin access. Contact an administrator to request access.</p>
  <a class="back" href="https://marketing.qih-tech.com">Home</a>
  <a class="logout" href="/auth/logout">Sign Out</a>
</div>
</body></html>`;
}

// Single middleware: authenticate + require admin role
// User email is stored per-request on the context (not a shared variable)
const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  const session = await parseSession(c);
  if (!session) {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Authentication required" }, 401);
    }
    return c.redirect(`/auth/login?redirect=/admin`);
  }
  if (session.email !== CONFIG.SUPER_ADMIN && !isAdmin(session.email)) {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Admin access required" }, 403);
    }
    return c.html(accessDeniedHtml(session.email), 403);
  }
  c.set("userEmail", session.email);
  await next();
};

export function setupAdminRoutes(app: Hono) {
  const router = app as unknown as Hono<Env>;

  // Dashboard — admin-only
  router.get("/admin", requireAdmin, (c) => {
    return c.html(adminPageHtml(c.get("userEmail")));
  });

  // --- Read endpoints (admin-only) ---

  router.get("/api/services", requireAdmin, (c) => c.json(getServices()));

  router.get("/api/sessions", requireAdmin, (c) => c.json(getRecentLogins()));

  router.get("/api/admins", requireAdmin, (c) => {
    return c.json({ superAdmin: CONFIG.SUPER_ADMIN, admins: getAdmins() });
  });

  router.get("/api/users", requireAdmin, (c) => c.json(getUsers()));

  // --- Write endpoints (admin-only) ---

  router.patch("/api/services/:host", requireAdmin, async (c) => {
    const host = c.req.param("host");
    const email = c.get("userEmail");
    const body = await c.req.json<{ protected?: boolean; name?: string }>();

    if (typeof body.protected === "boolean") {
      const ok = setProtection(host, body.protected);
      if (!ok) return c.json({ error: "Service not found" }, 404);
      auditLog("service_protection_changed", {
        host,
        protected: body.protected,
        by: email,
      });
    }

    if (typeof body.name === "string") {
      const ok = updateServiceName(host, body.name);
      if (!ok) return c.json({ error: "Service not found" }, 404);
    }

    return c.json({ ok: true });
  });

  router.post("/api/services", requireAdmin, async (c) => {
    const email = c.get("userEmail");
    const body = await c.req.json<{
      host: string;
      name: string;
      protected: boolean;
    }>();
    if (!body.host) return c.json({ error: "host is required" }, 400);
    addService(
      body.host,
      body.name || body.host.split(".")[0],
      body.protected ?? true,
    );
    auditLog("service_added", { host: body.host, by: email });
    return c.json({ ok: true }, 201);
  });

  router.delete("/api/services/:host", requireAdmin, async (c) => {
    const host = c.req.param("host");
    const email = c.get("userEmail");
    const ok = removeService(host);
    if (!ok) return c.json({ error: "Service not found" }, 404);
    auditLog("service_removed", { host, by: email });
    return c.json({ ok: true });
  });

  router.post("/api/admins", requireAdmin, async (c) => {
    const email = c.get("userEmail");
    const body = await c.req.json<{ email: string }>();
    if (!body.email) return c.json({ error: "email is required" }, 400);
    if (!body.email.endsWith(`@${CONFIG.ALLOWED_DOMAIN}`)) {
      return c.json(
        { error: `Only @${CONFIG.ALLOWED_DOMAIN} emails can be admins` },
        400,
      );
    }
    const ok = addAdmin(body.email);
    if (!ok) return c.json({ error: "Already an admin" }, 409);
    auditLog("admin_added", { email: body.email, by: email });
    return c.json({ ok: true }, 201);
  });

  router.delete("/api/admins/:email", requireAdmin, async (c) => {
    const targetEmail = c.req.param("email");
    const email = c.get("userEmail");
    if (targetEmail === CONFIG.SUPER_ADMIN)
      return c.json({ error: "Cannot remove super admin" }, 403);
    const ok = removeAdmin(targetEmail);
    if (!ok) return c.json({ error: "Not an admin" }, 404);
    auditLog("admin_removed", { email: targetEmail, by: email });
    return c.json({ ok: true });
  });

  // --- API Exemptions ---

  router.get("/api/exemptions", requireAdmin, (c) =>
    c.json(getApiExemptions()),
  );

  router.post("/api/exemptions", requireAdmin, async (c) => {
    const email = c.get("userEmail");
    const body = await c.req.json<{
      host: string;
      pathPrefix: string;
      label: string;
    }>();
    if (!body.host || !body.pathPrefix)
      return c.json({ error: "host and pathPrefix are required" }, 400);
    if (!body.pathPrefix.startsWith("/"))
      return c.json({ error: "pathPrefix must start with /" }, 400);
    const ok = addApiExemption(
      body.host,
      body.pathPrefix,
      body.label || body.host,
    );
    if (!ok) return c.json({ error: "Exemption already exists" }, 409);
    auditLog("api_exemption_added", {
      host: body.host,
      pathPrefix: body.pathPrefix,
      by: email,
    });
    return c.json({ ok: true }, 201);
  });

  router.delete("/api/exemptions", requireAdmin, async (c) => {
    const email = c.get("userEmail");
    const body = await c.req.json<{ host: string; pathPrefix: string }>();
    if (!body.host || !body.pathPrefix)
      return c.json({ error: "host and pathPrefix are required" }, 400);
    const ok = removeApiExemption(body.host, body.pathPrefix);
    if (!ok) return c.json({ error: "Exemption not found" }, 404);
    auditLog("api_exemption_removed", {
      host: body.host,
      pathPrefix: body.pathPrefix,
      by: email,
    });
    return c.json({ ok: true });
  });
}
