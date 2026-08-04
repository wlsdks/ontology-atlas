import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUDITED_ROUTES, EXCLUDED_ROUTES } from "../e2e/audited-routes";

/**
 * 대비 스윕이 **접근성 래칫보다 좁아지지 못하게** 못박는다.
 *
 * ## 왜 이 계약이 생겼나 (2026-08-04 감사)
 *
 * `scripts/measure-contrast.mjs` 의 기본 라우트가 다섯 줄이었고, 주석은 그것을
 * *"사람이 실제로 오래 보는 표면들"* 이라고 불렀다. 그 주관적 기준이 빼놓은
 * 화면 중에는 **`/ko/ontology/insights`** — 이 앱에서 데이터 마크가 가장
 * 조밀한 화면 — 이 있었다. 재 보니 미달은 0이었지만, **재지 않은 화면은
 * 통과한 화면이 아니다.** 안 잰 초록과 깨끗한 초록이 구별되지 않는 상태였다.
 *
 * 같은 실패가 이미 한 번 있었다: `audited-routes.ts` 의 docstring 이 기록한
 * 2026-08-03 사고 — 두 래칫이 각자 손으로 쓴 부분집합을 갖고 있었고, 그 사각에
 * 숨어 있던 4.42:1 이 릴리스 직전에야 나왔다. 그때 만든 답이 «단일 출처 +
 * 제외는 이유와 함께» 였고, 대비 스윕만 그 답 밖에 남아 있었다.
 *
 * 그래서 판정 기준은 「목록이 길다」가 아니라 **「`AUDITED_ROUTES` 를 하나도
 * 빠뜨리지 않는다」**다. 라우트가 늘면 `audited-route-coverage` 계약이 먼저
 * 터지고, 그다음 여기가 터진다.
 */
const HARNESS = join(process.cwd(), "scripts/measure-contrast.mjs");

function harnessRoutes(): string[] {
  const source = readFileSync(HARNESS, "utf8");
  const block = /export const DEFAULT_ROUTES = \[([\s\S]*?)\];/.exec(source);
  if (!block) throw new Error("measure-contrast.mjs 에서 DEFAULT_ROUTES 를 못 찾았다");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const normalize = (route: string) => (route.endsWith("/") ? route : `${route}/`);

describe("대비 스윕 커버리지", () => {
  it("감사 대상 라우트를 하나도 빠뜨리지 않는다", () => {
    const swept = new Set(harnessRoutes().map(normalize));
    const missing = AUDITED_ROUTES.map(normalize).filter((route) => !swept.has(route));
    expect(missing, `대비를 안 재는 라우트: ${missing.join(", ")}`).toEqual([]);
  });

  it("제외한 라우트는 스윕에도 없다 — 제외 사유가 두 곳에서 어긋나지 않게", () => {
    const swept = new Set(harnessRoutes().map(normalize));
    const leaked = Object.keys(EXCLUDED_ROUTES)
      .map(normalize)
      .filter((route) => swept.has(route));
    expect(leaked, `제외 라우트인데 스윕에 있다: ${leaked.join(", ")}`).toEqual([]);
  });

  /**
   * 검출기가 **빈 집합 위에서 돌고 있지 않은지** 확인한다(`/gate-probe`).
   * 정규식이 조용히 안 맞으면 위 두 단언은 «빠진 게 없다» 로 초록이 된다.
   */
  it("하네스에서 라우트를 실제로 읽어 온다", () => {
    expect(harnessRoutes().length).toBeGreaterThanOrEqual(AUDITED_ROUTES.length);
  });
});
