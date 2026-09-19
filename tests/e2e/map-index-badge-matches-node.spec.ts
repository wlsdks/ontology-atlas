import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **One badge column, one meaning.**
 *
 * The number at the right of an INDEX row is the same mark the map draws inside a
 * node, and the map counts every kind from the domain census
 * (`views/home/lib/map-adapter.ts`). The row consulted that census for domain rows
 * only, so a project row fell through to its number of direct children. Measured on
 * the sample folder at 1512×982: the project said **3** in the INDEX while its own
 * node on the canvas said **16**, and the three domain rows agreed at 5, 7 and 4.
 *
 * This walks the tree the panel itself renders and asserts the project's badge names
 * what is actually below it, rather than pinning the fixture's number.
 */
test("the project row's badge counts everything below it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  const rowIds = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-index-row]")].map((el) => el.dataset.indexRow!));
  const badgeOf = (id: string) =>
    page.locator(`[data-index-row="${id}"] [data-testid="topology-index-row-count"]`).first().textContent();

  const projectId = (await rowIds()).find((id) => id.startsWith("project:"))!;
  expect(projectId, "프로젝트 행이 없다").toBeTruthy();

  // Open every branch the tree offers, so the count below the project is visible.
  for (let pass = 0; pass < 4; pass++) {
    const collapsed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-index-row][aria-expanded="false"]')].map((el) => el.dataset.indexRow!),
    );
    if (collapsed.length === 0) break;
    for (const id of collapsed) {
      await page.locator(`[data-index-row="${id}"]`).first().click();
      await page.waitForTimeout(120);
    }
  }
  await waitForMapStill(page);

  // What the census counts: capabilities and elements anywhere below, each once.
  const below = new Set((await rowIds()).filter((id) => id.startsWith("capability:") || id.startsWith("element:")));
  expect(below.size, "펼쳤는데 하위 개념 행이 하나도 없다").toBeGreaterThan(0);

  const projectBadge = (await badgeOf(projectId))?.trim();
  expect(projectBadge, "프로젝트 배지가 지도 노드와 다른 수를 말한다").toBe(String(below.size));
});
