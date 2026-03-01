import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Ensure Playwright browsers are installed in a deploy-packaged location.
// This avoids relying on per-user cache paths (e.g. ~/Library/Caches/ms-playwright)
// which are often missing in CI/serverless runtimes.
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" };

// Prefer full Playwright CLI when available (keeps browser/channel set in sync),
// otherwise fall back to playwright-core.
const cliPath = existsSync("node_modules/playwright/cli.js")
  ? "node_modules/playwright/cli.js"
  : existsSync("node_modules/playwright-core/cli.js")
    ? "node_modules/playwright-core/cli.js"
    : null;

if (!cliPath) {
  process.stdout.write(
    "[postinstall] Playwright CLI not found; skipping browser install.\n"
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [cliPath, "install", "chromium", "chromium-headless-shell"],
  { stdio: "inherit", env }
);

process.exit(result.status ?? 1);

