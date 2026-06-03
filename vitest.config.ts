import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['packages/**/*.ts'],
      exclude: [
        'packages/**/*.spec.ts',
        'packages/**/*.d.ts',
        'packages/**/dist/**',
        'packages/**/node_modules/**'
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
        autoUpdate: false
      }
    }
  }
});
