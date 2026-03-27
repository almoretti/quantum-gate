import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { CONFIG } from "./config.js";
import { recordLogin } from "./store.js";
import { auditLog } from "./security.js";
import { loginPageHtml } from "./views/login.js";
import crypto from "node:crypto";

// CSRF state storage (short-lived, in-memory)
const pendingStates = new Map<string, { redirect: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}, 60_000);

export function setupAuthRoutes(app: Hono) {

  // Login page
  app.get("/auth/login", (c) => {
    const redirect = c.req.query("redirect") || "";
    return c.html(loginPageHtml(redirect));
  });

  // Start Google OAuth
  app.get("/auth/google", (c) => {
    const redirect = c.req.query("redirect") || "";
    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, { redirect, expiresAt: Date.now() + 300_000 });

    // Cap pending states
    if (pendingStates.size > 500) {
      const first = pendingStates.keys().next().value;
      if (first) pendingStates.delete(first);
    }

    const params = new URLSearchParams({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri: `${CONFIG.SERVER_URL}/auth/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      hd: CONFIG.ALLOWED_DOMAIN,
      access_type: "online",
      prompt: "select_account",
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // Google OAuth callback
  app.get("/auth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) return c.text("Missing code or state", 400);

    const pending = pendingStates.get(state);
    if (!pending) return c.text("Invalid or expired state", 403);
    pendingStates.delete(state);

    try {
      // Exchange code for token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          client_secret: CONFIG.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${CONFIG.SERVER_URL}/auth/callback`,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        auditLog("auth_token_exchange_failed", { status: tokenRes.status });
        return c.text("Google token exchange failed", 502);
      }

      const tokenData = await tokenRes.json() as { access_token: string };

      // Fetch user info
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        auditLog("auth_userinfo_failed", { status: userRes.status });
        return c.text("Failed to fetch user info", 502);
      }

      const user = await userRes.json() as { email: string; name: string; picture?: string };

      // Domain enforcement
      if (!user.email.endsWith(`@${CONFIG.ALLOWED_DOMAIN}`)) {
        auditLog("auth_domain_rejected", { email: user.email });
        return c.html(`
          <html><body style="font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#f8fafe;">
            <div style="text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
              <h2 style="color:#3d4449;">Access Denied</h2>
              <p style="color:#5a6268;">Only @${CONFIG.ALLOWED_DOMAIN} accounts are allowed.</p>
              <a href="/auth/login" style="color:#0086ff;">Try again</a>
            </div>
          </body></html>
        `, 403);
      }

      // Record login
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      recordLogin(user.email, user.name, ip);

      // Sign JWT session cookie
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        { email: user.email, name: user.name, iat: now, exp: now + CONFIG.COOKIE_MAX_AGE },
        CONFIG.JWT_SECRET
      );

      // Set cookie
      const cookieOpts: Parameters<typeof setCookie>[3] = {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: CONFIG.COOKIE_MAX_AGE,
      };
      if (CONFIG.COOKIE_DOMAIN) cookieOpts.domain = CONFIG.COOKIE_DOMAIN;
      if (CONFIG.isSecure) cookieOpts.secure = true;

      setCookie(c, CONFIG.COOKIE_NAME, token, cookieOpts);

      auditLog("auth_success", { email: user.email });

      // Redirect to original URL or default
      const redirectTo = pending.redirect || (
        user.email === CONFIG.SUPER_ADMIN ? "/admin" : CONFIG.SERVER_URL
      );

      return c.redirect(redirectTo);

    } catch (err) {
      auditLog("auth_callback_error", { error: String(err) });
      return c.text("Authentication failed", 500);
    }
  });

  // Logout
  app.get("/auth/logout", (c) => {
    const cookieOpts: Parameters<typeof setCookie>[3] = {
      path: "/",
      maxAge: 0,
    };
    if (CONFIG.COOKIE_DOMAIN) cookieOpts.domain = CONFIG.COOKIE_DOMAIN;
    setCookie(c, CONFIG.COOKIE_NAME, "", cookieOpts);
    return c.redirect("/auth/login");
  });
}

// Shared helper: parse and verify the session cookie
export async function parseSession(c: { req: { raw: Request } } & any): Promise<{ email: string; name: string } | null> {
  const token = getCookie(c, CONFIG.COOKIE_NAME);
  if (!token) return null;
  try {
    const payload = await verify(token, CONFIG.JWT_SECRET, "HS256") as { email: string; name: string };
    return payload;
  } catch {
    return null;
  }
}
