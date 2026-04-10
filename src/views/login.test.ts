import { describe, expect, it } from "vitest";
import { loginPageHtml } from "./login.js";

describe("loginPageHtml", () => {
  it("returns valid HTML with Google sign-in button", () => {
    const html = loginPageHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Sign in with Google");
    expect(html).toContain("/auth/google");
  });

  it("includes the allowed domain", () => {
    const html = loginPageHtml();
    expect(html).toContain("@quantum.media");
  });

  it("encodes redirect parameter in the Google URL", () => {
    const html = loginPageHtml("https://app.example.com/dashboard");
    expect(html).toContain("/auth/google?redirect=");
    expect(html).toContain(
      encodeURIComponent("https://app.example.com/dashboard"),
    );
  });

  it("omits redirect param when not provided", () => {
    const html = loginPageHtml();
    expect(html).toContain('href="/auth/google"');
  });

  it("omits redirect param for empty string", () => {
    const html = loginPageHtml("");
    expect(html).toContain('href="/auth/google"');
  });
});
