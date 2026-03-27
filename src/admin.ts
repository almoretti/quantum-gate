import { Hono } from "hono";
import { CONFIG } from "./config.js";
import { parseSession } from "./auth.js";
import { getServices, setProtection, addService, removeService, updateServiceName, getRecentLogins, isAdmin, getAdmins, addAdmin, removeAdmin } from "./store.js";
import { auditLog } from "./security.js";
import { adminPageHtml } from "./views/admin.js";

let currentUser = { email: "", isAdmin: false };

// Any authenticated user can view the dashboard
async function requireAuth(c: any, next: () => Promise<void>) {
  const session = await parseSession(c);
  if (!session) {
    return c.redirect(`/auth/login?redirect=/admin`);
  }
  currentUser = {
    email: session.email,
    isAdmin: session.email === CONFIG.SUPER_ADMIN || isAdmin(session.email),
  };
  await next();
}

// Only admins can make changes
async function requireAdminRole(c: any, next: () => Promise<void>) {
  if (!currentUser.isAdmin) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}

export function setupAdminRoutes(app: Hono) {

  // Dashboard — viewable by all authenticated users
  app.get("/admin", requireAuth, (c) => {
    return c.html(adminPageHtml(currentUser.email, currentUser.isAdmin));
  });

  // API: List services (read-only, all users)
  app.get("/api/services", requireAuth, (c) => {
    return c.json(getServices());
  });

  // API: Recent logins (read-only, all users)
  app.get("/api/sessions", requireAuth, (c) => {
    return c.json(getRecentLogins());
  });

  // API: List admins (read-only, all users)
  app.get("/api/admins", requireAuth, (c) => {
    return c.json({ superAdmin: CONFIG.SUPER_ADMIN, admins: getAdmins() });
  });

  // --- Write operations: admin-only ---

  // API: Update service (toggle protection or rename)
  app.patch("/api/services/:host", requireAuth, requireAdminRole, async (c) => {
    const host = c.req.param("host");
    const body = await c.req.json<{ protected?: boolean; name?: string }>();

    if (typeof body.protected === "boolean") {
      const ok = setProtection(host, body.protected);
      if (!ok) return c.json({ error: "Service not found" }, 404);
      auditLog("service_protection_changed", { host, protected: body.protected, by: currentUser.email });
    }

    if (typeof body.name === "string") {
      const ok = updateServiceName(host, body.name);
      if (!ok) return c.json({ error: "Service not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // API: Add service
  app.post("/api/services", requireAuth, requireAdminRole, async (c) => {
    const body = await c.req.json<{ host: string; name: string; protected: boolean }>();
    if (!body.host) return c.json({ error: "host is required" }, 400);
    addService(body.host, body.name || body.host.split(".")[0], body.protected ?? true);
    auditLog("service_added", { host: body.host, by: currentUser.email });
    return c.json({ ok: true }, 201);
  });

  // API: Remove service
  app.delete("/api/services/:host", requireAuth, requireAdminRole, async (c) => {
    const host = c.req.param("host");
    const ok = removeService(host);
    if (!ok) return c.json({ error: "Service not found" }, 404);
    auditLog("service_removed", { host, by: currentUser.email });
    return c.json({ ok: true });
  });

  // API: Add admin
  app.post("/api/admins", requireAuth, requireAdminRole, async (c) => {
    const body = await c.req.json<{ email: string }>();
    if (!body.email) return c.json({ error: "email is required" }, 400);
    const ok = addAdmin(body.email);
    if (!ok) return c.json({ error: "Already an admin" }, 409);
    auditLog("admin_added", { email: body.email, by: currentUser.email });
    return c.json({ ok: true }, 201);
  });

  // API: Remove admin
  app.delete("/api/admins/:email", requireAuth, requireAdminRole, async (c) => {
    const email = c.req.param("email");
    if (email === CONFIG.SUPER_ADMIN) return c.json({ error: "Cannot remove super admin" }, 403);
    const ok = removeAdmin(email);
    if (!ok) return c.json({ error: "Not an admin" }, 404);
    auditLog("admin_removed", { email, by: currentUser.email });
    return c.json({ ok: true });
  });
}
