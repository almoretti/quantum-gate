import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const testDataDir = path.join(os.tmpdir(), "quantum-gate-test-data");

// Clean test data before each run so seeds are fresh
if (fs.existsSync(testDataDir)) {
  fs.rmSync(testDataDir, { recursive: true });
}

export default defineConfig({
  test: {
    env: {
      DATA_DIR: testDataDir,
    },
  },
});
