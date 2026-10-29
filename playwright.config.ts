import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Written by scripts/postbuild.mjs: the base path `out/` was built for.
const recordedBasePath = '.next/export-base-path';

// Tests run against the production static export in `out/`, served the way
// GitHub Pages serves it: clean URLs and a configurable base path.
const port = Number(process.env.SITE_TEST_PORT ?? 4324);
const basePath = (
  process.env.LIVESHOW_BASE_PATH ?? (existsSync(recordedBasePath) ? readFileSync(recordedBasePath, 'utf8') : '')
)
  .trim()
  .replace(/\/$/, '');
const chromePath = process.env.VISDELTA_CHROME_PATH;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: 'retain-on-failure',
    launchOptions: chromePath ? { executablePath: chromePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `node scripts/serve-out.mjs ${port}`,
    url: `http://127.0.0.1:${port}${basePath}/`,
    reuseExistingServer: !process.env.CI,
  },
});
