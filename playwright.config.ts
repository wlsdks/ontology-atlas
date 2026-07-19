import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const webServerOrigin = new URL(baseURL).origin;
const webServerPort = new URL(baseURL).port || '3100';

export default defineConfig({
  testDir: './tests/e2e',
  // dev(Turbopack) 상대라 라우트 첫 진입은 온디맨드 컴파일을 기다린다 —
  // global-setup 이 주요 라우트를 미리 컴파일시키고, 그래도 남는 편차를
  // expect 타임아웃 15초로 흡수한다(10초일 때 산발 실패했다).
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  // CI 는 dev(Turbopack) 를 콜드 스타트로 상대한다 — 전체 스위트를 연달아
  // 돌리면 StrictMode 이중 마운트/하이드레이션 중복 렌더/온디맨드 재컴파일
  // 이 특정 스펙에 산발적 타이밍 실패를 낸다(제품 결함 아님 — 개별 실행은
  // 전부 통과, 정적 export 엔 없는 dev-only 아티팩트). 재시도로 환경 편차만
  // 흡수하고 리포트엔 flaky 로 남겨 숨기지 않는다. 진짜 회귀는 재시도 후에도
  // 실패한다. 로컬(retries 0)에서는 flakiness 를 그대로 노출한다.
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL,
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // R11 #24 — CI 에서 e2e 돌릴 때 dev server 자동 띄움. 로컬에선 이미
  // 띄운 dev (3100) 재사용. webServer 가 없으면 CI 가 baseURL 에 연결 못 함.
  webServer: {
    // R11 #24 — predev hook (docs-vault build) 까지 같이 도는 pnpm 진입점.
    // CI 에서 cold-start 부터 검증, 로컬에선 이미 띄운 dev 서버 재사용.
    command: `pnpm dev -p ${webServerPort}`,
    url: webServerOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
