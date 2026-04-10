import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { auditLog, originCheck, rateLimit, securityHeaders } from "./security.js";

describe("securityHeaders", () => {
  function makeApp() {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/test", (c) => c.text("OK"));
    return app;
  }

  it("sets all required security headers", async () => {
    const app = makeApp();
    const res = await app.request("/test");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-xss-protection")).toBe("1; mode=block");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
  });

  it("sets HSTS when x-forwarded-proto is https", async () => {
    const app = makeApp();
    const res = await app.request("/test", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("does not set HSTS for plain http without x-forwarded-proto", async () => {
    const app = makeApp();
    // SERVER_URL is http://localhost:3099, CONFIG.isSecure is false
    const res = await app.request("/test");
    // HSTS should not be set for non-secure
    // (in dev mode SERVER_URL starts with http)
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});

describe("originCheck (CSRF)", () => {
  function makeApp() {
    const app = new Hono();
    app.use("*", originCheck);
    app.post("/api/test", (c) => c.text("OK"));
    app.get("/api/test", (c) => c.text("OK"));
    app.on("OPTIONS", "/api/test", (c) => c.text("OK"));
    app.on("HEAD", "/api/test", (c) => c.text("OK"));
    return app;
  }

  it("allows GET requests without origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("allows HEAD requests without origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("allows OPTIONS requests without origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", { method: "OPTIONS" });
    expect(res.status).toBe(200);
  });

  it("blocks POST with no Origin AND no Referer", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("blocks POST with foreign Origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        Origin: "https://evil.com",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("blocks POST with foreign Referer and no Origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        Referer: "https://evil.com/page",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("allows POST with valid Origin matching SERVER_URL", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3099",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("allows POST with valid Referer and no Origin", async () => {
    const app = makeApp();
    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        Referer: "http://localhost:3099/admin",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });
});

describe("rateLimit", () => {
  it("allows requests under the limit", async () => {
    const app = new Hono();
    app.use("*", rateLimit(3, 60_000));
    app.get("/test", (c) => c.text("OK"));

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/test", {
        headers: { "x-real-ip": "1.2.3.4" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("blocks requests over the limit", async () => {
    const app = new Hono();
    app.use("*", rateLimit(2, 60_000));
    app.get("/test", (c) => c.text("OK"));

    const ip = "10.99.99.1";
    await app.request("/test", { headers: { "x-real-ip": ip } });
    await app.request("/test", { headers: { "x-real-ip": ip } });
    const res = await app.request("/test", {
      headers: { "x-real-ip": ip },
    });
    expect(res.status).toBe(429);
  });

  it("uses x-forwarded-for when x-real-ip is absent", async () => {
    const app = new Hono();
    app.use("*", rateLimit(1, 60_000));
    app.get("/test", (c) => c.text("OK"));

    const ip = "10.50.50.50";
    await app.request("/test", {
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
    });
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
    });
    expect(res.status).toBe(429);
  });

  it("falls back to 'unknown' when no IP headers", async () => {
    const app = new Hono();
    app.use("*", rateLimit(1, 60_000));
    app.get("/test", (c) => c.text("OK"));

    // First request from "unknown" passes
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});

describe("auditLog", () => {
  it("logs JSON to console without throwing", () => {
    // Just verify it doesn't throw
    expect(() => auditLog("test_event", { key: "value" })).not.toThrow();
    expect(() => auditLog("simple_event")).not.toThrow();
  });
});
