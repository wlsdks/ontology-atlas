import { defineConfig } from "@playwright/test";

/**
 * Runs the probes in this folder against a server the script itself started. Unlike the suite's
 * `playwright.config.ts` there is no `webServer` and no `globalSetup`: the suite's setup warms
 * routes before a test, which is exactly the cold start the probe times.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.probe.ts",
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  outputDir: process.env.ATLAS_PROBE_DIR ? `${process.env.ATLAS_PROBE_DIR}/playwright-output` : "output/playwright/perf-probe",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL, headless: true, trace: "off", video: "off", screenshot: "off" },
});
