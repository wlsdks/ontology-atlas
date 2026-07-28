import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 레일 활성 표시는 **하나의 원소가 옮겨 다닌다** (2026-07-28 모션 감사의 「가장 큰 한 방」).
 *
 * ## 왜 이게 정보인가
 *
 * 종전에는 두 타일이 각자 색을 죽이고 켰다. 게슈탈트 **공통 운명**상 사라졌다
 * 나타나는 두 표시는 "두 개의 것" 으로 지각되고, 이동하는 한 표시는 "**같은
 * 것이 옮겨갔다**" 로 지각된다. 레일의 세로 순서는 이 앱의 유일한 공간
 * 모델이므로, 지표의 이동 방향과 거리는 그 모델 위에서 "어디서 와서 어디로
 * 갔는지" 를 나른다 — 끄면 그 정보를 잃는다(판별식 통과).
 *
 * ## 무엇을 재나
 *
 * 1. 지표가 **하나뿐**이다 — 여럿이면 "옮겨간다" 는 주장이 거짓이다.
 * 2. 매 목적지에서 활성 타일과 **정확히 겹친다** — 어긋난 지표는 사람이 눈으로
 *    잘 못 집는 종류라 픽셀로 재야 한다.
 * 3. 이동에 **base 램프 + 하우스 이징**을 쓴다 — 값이 아니라 쓰임으로 고른
 *    결과다(표면이 자리를 바꾸는 일 = 이동 = 180ms).
 *
 * 콘텐츠는 한 톨도 움직이지 않는다. 그래서 주목 예산은 사용자가 부른 목적물이
 * 가져가고 크롬은 한 점만 따라간다.
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

    for (const destination of DESTINATIONS) {
      await page.getByTestId(`app-nav-rail-item-${destination.id}`).click();
      await page.waitForURL(destination.url);

      // 이동이 끝난 상태를 본다 — 이동 중을 재면 전이가 아니라 스케줄링을 잰다.
      await expect
        .poll(async () => (await readIndicator(page))?.offsetY, { timeout: 5_000 })
        .toBe(0);

      const settled = await readIndicator(page);
      expect(settled!.count, `${destination.id}: 지표가 늘었다`).toBe(1);
      expect(settled!.offsetHeight, `${destination.id}: 높이가 타일과 다르다`).toBe(0);
    }
  });

  test("이동은 base 램프와 하우스 이징을 탄다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

    // 첫 배치가 끝나야 전이가 켜진다 — 처음 그려질 때 미끄러져 들어오면
    // 이동이 아니라 등장이 되고, 사용자가 부르지 않은 모션이 된다.
    await expect
      .poll(async () => (await readIndicator(page))?.duration, { timeout: 5_000 })
      .not.toBe("0s");

    const measured = await readIndicator(page);
    // 180ms = `--motion-base` (표면이 자리를 바꾸는 일 = 이동).
    expect(measured!.duration).toContain("0.18s");
    expect(measured!.easing).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)");
  });
});
