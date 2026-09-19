import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: externalBaseUrl || "http://127.0.0.1:3000",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl ? undefined : {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
