import { Hono } from "hono";
import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import { CONFIG } from "./config.js";
import { addService, registerHost, removeService, setProtection } from "./store.js";
import { setupVerifyRoute } from "./verify.js";

describe("verify route", () => {
  function makeApp() {
    const app = new Hono();
    setupVerifyRoute(app);
    return app;
  }

  it("passes through the auth host itself", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "localhost:3099",
        "x-forwarded-proto": "http",
        "x-forwarded-uri": "/auth/login",
      },
    });
    expect(res.status).toBe(200);
  });

  it("passes through /api/ paths via default exemption (backwards compatible)", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "someapp.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/api/v1/deployments",
      },
    });
    expect(res.status).toBe(200);
  });

  it("passes through any /api/ subpath via default wildcard exemption", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "coolify.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/api/v2/something",
      },
    });
    expect(res.status).toBe(200);
  });

  it("does NOT pass non-/api/ paths without auth", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "someapp.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/dashboard",
      },
    });
    expect(res.status).toBe(302);
  });

  it("redirects unauthenticated users on protected hosts", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "protected.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/dashboard",
      },
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/auth/login");
    expect(location).toContain("redirect=");
  });

  it("passes through open (unprotected) hosts", async () => {
    // Register a host and mark it open
    addService("open-host.example.com", "Open Host", false);

    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "open-host.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/public-page",
      },
    });
    expect(res.status).toBe(200);

    // Cleanup
    removeService("open-host.example.com");
  });

  it("auto-discovers and protects unknown hosts", async () => {
    const testHost = `auto-discover-${Date.now()}.example.com`;
    const app = makeApp();

    // First request to unknown host → should redirect (protected by default)
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": testHost,
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/",
      },
    });
    expect(res.status).toBe(302);

    // Cleanup
    removeService(testHost);
  });

  it("passes through authenticated users on protected hosts", async () => {
    // Create a valid JWT
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { email: "user@quantum.media", name: "User", iat: now, exp: now + 3600 },
      CONFIG.JWT_SECRET,
    );

    const testHost = `auth-test-${Date.now()}.example.com`;
    registerHost(testHost);

    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": testHost,
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/dashboard",
        Cookie: `${CONFIG.COOKIE_NAME}=${token}`,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-auth-user")).toBe("user@quantum.media");

    // Cleanup
    removeService(testHost);
  });

  it("redirect URL includes original proto, host and URI", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "myapp.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-uri": "/deep/path?query=1",
      },
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    // The redirect param should contain the full original URL
    expect(location).toContain(
      encodeURIComponent("https://myapp.example.com/deep/path?query=1"),
    );
  });

  it("handles host header with port number", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "localhost:3099",
        "x-forwarded-proto": "http",
        "x-forwarded-uri": "/",
      },
    });
    // Should match auth host (strips port)
    expect(res.status).toBe(200);
  });

  it("defaults proto to https and uri to /", async () => {
    const app = makeApp();
    const res = await app.request("/verify", {
      headers: {
        "x-forwarded-host": "unknown-default.example.com",
      },
    });
    // Should redirect since host is unknown and no session
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("https%3A%2F%2Funknown-default.example.com%2F");
  });
});
