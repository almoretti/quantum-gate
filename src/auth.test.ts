import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isSafeRedirect, parseSession, setupAuthRoutes } from "./auth.js";
import { CONFIG } from "./config.js";

// Mock recordLogin to avoid file system writes during auth tests
vi.mock("./store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store.js")>();
  return { ...actual, recordLogin: vi.fn() };
});

describe("isSafeRedirect", () => {
  it("allows relative paths", () => {
    expect(isSafeRedirect("/admin")).toBe(true);
    expect(isSafeRedirect("/some/deep/path?q=1")).toBe(true);
  });

  it("blocks protocol-relative URLs (//evil.com)", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/path")).toBe(false);
  });

  it("blocks absolute URLs to external domains", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("https://evil.com/steal")).toBe(false);
    expect(isSafeRedirect("http://phishing.site/login")).toBe(false);
  });

  it("blocks javascript: URIs", () => {
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
  });

  it("blocks data: URIs", () => {
    expect(isSafeRedirect("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });

  it("blocks empty string", () => {
    expect(isSafeRedirect("")).toBe(false);
  });

  it("allows same-origin URLs matching SERVER_URL hostname", () => {
    expect(isSafeRedirect("http://localhost:3099/admin")).toBe(true);
  });

  it("allows different ports on same host (cookies are shared across ports)", () => {
    expect(isSafeRedirect("http://localhost:9999/admin")).toBe(true);
  });

  it("blocks URLs that look similar but aren't the same origin", () => {
    expect(isSafeRedirect("http://localhost.evil.com:3099/admin")).toBe(false);
  });
});

describe("Auth routes", () => {
  function makeApp() {
    const app = new Hono();
    setupAuthRoutes(app);
    return app;
  }

  describe("GET /auth/login", () => {
    it("returns the login page HTML", async () => {
      const app = makeApp();
      const res = await app.request("/auth/login");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Sign in");
      expect(html).toContain("Google");
    });

    it("passes redirect param through to login page", async () => {
      const app = makeApp();
      const res = await app.request(
        "/auth/login?redirect=https://example.com",
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("/auth/google");
    });
  });

  describe("GET /auth/google", () => {
    it("redirects to Google OAuth", async () => {
      const app = makeApp();
      const res = await app.request("/auth/google", { redirect: "manual" });
      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      expect(location).toContain("accounts.google.com");
      expect(location).toContain("client_id=");
      expect(location).toContain("state=");
    });

    it("includes redirect in state", async () => {
      const app = makeApp();
      const res = await app.request("/auth/google?redirect=/dashboard", {
        redirect: "manual",
      });
      expect(res.status).toBe(302);
    });
  });

  describe("GET /auth/callback", () => {
    it("returns 400 when code is missing", async () => {
      const app = makeApp();
      const res = await app.request("/auth/callback?state=abc");
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Missing code or state");
    });

    it("returns 400 when state is missing", async () => {
      const app = makeApp();
      const res = await app.request("/auth/callback?code=abc");
      expect(res.status).toBe(400);
    });

    it("returns 403 for invalid state", async () => {
      const app = makeApp();
      const res = await app.request(
        "/auth/callback?code=abc&state=invalid-state",
      );
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Invalid or expired state");
    });

    // Integration test with mocked Google fetch
    describe("with mocked Google API", () => {
      const originalFetch = globalThis.fetch;

      beforeAll(() => {
        globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes("oauth2.googleapis.com/token")) {
            return new Response(
              JSON.stringify({ access_token: "mock-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (urlStr.includes("googleapis.com/oauth2/v2/userinfo")) {
            return new Response(
              JSON.stringify({
                email: "test@quantum.media",
                name: "Test User",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return originalFetch(url as any);
        }) as typeof fetch;
      });

      afterAll(() => {
        globalThis.fetch = originalFetch;
      });

      it("completes OAuth flow and sets cookie", async () => {
        const app = makeApp();

        // Step 1: Start OAuth to get a state token
        const googleRes = await app.request("/auth/google", {
          redirect: "manual",
        });
        const location = googleRes.headers.get("location") || "";
        const stateMatch = location.match(/state=([^&]+)/);
        expect(stateMatch).toBeTruthy();
        const state = stateMatch![1];

        // Step 2: Simulate callback with the valid state
        const callbackRes = await app.request(
          `/auth/callback?code=mock-code&state=${state}`,
          { redirect: "manual" },
        );
        expect(callbackRes.status).toBe(302);
        // Should set a session cookie
        const setCookieHeader = callbackRes.headers.get("set-cookie") || "";
        expect(setCookieHeader).toContain(CONFIG.COOKIE_NAME);
      });

      it("rejects users from wrong domain", async () => {
        // Override mock to return wrong-domain user
        globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes("oauth2.googleapis.com/token")) {
            return new Response(
              JSON.stringify({ access_token: "mock-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (urlStr.includes("googleapis.com/oauth2/v2/userinfo")) {
            return new Response(
              JSON.stringify({
                email: "hacker@evil.com",
                name: "Hacker",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return originalFetch(url as any);
        }) as typeof fetch;

        const app = makeApp();
        const googleRes = await app.request("/auth/google", {
          redirect: "manual",
        });
        const state = googleRes
          .headers.get("location")!
          .match(/state=([^&]+)/)![1];

        const callbackRes = await app.request(
          `/auth/callback?code=mock-code&state=${state}`,
        );
        expect(callbackRes.status).toBe(403);
        const html = await callbackRes.text();
        expect(html).toContain("Access Denied");
      });

      it("returns 502 when Google token exchange fails", async () => {
        globalThis.fetch = vi.fn(async () => {
          return new Response("error", { status: 400 });
        }) as typeof fetch;

        const app = makeApp();
        const googleRes = await app.request("/auth/google", {
          redirect: "manual",
        });
        const state = googleRes
          .headers.get("location")!
          .match(/state=([^&]+)/)![1];

        const callbackRes = await app.request(
          `/auth/callback?code=mock-code&state=${state}`,
        );
        expect(callbackRes.status).toBe(502);
      });

      it("returns 502 when Google userinfo fails", async () => {
        globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes("oauth2.googleapis.com/token")) {
            return new Response(
              JSON.stringify({ access_token: "mock-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("error", { status: 500 });
        }) as typeof fetch;

        const app = makeApp();
        const googleRes = await app.request("/auth/google", {
          redirect: "manual",
        });
        const state = googleRes
          .headers.get("location")!
          .match(/state=([^&]+)/)![1];

        const callbackRes = await app.request(
          `/auth/callback?code=mock-code&state=${state}`,
        );
        expect(callbackRes.status).toBe(502);
      });

      it("returns 500 when callback throws", async () => {
        globalThis.fetch = vi.fn(async () => {
          throw new Error("network error");
        }) as typeof fetch;

        const app = makeApp();
        const googleRes = await app.request("/auth/google", {
          redirect: "manual",
        });
        const state = googleRes
          .headers.get("location")!
          .match(/state=([^&]+)/)![1];

        const callbackRes = await app.request(
          `/auth/callback?code=mock-code&state=${state}`,
        );
        expect(callbackRes.status).toBe(500);
      });
    });
  });

  describe("GET /auth/logout", () => {
    it("clears cookie and redirects to login", async () => {
      const app = makeApp();
      const res = await app.request("/auth/logout", { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/auth/login");
      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain(CONFIG.COOKIE_NAME);
      expect(setCookie).toContain("Max-Age=0");
    });
  });
});

describe("parseSession", () => {
  it("returns null when no cookie", async () => {
    const app = new Hono();
    app.get("/test", async (c) => {
      const session = await parseSession(c);
      return c.json({ session });
    });
    const res = await app.request("/test");
    const body = await res.json();
    expect(body.session).toBeNull();
  });

  it("returns user data from valid JWT", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { email: "test@quantum.media", name: "Test", iat: now, exp: now + 3600 },
      CONFIG.JWT_SECRET,
    );

    const app = new Hono();
    app.get("/test", async (c) => {
      const session = await parseSession(c);
      return c.json({ session });
    });

    const res = await app.request("/test", {
      headers: { Cookie: `${CONFIG.COOKIE_NAME}=${token}` },
    });
    const body = await res.json();
    expect(body.session.email).toBe("test@quantum.media");
    expect(body.session.name).toBe("Test");
  });

  it("returns null for invalid JWT", async () => {
    const app = new Hono();
    app.get("/test", async (c) => {
      const session = await parseSession(c);
      return c.json({ session });
    });

    const res = await app.request("/test", {
      headers: { Cookie: `${CONFIG.COOKIE_NAME}=invalid-garbage-token` },
    });
    const body = await res.json();
    expect(body.session).toBeNull();
  });
});
