import { describe, expect, it } from "vitest";
import { CONFIG, validateConfig } from "./config.js";

describe("CONFIG", () => {
  it("loads PORT from env", () => {
    expect(CONFIG.PORT).toBe(3099);
  });

  it("loads SERVER_URL from env", () => {
    expect(CONFIG.SERVER_URL).toBe("http://localhost:3099");
  });

  it("has correct defaults", () => {
    expect(CONFIG.ALLOWED_DOMAIN).toBe("quantum.media");
    expect(CONFIG.COOKIE_NAME).toBe("qm_session");
    expect(CONFIG.COOKIE_MAX_AGE).toBe(86400);
  });

  it("isDev is derived from NODE_ENV", () => {
    expect(typeof CONFIG.isDev).toBe("boolean");
    expect(CONFIG.isDev).toBe(CONFIG.NODE_ENV === "development");
  });

  it("isSecure returns false for http SERVER_URL", () => {
    expect(CONFIG.isSecure).toBe(false);
  });
});

describe("validateConfig", () => {
  it("does not throw with valid config", () => {
    expect(() => validateConfig()).not.toThrow();
  });
});
