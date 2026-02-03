import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Ensure Playwright browsers are installed in a deploy-packaged location.
// This avoids relying on per-user cache paths (e.g. ~/Library/Caches/ms-playwright)
// which are often missing in CI/serverless runtimes.
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" };

// If Playwright Core isn't installed (e.g. deps pruned), don't fail install step.
// Runtime PDF generation requires `playwright-core` to be present.
if (!existsSync("node_modules/playwright-core/cli.js")) {
  process.stdout.write(
    "[postinstall] playwright-core CLI not found at node_modules/playwright-core/cli.js; skipping browser install.\n"
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/playwright-core/cli.js", "install", "chromium"],
  { stdio: "inherit", env }
);

process.exit(result.status ?? 1);

