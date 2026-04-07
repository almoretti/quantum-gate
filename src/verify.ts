import { Hono } from "hono";
import { CONFIG } from "./config.js";
import { isHostProtected, registerHost } from "./store.js";
import { auditLog } from "./security.js";
import { parseSession } from "./auth.js";

const AUTH_HOST = new URL(CONFIG.SERVER_URL).hostname; // auth.marketing.qih-tech.com

export function setupVerifyRoute(app: Hono) {
  app.get("/verify", async (c) => {
    const host = (c.req.header("x-forwarded-host") || "").split(":")[0].toLowerCase();
    const proto = c.req.header("x-forwarded-proto") || "https";
    const uri = c.req.header("x-forwarded-uri") || "/";

    // Always pass the auth host itself (prevents login page auth loop)
    if (host === AUTH_HOST) {
      return c.text("OK", 200);
    }

    // Pass through API paths that have their own auth (e.g., Coolify API with bearer tokens)
    if (uri.startsWith("/api/")) {
      return c.text("OK", 200);
    }

    // Check if host is known and its protection status
    const status = isHostProtected(host);

    // Unknown host → auto-register as protected
    if (!status.known && host) {
      registerHost(host);
      auditLog("host_discovered", { host });
    }

    // Host is open (not protected) → pass through
    if (status.known && !status.protected) {
      return c.text("OK", 200);
    }

    // Host is protected → check session cookie
    const session = await parseSession(c);

    if (session) {
      c.header("X-Auth-User", session.email);
      return c.text("OK", 200);
    }

    // No valid session → redirect to login
    const originalUrl = `${proto}://${host}${uri}`;
    const loginUrl = `${CONFIG.SERVER_URL}/auth/login?redirect=${encodeURIComponent(originalUrl)}`;
    return c.redirect(loginUrl, 302);
  });
}
