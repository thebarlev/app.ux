import { defineConfig } from "@playwright/test";

/**
 * Node-level checks for the regulatory export. No browser and no server: these
 * build records in memory and measure them.
 *
 * Separate from playwright.config.ts on purpose — that one points at ./tests/e2e
 * and needs a running app.
 */
export default defineConfig({
  testDir: "./tests/regulatory",
  timeout: 30_000,
  reporter: [["list"]],
});
