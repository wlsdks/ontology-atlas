import type { FullConfig } from "@playwright/test";

/**
 * e2e 라우트 워밍업.
 *
 * Playwright 는 `pnpm dev`(Turbopack) 를 상대로 돈다 — 라우트를 **처음**
 * 열 때마다 온디맨드 컴파일이 걸려 수 초~수십 초가 소요된다. 그동안
 * `expect(...).toBeVisible()` 의 10초 타임아웃이 먼저 터져서, 제품이
 * 멀쩡한데도 스펙이 산발적으로 실패했다(같은 스펙이 9초 만에 전부
 * 통과하기도, 1.2분 걸리며 일부 실패하기도 했다).
 *
 * 여기서 주요 라우트를 한 번씩 미리 때려 컴파일을 끝내 두면, 실제 테스트는
 * 워밍된 서버를 상대하므로 결정론적으로 돈다. 실패해도 무시한다 — 워밍업은
 * 최적화이지 게이트가 아니다.
 */
const WARMUP_PATHS = [
  "/",
  "/en/",
  "/ko/topology/",
  "/en/topology/",
  "/ko/docs/",
  "/en/docs/",
  "/en/ontology/insights/",
  "/en/projects/",
  "/en/download/",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;
  for (const path of WARMUP_PATHS) {
    try {
      await fetch(new URL(path, baseURL), { redirect: "follow" });
    } catch {
      // 워밍업 실패는 무시 — 테스트 본체가 진짜 판정을 한다.
    }
  }
}
