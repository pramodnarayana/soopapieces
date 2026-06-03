import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'e2e',
      include: ['packages/**/*.e2e.spec.ts'],
      environment: 'node',
      // We do not mock fetch in e2e tests
      setupFiles: [],
      testTimeout: 30000,
    },
  }
]);
