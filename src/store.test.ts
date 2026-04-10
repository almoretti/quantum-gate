import { describe, expect, it } from "vitest";
import {
  addAdmin,
  addApiExemption,
  addService,
  getAdmins,
  getApiExemptions,
  getRecentLogins,
  getServices,
  getUsers,
  isAdmin,
  isApiExempt,
  isHostProtected,
  recordLogin,
  registerHost,
  removeAdmin,
  removeApiExemption,
  removeService,
  setProtection,
  updateServiceName,
} from "./store.js";

describe("API Exemptions", () => {
  it("has default /api/ exemption seeded", () => {
    const exemptions = getApiExemptions();
    expect(
      exemptions.some((e) => e.pathPrefix === "/api/" && e.host === "*"),
    ).toBe(true);
  });

  it("matches wildcard host exemption for all /api/ paths", () => {
    expect(isApiExempt("anything.example.com", "/api/v1/deployments")).toBe(
      true,
    );
    expect(isApiExempt("other.host", "/api/v2/something")).toBe(true);
    expect(isApiExempt("other.host", "/api/")).toBe(true);
  });

  it("does not match non-exempt paths", () => {
    expect(isApiExempt("anything.example.com", "/admin")).toBe(false);
    expect(isApiExempt("anything.example.com", "/dashboard")).toBe(false);
    expect(isApiExempt("anything.example.com", "/")).toBe(false);
  });

  it("can add and remove a specific host exemption", () => {
    const added = addApiExemption("myapp.example.com", "/webhook", "Webhooks");
    expect(added).toBe(true);

    expect(isApiExempt("myapp.example.com", "/webhook/stripe")).toBe(true);
    expect(isApiExempt("other.example.com", "/webhook/stripe")).toBe(false);

    const removed = removeApiExemption("myapp.example.com", "/webhook");
    expect(removed).toBe(true);

    expect(isApiExempt("myapp.example.com", "/webhook/stripe")).toBe(false);
  });

  it("rejects duplicate exemptions", () => {
    addApiExemption("dup.example.com", "/test", "Test");
    const second = addApiExemption("dup.example.com", "/test", "Test");
    expect(second).toBe(false);
    removeApiExemption("dup.example.com", "/test");
  });

  it("returns false when removing non-existent exemption", () => {
    expect(removeApiExemption("nonexistent.com", "/nope")).toBe(false);
  });
});

describe("Services", () => {
  const TEST_HOST = "test-svc.example.com";

  it("getServices returns a copy of services", () => {
    const services = getServices();
    expect(typeof services).toBe("object");
  });

  it("registerHost auto-registers and returns entry", () => {
    const entry = registerHost(TEST_HOST);
    expect(entry.name).toBe("test-svc");
    expect(entry.protected).toBe(true);
    expect(entry.discoveredAt).toBeTruthy();
  });

  it("registerHost is idempotent", () => {
    const first = registerHost(TEST_HOST);
    const second = registerHost(TEST_HOST);
    expect(first.discoveredAt).toBe(second.discoveredAt);
  });

  it("isHostProtected returns known=true for registered host", () => {
    const status = isHostProtected(TEST_HOST);
    expect(status.known).toBe(true);
    expect(status.protected).toBe(true);
  });

  it("isHostProtected returns known=false for unknown host", () => {
    const status = isHostProtected("unknown-host.example.com");
    expect(status.known).toBe(false);
    expect(status.protected).toBe(true);
  });

  it("setProtection toggles protection", () => {
    expect(setProtection(TEST_HOST, false)).toBe(true);
    expect(isHostProtected(TEST_HOST).protected).toBe(false);

    expect(setProtection(TEST_HOST, true)).toBe(true);
    expect(isHostProtected(TEST_HOST).protected).toBe(true);
  });

  it("setProtection returns false for unknown host", () => {
    expect(setProtection("nonexistent.host", false)).toBe(false);
  });

  it("addService creates a new service entry", () => {
    addService("new-svc.example.com", "New Service", false);
    const status = isHostProtected("new-svc.example.com");
    expect(status.known).toBe(true);
    expect(status.protected).toBe(false);
  });

  it("updateServiceName updates name", () => {
    expect(updateServiceName(TEST_HOST, "Renamed")).toBe(true);
    const services = getServices();
    expect(services[TEST_HOST].name).toBe("Renamed");
  });

  it("updateServiceName returns false for unknown host", () => {
    expect(updateServiceName("nonexistent.host", "Name")).toBe(false);
  });

  it("removeService removes a service", () => {
    expect(removeService(TEST_HOST)).toBe(true);
    expect(isHostProtected(TEST_HOST).known).toBe(false);
  });

  it("removeService returns false for unknown host", () => {
    expect(removeService("nonexistent.host")).toBe(false);
  });

  // cleanup
  it("cleanup new-svc", () => {
    removeService("new-svc.example.com");
  });
});

describe("Admins", () => {
  const TEST_EMAIL = "testadmin@quantum.media";

  it("addAdmin adds an admin", () => {
    expect(addAdmin(TEST_EMAIL)).toBe(true);
    expect(isAdmin(TEST_EMAIL)).toBe(true);
  });

  it("addAdmin returns false for duplicate", () => {
    expect(addAdmin(TEST_EMAIL)).toBe(false);
  });

  it("getAdmins includes the added admin", () => {
    expect(getAdmins()).toContain(TEST_EMAIL);
  });

  it("removeAdmin removes an admin", () => {
    expect(removeAdmin(TEST_EMAIL)).toBe(true);
    expect(isAdmin(TEST_EMAIL)).toBe(false);
  });

  it("removeAdmin returns false for non-admin", () => {
    expect(removeAdmin("nobody@quantum.media")).toBe(false);
  });
});

describe("Login recording and Users", () => {
  it("recordLogin creates a user record and recent login", () => {
    recordLogin("user1@quantum.media", "User One", "1.2.3.4");
    const users = getUsers();
    expect(users["user1@quantum.media"]).toBeDefined();
    expect(users["user1@quantum.media"].loginCount).toBe(1);
    expect(users["user1@quantum.media"].name).toBe("User One");
  });

  it("recordLogin increments login count on repeat", () => {
    recordLogin("user1@quantum.media", "User One", "1.2.3.4");
    const users = getUsers();
    expect(users["user1@quantum.media"].loginCount).toBe(2);
  });

  it("getRecentLogins returns login records", () => {
    const logins = getRecentLogins();
    expect(logins.length).toBeGreaterThanOrEqual(2);
    expect(logins[0].email).toBe("user1@quantum.media");
    expect(logins[0].ip).toBe("1.2.3.4");
  });

  it("getUsers returns a copy", () => {
    const users = getUsers();
    expect(typeof users).toBe("object");
    expect(users["user1@quantum.media"]).toBeDefined();
  });
});
