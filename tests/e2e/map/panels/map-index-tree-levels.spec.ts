import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * Rows are DOM siblings with no nested `role="group"`, so each needs `aria-level` to announce
 * its depth. Walks the live panel because levels must survive the real tree.
 */
test("every row of the INDEX tree states its own level", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });
  await page.getByTestId("first-run-starter-dismiss").click();
  const tree = page.getByTestId("topology-index-tree");
  await expect(tree).toBeVisible();

  const read = () =>
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-index-tree"] [role="treeitem"]'));
      return rows.map((r) => ({
        text: (r.textContent ?? "").trim().slice(0, 12),
        level: r.getAttribute("aria-level"),
        pos: r.getAttribute("aria-posinset"),
        size: r.getAttribute("aria-setsize"),
      }));
    });

  const roots = await read();
  expect(roots.length, "the tree has no rows, so this spec spins idle").toBeGreaterThan(3);
  expect(roots.filter((r) => r.level === null), "rows that do not state a level").toEqual([]);
  // One project at level 1, its domains one step in.
  expect(roots[0].level).toBe("1");
  expect(new Set(roots.slice(1).map((r) => r.level))).toEqual(new Set(["2"]));
  for (const row of roots) {
    expect(Number(row.pos)).toBeGreaterThanOrEqual(1);
    expect(Number(row.pos)).toBeLessThanOrEqual(Number(row.size));
  }

  // Expanding a domain must not flatten its children into the same level.
  await page.locator('[data-testid="topology-index-tree"] [role="treeitem"]').nth(1).press("ArrowRight");
  await expect.poll(async () => (await read()).length).toBeGreaterThan(roots.length);
  const expanded = await read();
  expect(expanded.filter((r) => r.level === null), "rows that lost their level after expanding").toEqual([]);
  expect(expanded.some((r) => r.level === "3"), "an expanded child reads as the same level as its parent").toBe(true);
});
