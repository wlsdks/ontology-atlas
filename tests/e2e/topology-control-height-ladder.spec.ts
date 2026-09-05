import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * The map's controls stand on the **control-height ladder**, and the ladder is
 * measured on the rendered box.
 *
 * **Why this layer and not the two that already exist.**
 * `control-class.contract.test.ts` measures the string `controlClass()` emits, and
 * `control-height-ladder-scope.contract.test.ts` measures the CSS dimension tokens.
 * Between them sits the case that produced every finding below: **a height nobody
 * wrote.** `px-3 py-2` around an 18px line box is 38px, and a `shape: "row"` whose
 * floor is 36 measured 42 because a 26px glyph box plus `py-2` overshot the floor.
 * No string and no token carries either number, so neither existing gate can see
 * them — only layout can.
 *
 * Inventory at switch-on (2026-09-05, 1440×900 fine pointer, sample vault):
 *
 * | Control | Before | After |
 * |---|---:|---:|
 * | `topology-index-fold` | **42** | 36 |
 * | search palette result row | **38** | 40 |
 * | INDEX tree row floor | `min-h-[34px]` | `min-h-9` (36) |
 * | INDEX row chevron | **22×34** fixed | stretches to the row |
 *
 * The roster is named rather than swept: a sweep over every control on the route
 * would have to encode every legitimate content-driven exemption (the nav rail's
 * 62px outer height, a two-line tree row's 47.5) and would become a list of
 * excuses. Every name here is a control whose height its own padding decides, and
 * the roster guard below fails if any of them stops rendering.
 */

/** Derived from the ladder tokens at runtime, exactly as the token contract derives it. */
async function ladder(page: Page): Promise<number[]> {
  const steps = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const px = (name: string) => Number.parseFloat(cs.getPropertyValue(name));
    return [24, px("--control-h-sm"), px("--control-h-md"), px("--chrome-tile-size"), px("--control-h-lg"), px("--touch-target-min")];
  });
  return [...new Set(steps)].sort((a, b) => a - b);
}

async function openMap(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "storefront");
    window.sessionStorage.setItem("demo:first-run-starter-dismissed:v1", "1");
  });
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("topology-index-panel")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
}

/** Height of the first rendered element for each roster entry. */
async function heights(page: Page, roster: readonly string[]) {
  return page.evaluate((ids) => {
    const out: Record<string, number | null> = {};
    for (const id of ids) {
      const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find(
        (candidate) => candidate.getBoundingClientRect().height > 0,
      );
      out[id] = el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
    }
    return out;
  }, roster as string[]);
}

/** Single-line controls whose height comes from their own padding, not their content. */
const MAP_ROSTER = [
  "topology-index-fold",
  "topology-index-search",
  "topology-index-segment-all",
  "topology-index-segment-recent",
] as const;

test("지도 INDEX 컨트롤 높이가 전부 사다리 위 단계다", async ({ page }) => {
  test.setTimeout(90_000);
  await openMap(page, 1440, 900);
  const steps = await ladder(page);
  expect(steps, "사다리를 토큰에서 파생하지 못했다").toEqual([24, 28, 32, 36, 40, 44]);

  const measured = await heights(page, MAP_ROSTER);
  // An idling roster is the same as no gate: every name must actually render.
  for (const id of MAP_ROSTER) {
    expect(measured[id], `${id} 가 렌더되지 않았다 — 명단이 헛돌고 있다`).not.toBeNull();
  }
  const offenders = Object.entries(measured)
    .filter(([, h]) => h !== null && !steps.includes(h))
    .map(([id, h]) => `${id}=${h}px`);
  expect(offenders, "사다리 밖 높이. 축을 늘리지 말고 가장 가까운 단계로 보내라.").toEqual([]);
});

test("검색 팔레트 결과 행이 사다리 위 단계다", async ({ page }) => {
  test.setTimeout(90_000);
  await openMap(page, 1440, 900);
  const steps = await ladder(page);

  await page.getByTestId("topology-concept-search").click();
  const rows = page.locator("[cmdk-item]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });

  const measured = await page.evaluate(() =>
    [...document.querySelectorAll("[cmdk-item]")]
      .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10)
      .filter((h) => h > 0),
  );
  expect(measured.length, "결과 행을 하나도 못 쟀다").toBeGreaterThan(3);
  expect([...new Set(measured)].filter((h) => !steps.includes(h)), "결과 행 높이").toEqual([]);
});

test.describe("coarse 포인터", () => {
  test.use({ hasTouch: true });

  test("검색 팔레트 결과 행이 손가락 앞에서 44px 로 자란다", async ({ page }) => {
    test.setTimeout(90_000);
    await openMap(page, 390, 844);
    await page.getByTestId("topology-index-fold").click();
    await page.getByTestId("topology-concept-search").click();
    await expect(page.locator("[cmdk-item]").first()).toBeVisible({ timeout: 15_000 });

    const measured = await page.evaluate(() =>
      [...document.querySelectorAll("[cmdk-item]")]
        .map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10)
        .filter((h) => h > 0),
    );
    expect(measured.length, "결과 행을 하나도 못 쟀다").toBeGreaterThan(3);
    // Measured 38px before this change — the rows read no height token at all, so the
    // coarse block's promotion had nothing to reach.
    expect(Math.min(...measured), "가장 낮은 결과 행").toBeGreaterThanOrEqual(44);
  });

  test("선택 상세의 「+N 더 보기」가 44px 히트 영역을 갖는다", async ({ page }) => {
    test.setTimeout(90_000);
    await openMap(page, 390, 844);
    await page.getByTestId("topology-index-row").first().click();
    await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({ timeout: 20_000 });
    // The sheet arrives on a scale transition; measuring the frame it becomes visible
    // reads 43.52 for a 44px box and turns this gate into a coin flip.
    await page.waitForTimeout(800);

    const measured = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid^="topology-v2-group-more-"]',
      );
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      const expanded =
        after.content && after.content !== "none" && after.position === "absolute"
          ? Number.parseFloat(after.height) || 0
          : 0;
      return Math.max(box.height, expanded);
    });
    // Measured 302×24 on 2026-09-05 — under the 44px floor and under WCAG's own 24
    // once the border is counted out.
    expect(measured, "「+N 더 보기」를 못 찾았다").not.toBeNull();
    expect(measured!, "「+N 더 보기」 히트 높이").toBeGreaterThanOrEqual(44);
  });
});
