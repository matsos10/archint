import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/tax-engine/test/**/*.test.ts', 'packages/ai/test/**/*.test.ts', 'packages/core/test/unit/**/*.test.ts', 'apps/**/test/unit/**/*.test.ts', 'fixtures/test/unit/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./test/setup-env.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/core/test/integration/**/*.test.ts', 'packages/db/test/**/*.test.ts', 'apps/**/test/integration/**/*.test.ts', 'fixtures/test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['./test/global-setup.ts'],
          setupFiles: ['./test/setup-env.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
