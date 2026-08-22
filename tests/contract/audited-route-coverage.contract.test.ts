import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUDITED_ROUTES, EXCLUDED_ROUTES } from "../e2e/audited-routes";

/**
 * **Stops the accessibility gates from missing a route.**
 *
 * This contract exists because of a real incident. Two ratchets (`a11y-ratchet`
 * and `contrast-ratchet`) each carried a hand-written route array — 8 and 5 —
 * while the authoritative count at the time was 17. Neither list recorded why it
 * had that many, and hidden in the gap was **the two 404 pages' AA failure
 * (4.42:1)**. Every baseline reached 0, but that 0 was "0 across 8 routes".
 *
 * So what is blocked here is not a **violation** but an **unclassified route**.
 * Whoever adds a route must **choose**: measure it or exclude it. Excluding is a
 * legitimate choice, provided the reason is recorded in `EXCLUDED_ROUTES`.
 *
 * ⚠️ This check **reads the filesystem.** Duplicating the route list here would
 * create a blind spot the moment the copy drifts from the source — which is the
 * very disease that made this file necessary.
 */

const APP_LOCALE_DIR = path.resolve(__dirname, "../../app/[locale]");

/** Walks `app/[locale]/**` for route patterns — directories containing a `page.tsx`. */
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
 * Matches a route pattern against the URL a ratchet opens. A dynamic segment
 * (`[slug]`) is opened with a real value, so this compares **shape**, not text.
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
    // Without this assertion, `discoverRoutes` returning 0 would leave every check
    // below green (an empty set satisfies any universal statement). The current
    // authoritative count is 18.
    expect(routes.length).toBeGreaterThanOrEqual(18);
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
    // This is where the 2026-08-03 round found the AA failure, and at the time the
    // ratchet had never once looked at this screen. Today both addresses resolve to
    // **the same file** (`app/not-found.tsx`) — confirmed by probe, with the evidence
    // in `audited-routes.ts`. Both are kept anyway so that a change to the not-found
    // wiring cannot slip an unaudited surface back in.
    expect(AUDITED_ROUTES.some((url) => /^\/ko\/.*does-not-exist/.test(url))).toBe(true);
    expect(AUDITED_ROUTES.some((url) => /^\/[^/]*does-not-exist/.test(url))).toBe(true);
  });
});
