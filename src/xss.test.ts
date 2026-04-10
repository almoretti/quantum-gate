import { describe, expect, it } from "vitest";

// Replicate the server-side esc function to test it
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

describe("XSS escaping", () => {
  it("escapes HTML special characters", () => {
    expect(esc("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes double quotes", () => {
    expect(esc('value" onclick="alert(1)')).toBe(
      "value&quot; onclick=&quot;alert(1)",
    );
  });

  it("escapes single quotes (prevents JS string breakout in onclick)", () => {
    expect(esc("x',true);alert('xss")).toBe("x&#39;,true);alert(&#39;xss");
  });

  it("escapes ampersands", () => {
    expect(esc("a&b")).toBe("a&amp;b");
  });

  it("handles combined attack strings", () => {
    const attack = `"><img src=x onerror=alert('xss')>`;
    const escaped = esc(attack);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("'");
  });
});
