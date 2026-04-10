import { describe, expect, it } from "vitest";

/**
 * Direct unit test of the cookie-domain matching logic used in isSafeRedirect.
 * This tests the algorithm independently of CONFIG so we can verify production
 * scenarios (COOKIE_DOMAIN=.marketing.qih-tech.com) in the dev environment.
 */
function matchesCookieDomain(hostname: string, cookieDomain: string): boolean {
  if (!cookieDomain) return false;
  const bare = cookieDomain.startsWith(".")
    ? cookieDomain.slice(1)
    : cookieDomain;
  return hostname === bare || hostname.endsWith(cookieDomain);
}

describe("cookie domain matching (production scenarios)", () => {
  const COOKIE_DOMAIN = ".marketing.qih-tech.com";

  it("matches the bare domain: marketing.qih-tech.com", () => {
    expect(matchesCookieDomain("marketing.qih-tech.com", COOKIE_DOMAIN)).toBe(
      true,
    );
  });

  it("matches subdomains: cake.marketing.qih-tech.com", () => {
    expect(
      matchesCookieDomain("cake.marketing.qih-tech.com", COOKIE_DOMAIN),
    ).toBe(true);
  });

  it("matches subdomains: auth.marketing.qih-tech.com", () => {
    expect(
      matchesCookieDomain("auth.marketing.qih-tech.com", COOKIE_DOMAIN),
    ).toBe(true);
  });

  it("matches deep subdomains: a.b.marketing.qih-tech.com", () => {
    expect(
      matchesCookieDomain("a.b.marketing.qih-tech.com", COOKIE_DOMAIN),
    ).toBe(true);
  });

  it("rejects unrelated domains", () => {
    expect(matchesCookieDomain("evil.com", COOKIE_DOMAIN)).toBe(false);
    expect(
      matchesCookieDomain("notmarketing.qih-tech.com", COOKIE_DOMAIN),
    ).toBe(false);
  });

  it("rejects lookalike domains", () => {
    expect(
      matchesCookieDomain("fakemarketing.qih-tech.com", COOKIE_DOMAIN),
    ).toBe(false);
  });

  it("returns false for empty cookie domain", () => {
    expect(matchesCookieDomain("anything.com", "")).toBe(false);
  });
});
