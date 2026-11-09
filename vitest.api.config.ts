import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 240_000,
    fileParallelism: false
  }
})
