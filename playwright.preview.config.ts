import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/preview',
  outputDir: './.test-artifacts/preview-results',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'off',
    screenshot: 'off',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {})
  },
  webServer: {
    command: 'node tests/e2e/prepare-env.mjs && ./node_modules/.bin/nuxt dev --port 3100 --host 127.0.0.1',
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
      NUXT_DEVTOOLS: 'false'
    }
  },
  projects: [
    {
      name: 'chromium-preview',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1.5
      }
    }
  ]
})
