import { defineConfig } from 'vitest/config'

/** Server tests on the one test database (`test-db.ts`) truncate it, so they run one file at a time. */
const DB_TESTS = ['apps/server/src/app.test.ts', 'apps/server/src/workshop.test.ts']

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'], exclude: DB_TESTS } },
      { test: { name: 'db', include: DB_TESTS, fileParallelism: false } },
    ],
  },
})
