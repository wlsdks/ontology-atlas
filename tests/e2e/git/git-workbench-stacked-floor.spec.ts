import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";

/**
 * Runs with an eleven-step history; two steps hide the defect because the reader gets 320px.
 * Asserts the reader has height and the element at a chip's centre is that chip.
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

test("at the minimum app window (1040x720), the stacked document reading pane keeps a height and presses down", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  const changes = [
    { path: "domains/order.md", status: "modified", kind: "domain", slug: "domains/order", renamedFrom: null },
    { path: "domains/billing.md", status: "modified", kind: "domain", slug: "domains/billing", renamedFrom: null },
  ];
  await installDesktopRailRuntime(page, {}, undefined, { commits: STEPS, gitStatus: { changedCount: 2, changes } });
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

  // The step just picked wins the window it was picked in: its headline starts above the fold
  // without scrolling the page (round-two review: an uncapped list pushed it below 720).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("atlas-git-history-item").first().click();
  const headline = page.getByTestId("atlas-git-detail-headline");
  await expect(headline).toBeVisible();
  const headlineTop = await headline.evaluate((el) => el.getBoundingClientRect().top);
  expect(headlineTop, "the selected step's headline starts below the fold").toBeLessThan(720 - 40);
  // With a step picked the list steps down to about four rows, so the headline sits in the
  // upper part of the window rather than on its last lines (round three: y≈650 of 720).
  expect(headlineTop, "the picked step's headline does not win the window").toBeLessThan(720 * 0.65);
  // One winner: the title is the only 23px text.
  await expect(page.locator("h1:visible")).toHaveCount(1);
  const [pageTitle, pageTitleBottom, picked] = await page.evaluate(() => {
    const h1 = document.querySelector("h1")!;
    const headlineEl = document.querySelector('[data-testid="atlas-git-detail-headline"]')!;
    return [
      Number.parseFloat(getComputedStyle(h1).fontSize),
      h1.getBoundingClientRect().bottom,
      Number.parseFloat(getComputedStyle(headlineEl).fontSize),
    ];
  });
  expect(pageTitle, "the page title is not the display step").toBe(23);
  expect(picked, "the page title and the selected step tie in size").toBeGreaterThan(pageTitle);
  expect(pageTitleBottom, "the page title sits below the selection headline").toBeLessThanOrEqual(headlineTop);
  // The capped list says it continues: its bottom edge fades while rows hide below it
  // (round four: it ended on a hairline with eleven steps scrolling unseen inside it).
  await expect(page.getByTestId("atlas-git-steps-scroll")).toHaveAttribute("data-edge-bottom", "true");

  // The list and the reader are one page: no horizontal scroll on the way.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
