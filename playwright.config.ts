import { defineConfig } from "@playwright/test";

const PORT = 3199;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && node tests/e2e/server.ts`,
    url: `http://127.0.0.1:${PORT}/login`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
