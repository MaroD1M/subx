import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '@@': fileURLToPath(new URL('.', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'tests/unit/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['node_modules/**', '.nuxt/**', '.output/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['server/**/*.test.ts', 'server/utils/__tests__/**', 'server/utils/pgWorker.cjs'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 34,
        branches: 29,
        functions: 38,
        lines: 35
      }
    }
  }
})
