import { defineConfig } from 'vitest/config';

// Run the platform's existing runtime regressions separately from the upstream
// CasMANGO suite. Angular's test builder also typechecks unrelated legacy specs.
export default defineConfig({test: {
  include: ['src/**/*.spec.ts'],
  environment: 'jsdom',
  setupFiles: ['tests/setup-platform.ts'],
  maxWorkers: 2,
}});
