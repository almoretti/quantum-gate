import fs from "node:fs";
import path from "node:path";

export interface ServiceEntry {
  name: string;
  protected: boolean;
  discoveredAt: string;
}

export interface ApiExemption {
  host: string;
  pathPrefix: string;
  label: string;
  createdAt: string;
}

export interface LoginRecord {
  email: string;
  name: string;
  timestamp: string;
  ip: string;
}

export interface UserRecord {
  email: string;
  name: string;
  lastLogin: string;
  loginCount: number;
}

interface StoreData {
  services: Record<string, ServiceEntry>;
  admins: string[];
  users: Record<string, UserRecord>;
  recentLogins: LoginRecord[];
  apiExemptions: ApiExemption[];
}

const DEFAULT_EXEMPTIONS: ApiExemption[] = [
  {
    host: "*",
    pathPrefix: "/api/",
    label: "All API paths (legacy default)",
    createdAt: new Date().toISOString(),
  },
];

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "services.json");
const MAX_LOGINS = 100;

let data: StoreData = {
  services: {},
  admins: [],
  users: {},
  recentLogins: [],
  apiExemptions: [],
};

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      data = {
        services: {},
        admins: [],
        users: {},
        recentLogins: [],
        apiExemptions: [],
        ...raw,
      };
    } catch {
      console.error("[store] Failed to parse services.json, starting fresh");
    }
  }
  // Seed default exemptions if empty
  if (data.apiExemptions.length === 0) {
    data.apiExemptions = [...DEFAULT_EXEMPTIONS];
    persist();
  }
}

function persist() {
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

load();

// --- Services ---

export function getServices(): Record<string, ServiceEntry> {
  return { ...data.services };
}

export function isHostProtected(host: string): {
  known: boolean;
  protected: boolean;
} {
  const entry = data.services[host];
  if (!entry) return { known: false, protected: true };
  return { known: true, protected: entry.protected };
}

export function registerHost(host: string): ServiceEntry {
  if (data.services[host]) return data.services[host];
  const entry: ServiceEntry = {
    name: host.split(".")[0],
    protected: true,
    discoveredAt: new Date().toISOString(),
  };
  data.services[host] = entry;
  persist();
  return entry;
}

export function setProtection(host: string, isProtected: boolean): boolean {
  if (!data.services[host]) return false;
  data.services[host].protected = isProtected;
  persist();
  return true;
}

export function addService(host: string, name: string, isProtected: boolean) {
  data.services[host] = {
    name,
    protected: isProtected,
    discoveredAt: new Date().toISOString(),
  };
  persist();
}

export function removeService(host: string): boolean {
  if (!data.services[host]) return false;
  delete data.services[host];
  persist();
  return true;
}

export function updateServiceName(host: string, name: string): boolean {
  if (!data.services[host]) return false;
  data.services[host].name = name;
  persist();
  return true;
}

// --- Admins ---

export function isAdmin(email: string): boolean {
  return data.admins.includes(email);
}

export function getAdmins(): string[] {
  return [...data.admins];
}

export function addAdmin(email: string): boolean {
  if (data.admins.includes(email)) return false;
  data.admins.push(email);
  persist();
  return true;
}

export function removeAdmin(email: string): boolean {
  const idx = data.admins.indexOf(email);
  if (idx === -1) return false;
  data.admins.splice(idx, 1);
  persist();
  return true;
}

// --- Login log ---

export function recordLogin(email: string, name: string, ip: string) {
  // Update user record
  const existing = data.users[email];
  data.users[email] = {
    email,
    name,
    lastLogin: new Date().toISOString(),
    loginCount: (existing?.loginCount || 0) + 1,
  };

  // Append to recent logins log
  data.recentLogins.unshift({
    email,
    name,
    timestamp: new Date().toISOString(),
    ip,
  });
  if (data.recentLogins.length > MAX_LOGINS)
    data.recentLogins.length = MAX_LOGINS;
  persist();
}

export function getRecentLogins(): LoginRecord[] {
  return data.recentLogins;
}

// --- Users ---

export function getUsers(): Record<string, UserRecord> {
  return { ...data.users };
}

// --- API Exemptions ---

export function getApiExemptions(): ApiExemption[] {
  return [...data.apiExemptions];
}

/** Check if a host+uri combination is exempt from auth. */
export function isApiExempt(host: string, uri: string): boolean {
  return data.apiExemptions.some(
    (ex) =>
      (ex.host === "*" || ex.host === host) && uri.startsWith(ex.pathPrefix),
  );
}

export function addApiExemption(
  host: string,
  pathPrefix: string,
  label: string,
): boolean {
  const exists = data.apiExemptions.some(
    (e) => e.host === host && e.pathPrefix === pathPrefix,
  );
  if (exists) return false;
  data.apiExemptions.push({
    host,
    pathPrefix,
    label,
    createdAt: new Date().toISOString(),
  });
  persist();
  return true;
}

export function removeApiExemption(host: string, pathPrefix: string): boolean {
  const idx = data.apiExemptions.findIndex(
    (e) => e.host === host && e.pathPrefix === pathPrefix,
  );
  if (idx === -1) return false;
  data.apiExemptions.splice(idx, 1);
  persist();
  return true;
}
