import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        test: {
          include: ['**/*.test.ts', '**/*.spec.ts'],
          environment: 'node'
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        'packages/**/src/**/*.spec.ts',
        'packages/**/src/**/*.test.ts',
        'packages/**/src/**/*.d.ts',
        'dist/**',
        'node_modules/**'
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
