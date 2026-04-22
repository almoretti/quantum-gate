import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { setupAdminRoutes } from "./admin.js";
import { setupAuthRoutes } from "./auth.js";
import { CONFIG, validateConfig } from "./config.js";
import { setupMcpTokenRoutes } from "./mcp-token.js";
import { setupOAuthRoutes, startCodeCleanup } from "./oauth.js";
import { setupOAuthMetadataRoute } from "./oauth-metadata.js";
import { setupOAuthRegisterRoute } from "./oauth-register.js";
import {
  auditLog,
  originCheck,
  rateLimit,
  securityHeaders,
} from "./security.js";
import { setupVerifyRoute } from "./verify.js";

validateConfig();

const app = new Hono();

// Global middleware
app.use("*", securityHeaders);

// Temporary diagnostic: log every OAuth / well-known hit with method + UA so
// we can trace Claude's exact discovery flow during the Custom Connector
// onboarding. Remove once the flow is debugged.
app.use("*", async (c, next) => {
  const p = c.req.path;
  if (p.startsWith("/oauth/") || p.startsWith("/.well-known/") || p === "/auth/login" || p === "/auth/callback") {
    const ua = c.req.header("user-agent") || "-";
    console.log(
      `[oauth-trace] ${c.req.method} ${p}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1].slice(0, 120) : ""} ua="${ua.slice(0, 60)}"`,
    );
  }
  await next();
});

// Health check (always public)
app.get("/health", (c) => c.json({ status: "ok", service: "quantum-gate" }));

// ForwardAuth endpoint (called by Traefik — must be fast, no rate limit)
setupVerifyRoute(app);

// OAuth metadata (RFC 8414) — public, cacheable, no rate limit
setupOAuthMetadataRoute(app);

// Auth routes (rate-limited)
app.use("/auth/*", rateLimit(30, 60_000));
setupAuthRoutes(app);
setupMcpTokenRoutes(app);

// OAuth 2.1 authorize + token + DCR endpoints (rate-limited)
app.use("/oauth/*", rateLimit(60, 60_000));
setupOAuthRoutes(app);
setupOAuthRegisterRoute(app);
startCodeCleanup();

// Admin routes (rate-limited + CSRF protection)
app.use("/admin", rateLimit(30, 60_000));
app.use("/api/*", rateLimit(60, 60_000));
app.use("/api/*", originCheck);
setupAdminRoutes(app);

// Start
serve({ fetch: app.fetch, port: CONFIG.PORT }, () => {
  auditLog("server_started", { port: CONFIG.PORT, url: CONFIG.SERVER_URL });
  console.log(`Quantum Gate running on port ${CONFIG.PORT}`);
  console.log(`Login: ${CONFIG.SERVER_URL}/auth/login`);
  console.log(`Admin: ${CONFIG.SERVER_URL}/admin`);
});
