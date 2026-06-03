export default [
  {
    test: {
      include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        all: true,
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80
        }
      }
    }
  }
];
