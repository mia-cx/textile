import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // The e2e suite talks to a real test guild. PLAN.md: explicit opt-in, never in ordinary CI.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.test.ts'],
    testTimeout: 20_000,
    // Many test files drive more than one busy process (workerd isolates, a tsx server, PGlite),
    // and each worker holds about half a gigabyte. One worker per core, Vitest's default,
    // oversubscribes the machine by itself, pushing a shared machine into swap. Half the cores
    // ran the suite faster, not slower.
    maxWorkers: '50%',
    setupFiles: ['./vitest.setup.ts'],
  },
})
