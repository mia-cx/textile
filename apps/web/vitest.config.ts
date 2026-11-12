import { defineConfig } from 'vitest/config'

// The tests drive the built Worker's SvelteKit server (`pnpm build` first; `pnpm site:check` at the root does both),
// so they cover the hooks, routes, and pages as deployed.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
