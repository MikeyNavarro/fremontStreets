import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: ['production.spec.ts', 'study.spec.ts', 'redesign.spec.ts'],
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results-production',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179/fremontStreets/',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node scripts/serve-production.mjs',
    url: 'http://127.0.0.1:4179/fremontStreets/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
