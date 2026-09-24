import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * **At the app's own floor the stacked reader is reachable.**
 *
 * `src-tauri/tauri.conf.json` allows a 1040x720 window, and below `xl` the Git workbench
 * stacks its two columns. It used to keep splitting one window-sized height between them:
 * measured 2026-09-25 with an eleven-step history, the step list took 534px and the stacked
 * reader (`atlas-git-evidence`) got a rect 0px tall while its children still painted below
 * the fold. A click on a changed document's chip timed out after 15s because the dock and
 * the scroll frame sat on top of it. Two steps hid the defect (the reader got 320px), so
 * this runs with a real-length history.
 *
 * What is measured is the promise, not a height: the reader has height, and the element at
 * the centre of a change chip is that chip once it is scrolled to.
 */

const STEPS = Array.from({ length: 11 }, (_, i) => ({
  shortHash: `f${i.toString().padStart(6, "0")}`,
  hash: `f${i.toString().padStart(6, "0")}${"0".repeat(33)}`,
  subject: `docs: explain step ${i + 1}`,
  relativeTime: `${i + 1} days ago`,
  isoTime: new Date(Date.parse("2026-09-12T06:00:00.000Z") - i * 86_400_000).toISOString(),
  author: "stark",
  files: [{ path: "domains/order.md", status: "modified", kind: "domain", slug: "domains/order", renamedFrom: null }],
}));

test("앱 최소 창(1040x720)에서 쌓인 문서 읽기 칸이 높이를 갖고 눌린다", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await installDesktopRailRuntime(page, {}, undefined, STEPS);
  await mountDesktopVault(page);
  await page.getByTestId("app-nav-rail-item-git").click();
  await expect(page.getByTestId("atlas-git-history-item")).toHaveCount(10, { timeout: 60_000 });

  const evidence = page.getByTestId("atlas-git-evidence");
  await expect(evidence).toBeAttached();
  const height = await evidence.evaluate((el) => el.getBoundingClientRect().height);
  expect(height, "the stacked reader collapsed to nothing").toBeGreaterThan(200);

  const chip = page.getByTestId("atlas-git-change-row").first();
  await chip.scrollIntoViewIfNeeded();
  const hit = await chip.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { onTop: !!top && el.contains(top), topId: top?.getAttribute("data-testid") ?? top?.tagName ?? null };
  });
  expect(hit.onTop, `a change chip is covered by ${hit.topId}`).toBe(true);
  await chip.click({ timeout: 5_000 });

  // The list and the reader are one page: no horizontal scroll on the way.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
