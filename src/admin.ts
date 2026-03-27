import { Hono } from "hono";
import { CONFIG } from "./config.js";
import { parseSession } from "./auth.js";
import { getServices, setProtection, addService, removeService, updateServiceName, getRecentLogins } from "./store.js";
import { auditLog } from "./security.js";
import { adminPageHtml } from "./views/admin.js";

let adminEmail = "";

async function requireAdmin(c: any, next: () => Promise<void>) {
  const session = await parseSession(c);
  if (!session) {
    return c.redirect(`/auth/login?redirect=/admin`);
  }
  if (session.email !== CONFIG.SUPER_ADMIN) {
    return c.html(`
      <html><body style="font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#f8fafe;">
        <div style="text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <h2 style="color:#3d4449;">Access Denied</h2>
          <p style="color:#5a6268;">Admin access is restricted.</p>
          <a href="/auth/logout" style="color:#0086ff;">Logout</a>
        </div>
      </body></html>
    `, 403);
  }
  adminEmail = session.email;
  await next();
}

export function setupAdminRoutes(app: Hono) {

  // Admin panel
  app.get("/admin", requireAdmin, (c) => {
    return c.html(adminPageHtml(adminEmail));
  });

  // API: List services
  app.get("/api/services", requireAdmin, (c) => {
    return c.json(getServices());
  });

  // API: Update service (toggle protection or rename)
  app.patch("/api/services/:host", requireAdmin, async (c) => {
    const host = c.req.param("host");
    const body = await c.req.json<{ protected?: boolean; name?: string }>();

    if (typeof body.protected === "boolean") {
      const ok = setProtection(host, body.protected);
      if (!ok) return c.json({ error: "Service not found" }, 404);
      auditLog("service_protection_changed", { host, protected: body.protected, by: adminEmail });
    }

    if (typeof body.name === "string") {
      const ok = updateServiceName(host, body.name);
      if (!ok) return c.json({ error: "Service not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // API: Add service
  app.post("/api/services", requireAdmin, async (c) => {
    const body = await c.req.json<{ host: string; name: string; protected: boolean }>();
    if (!body.host) return c.json({ error: "host is required" }, 400);
    addService(body.host, body.name || body.host.split(".")[0], body.protected ?? true);
    auditLog("service_added", { host: body.host, by: adminEmail });
    return c.json({ ok: true }, 201);
  });

  // API: Remove service
  app.delete("/api/services/:host", requireAdmin, async (c) => {
    const host = c.req.param("host");
    const ok = removeService(host);
    if (!ok) return c.json({ error: "Service not found" }, 404);
    auditLog("service_removed", { host, by: adminEmail });
    return c.json({ ok: true });
  });

  // API: Recent logins
  app.get("/api/sessions", requireAdmin, (c) => {
    return c.json(getRecentLogins());
  });
}
