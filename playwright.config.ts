import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // R11 #24 — CI 에서 e2e 돌릴 때 dev server 자동 띄움. 로컬에선 이미
  // 띄운 dev (3100) 재사용. webServer 가 없으면 CI 가 baseURL 에 연결 못 함.
  webServer: {
    // R11 #24 — predev hook (docs-vault build) 까지 같이 도는 pnpm 진입점.
    // CI 에서 cold-start 부터 검증, 로컬에선 이미 띄운 dev (3100) 재사용.
    command: 'pnpm dev -p 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
