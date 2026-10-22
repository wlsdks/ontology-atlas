import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { waitForMapStill } from "../../settle";

/**
 * **One badge column, one meaning.**
 *
 * The number at the right of an INDEX row is the same mark the map draws inside a node.
 * On the project row it is the canonical census: the four kinds the map draws (project,
 * domain, capability, element), each once (`docs/records/decisions/2026-10-15-map-concept-census-*`).
 * A project row that fell through to its number of direct children said **3** while its
 * own node on the canvas said **16**.
 *
 * This walks the tree the panel itself renders and asserts the project's badge names
 * the drawn concepts it holds, rather than pinning the fixture's number.
 */
test("the project row's badge counts the drawn concepts it holds", async ({ page }) => {
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
      await page.locator(`[data-index-row="${id}"]`).first().press("ArrowRight");
      await expect(page.locator(`[data-index-row="${id}"]`).first()).toHaveAttribute("aria-expanded", "true");
    }
  }
  await waitForMapStill(page);

  // What the census counts: the project itself and every domain, capability and element, each once.
  const drawnKinds = ["project:", "domain:", "capability:", "element:"];
  const drawn = new Set((await rowIds()).filter((id) => drawnKinds.some((kind) => id.startsWith(kind))));
  expect(drawn.size, "펼쳤는데 하위 개념 행이 하나도 없다").toBeGreaterThan(1);
  const projectBadge = (await badgeOf(projectId))?.trim();
  expect(projectBadge, "프로젝트 배지가 지도 노드와 다른 수를 말한다").toBe(String(drawn.size));
});
