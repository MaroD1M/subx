import { defineConfig, devices } from '@playwright/test'

// Each Playwright worker owns an isolated Nuxt/Nitro server (see tests/e2e/fixtures.ts).
// The fixture allocates its own artifacts directory, SQLite DB and media root, so workers
// never share database or media state. `workers` can be overridden with SUBX_E2E_WORKERS.
//
// Nuxt dev refuses to run two dev servers from the same project directory (its lock file
// explicitly warns that parallel runs corrupt the shared .nuxt output), so local dev mode
// stays at 1 worker. CI uses PLAYWRIGHT_PRODUCTION=1 against independent .output servers.
const productionMode = process.env.PLAYWRIGHT_PRODUCTION === '1'
const workerCount = Number(process.env.SUBX_E2E_WORKERS || (productionMode ? 2 : 1))

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
    timeout: 10_000
  },
  fullyParallel: false,
  workers: workerCount,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {})
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }
  ]
})
