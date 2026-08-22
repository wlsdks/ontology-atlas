import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * The rail's active indicator is **one element that moves** (the biggest single win
 * of the 2026-07-28 motion audit).
 *
 * **Why this carries information.** Previously two tiles each killed and lit their own
 * colour. By Gestalt **common fate**, two marks that disappear and reappear are
 * perceived as "two things", while one mark that travels is perceived as "**the same
 * thing moved**". The rail's vertical order is this app's only spatial model, so the
 * indicator's direction and distance of travel carry "where it came from and where it
 * went" on top of that model — switching it off loses that information (it passes the
 * discriminator).
 *
 * **What is measured.**
 *
 * 1. There is **exactly one** indicator — several make the claim "it moves" false.
 * 2. At every destination it **overlaps the active tile exactly** — a misaligned
 *    indicator is the kind of thing people do not reliably localise by eye, so it must
 *    be measured in pixels.
 * 3. The travel uses the **base ramp plus the house easing** — chosen by use, not by
 *    value (a surface changing position = travel = 180 ms).
 *
 * Not one bit of content moves, so the attention budget goes to the destination the
 * user asked for while the chrome follows with a single dot.
 */

const DESTINATIONS = [
  { id: "docs", url: /\/docs\// },
  { id: "insights", url: /\/ontology\/insights\// },
  { id: "projects", url: /\/projects\// },
  { id: "map", url: /\/topology\// },
] as const;

async function readIndicator(page: Page) {
  return page.evaluate(() => {
    const indicator = document.querySelector<HTMLElement>(
      '[data-testid="app-nav-rail-active-indicator"]',
    );
    if (!indicator) return null;
    const list = indicator.parentElement;
    const tile = list?.querySelector<HTMLElement>('[data-active="true"] > span');
    if (!tile) return null;
    const i = indicator.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const style = getComputedStyle(indicator);
    return {
      count: document.querySelectorAll('[data-testid="app-nav-rail-active-indicator"]').length,
      offsetY: Math.round(i.top - t.top),
      offsetHeight: Math.round(i.height - t.height),
      // **Measure the horizontal axis too.** This gate originally looked only at Y and
      // height, and so passed an indicator pushed 19px left of its tile and clipped
      // outside the rail (reported by the owner in real use, 2026-07-28). Overlap is a
      // question about all four edges.
      offsetX: Math.round(i.left - t.left),
      offsetWidth: Math.round(i.width - t.width),
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
    };
  });
}

test.describe("레일 활성 표시 — 같은 것이 옮겨간다", () => {
  test("모든 목적지에서 지표 하나가 활성 타일과 정확히 겹친다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

    const start = await readIndicator(page);
    expect(start, "지표를 못 찾았다 — 셀렉터가 썩었으면 이 게이트는 무효다").not.toBeNull();
    expect(start!.count, "지표가 여럿이면 '옮겨간다' 는 주장이 거짓이다").toBe(1);
    expect(start!.offsetY).toBe(0);
    expect(start!.offsetHeight).toBe(0);
    expect(start!.offsetX).toBe(0);
    expect(start!.offsetWidth).toBe(0);

    for (const destination of DESTINATIONS) {
      await page.getByTestId(`app-nav-rail-item-${destination.id}`).click();
      await page.waitForURL(destination.url);

      // Look at the settled state — measuring mid-travel measures scheduling, not the transition.
      await expect
        .poll(async () => (await readIndicator(page))?.offsetY, { timeout: 5_000 })
        .toBe(0);

      const settled = await readIndicator(page);
      expect(settled!.count, `${destination.id}: 지표가 늘었다`).toBe(1);
      expect(settled!.offsetHeight, `${destination.id}: 높이가 타일과 다르다`).toBe(0);
      expect(settled!.offsetX, `${destination.id}: 가로로 밀렸다`).toBe(0);
      expect(settled!.offsetWidth, `${destination.id}: 폭이 타일과 다르다`).toBe(0);
    }
  });

  test("이동은 base 램프와 하우스 이징을 탄다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

    // The transition only switches on after the first layout — sliding in on first paint
    // would be an entrance rather than travel, i.e. motion the user did not ask for.
    await expect
      .poll(async () => (await readIndicator(page))?.duration, { timeout: 5_000 })
      .not.toBe("0s");

    const measured = await readIndicator(page);
    // 180ms = `--motion-base` (a surface changing position = travel).
    expect(measured!.duration).toContain("0.18s");
    expect(measured!.easing).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)");
  });
});
