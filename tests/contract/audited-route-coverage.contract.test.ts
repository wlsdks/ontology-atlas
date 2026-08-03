import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUDITED_ROUTES, EXCLUDED_ROUTES } from "../e2e/audited-routes";

/**
 * **접근성 게이트가 라우트를 놓치지 못하게 한다.**
 *
 * 이 계약이 있는 이유는 실제 사고다. 두 래칫(`a11y-ratchet` · `contrast-ratchet`)
 * 이 각자 손으로 쓴 라우트 배열을 갖고 있었고 — 8개와 5개 — 정본은 17개였다.
 * 어느 목록도 왜 그만큼인지 안 적었고, 빠진 자리에 **404 두 페이지의 AA 미달
 * (4.42:1)** 이 숨어 있었다. 기준선이 전부 0 이 됐지만 그 0 은 «8개 라우트의 0»
 * 이었다.
 *
 * 그래서 여기서 막는 것은 «위반» 이 아니라 **«분류되지 않은 라우트»** 다.
 * 라우트를 새로 만든 사람은 재든 빼든 **둘 중 하나를 고르게** 된다. 빼는 것도
 * 정당한 선택이고, 다만 이유를 `EXCLUDED_ROUTES` 에 남겨야 한다.
 *
 * ⚠️ 이 검사는 **파일 시스템을 읽는다.** 라우트 목록을 여기 복제하면 그
 * 복제본이 정본과 드리프트하는 순간 게이트가 사각지대를 만든다 — 그게 애초에
 * 이 파일이 존재하게 만든 그 병이다.
 */

const APP_LOCALE_DIR = path.resolve(__dirname, "../../app/[locale]");

/** `app/[locale]/**` 를 걸어 라우트 패턴을 뽑는다 — `page.tsx` 가 있는 디렉터리. */
function discoverRoutes(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const routePrefix = `${prefix}/${entry}`;
    if (readdirSync(full).includes("page.tsx")) found.push(routePrefix);
    found.push(...discoverRoutes(full, routePrefix));
  }
  return found;
}

/**
 * 라우트 패턴 → 래칫이 여는 URL 로 맞춰 본다. 동적 마디(`[slug]`)는 실제 값으로
 * 열리므로 문자 비교가 아니라 **모양 비교**를 한다.
 */
function matchesAuditedUrl(routePattern: string, url: string): boolean {
  const patternParts = `/ko${routePattern}`.split("/").filter(Boolean);
  const urlParts = url.split("/").filter(Boolean);
  if (patternParts.length !== urlParts.length) return false;
  return patternParts.every((part, i) =>
    part.startsWith("[") && part.endsWith("]") ? urlParts[i].length > 0 : part === urlParts[i],
  );
}

describe("접근성 래칫의 라우트 커버리지", () => {
  const routes = ["/", ...discoverRoutes(APP_LOCALE_DIR)];

  it("정본 인벤토리를 실제로 찾아낸다 — 탐지기가 빈 집합 위에서 놀지 않는다", () => {
    // 이 단언이 없으면 `discoverRoutes` 가 0개를 돌려줘도 아래 검사가 전부
    // 초록이다(빈 집합은 모든 全稱 명제를 만족한다). 정본은 17개다.
    expect(routes.length).toBeGreaterThanOrEqual(17);
    expect(routes).toContain("/topology");
    expect(routes).toContain("/git");
    expect(routes).toContain("/project/[slug]");
  });

  it("모든 라우트가 «잰다» 또는 «이유와 함께 뺀다» 로 분류돼 있다", () => {
    const unclassified = routes.filter(
      (route) =>
        !(route in EXCLUDED_ROUTES) &&
        !AUDITED_ROUTES.some((url) => matchesAuditedUrl(route, url)),
    );

    expect(
      unclassified,
      `접근성 래칫이 안 보는 라우트가 있다. 재려면 tests/e2e/audited-routes.ts 의 ` +
        `AUDITED_ROUTES 에 실제 URL 을 더하고, 안 잴 거면 EXCLUDED_ROUTES 에 ` +
        `**이유와 함께** 등재해라. 조용히 빠진 라우트와 의도적으로 뺀 라우트가 ` +
        `코드에서 구별되지 않으면 다음 사람이 같은 사각지대를 만든다.\n` +
        unclassified.map((r) => `  ${r}`).join("\n"),
    ).toEqual([]);
  });

  it("제외 목록에 죽은 항목이 없다 — 사라진 라우트의 사유는 오정보다", () => {
    const stale = Object.keys(EXCLUDED_ROUTES).filter((route) => !routes.includes(route));
    expect(stale, `EXCLUDED_ROUTES 가 없는 라우트를 가리킨다: ${stale.join(", ")}`).toEqual([]);
  });

  it("제외 사유가 비어 있지 않다", () => {
    for (const [route, reason] of Object.entries(EXCLUDED_ROUTES)) {
      expect(reason.trim().length, `${route} 의 제외 사유가 비었다`).toBeGreaterThan(10);
    }
  });

  it("404 를 로케일 안팎 두 주소에서 잰다", () => {
    // 2026-08-03 라운드가 AA 미달을 찾은 자리이고, 그때 래칫은 이 화면을 한 번도
    // 안 보고 있었다. 오늘 두 주소는 **같은 파일**(`app/not-found.tsx`)로 떨어진다
    // — 프로브로 확인했고 `audited-routes.ts` 에 근거가 있다. 그래도 둘 다 두는
    // 것은 not-found 배선이 바뀌었을 때 감사 안 된 표면이 조용히 들어오는 것을
    // 막기 위해서다.
    expect(AUDITED_ROUTES.some((url) => /^\/ko\/.*does-not-exist/.test(url))).toBe(true);
    expect(AUDITED_ROUTES.some((url) => /^\/[^/]*does-not-exist/.test(url))).toBe(true);
  });
});
