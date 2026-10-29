import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      // json-summary/json feed the PR coverage comment in CI; html is uploaded as an artifact.
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportOnFailure: true,
      // Quality gate: CI fails if server coverage drops below these.
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 75 },
    },
  },
});
