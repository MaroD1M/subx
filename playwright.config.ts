import { defineConfig, devices } from '@playwright/test'

const productionMode = process.env.PLAYWRIGHT_PRODUCTION === '1'
const serverCommand = productionMode
  ? 'node tests/e2e/prepare-env.mjs && node .output/server/index.mjs'
  : 'node tests/e2e/prepare-env.mjs && ./node_modules/.bin/nuxt dev --port 3100 --host 127.0.0.1'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {})
  },
  webServer: {
    command: serverCommand,
    port: 3100,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      DB_PATH: './.test-artifacts/subx.db',
      VIDEO_DIR: './.test-artifacts/media',
      SUBX_SECRET_KEY: 'playwright-test-secret',
      NODE_ENV: 'development',
      NUXT_DEVTOOLS: 'false',
      PORT: '3100',
      HOST: '127.0.0.1',
      NITRO_PORT: '3100',
      NITRO_HOST: '127.0.0.1'
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } }
  ]
})
