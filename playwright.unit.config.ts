import { defineConfig } from "@playwright/test"

/**
 * Node-level unit tests. Separate from playwright.config.ts on purpose: that one
 * points at tests/e2e with a baseURL and expects a running app, and these assert
 * pure functions with no browser, no server and no environment.
 *
 * Kept as a second config rather than a second project in the first so that
 * `npm run test:e2e` keeps meaning exactly what it means today.
 */
export default defineConfig({
  testDir: "./tests/unit",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
})
