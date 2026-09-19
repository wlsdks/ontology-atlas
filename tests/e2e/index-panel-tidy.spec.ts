import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **The things to tidy are one list under the tree, not boxes on the floor**
 * (owner screenshot, 2026-09-19).
 *
 * On a seven-document vault the INDEX panel showed its list, then 60 % of
 * empty panel, then three separate cards of two different shapes hugging the
 * floor — the three most useful actions on the screen, read as furniture. They
 * are one titled list now, in one row grammar, placed right under the tree.
 * The tree shrinks and scrolls on a big vault instead of growing to push the
 * list away, so the list stays in view either way.
 */
test("the tidy list follows the tree and wears one row grammar", async ({ page }) => {
  test.setTimeout(90_000);
  // Tall enough that the fixture tree never overflows, so the "follows the tree"
  // check always runs here; the overflow case is the other branch of the same layout.
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // One document without a kind, so "N docs not on the map" has something to say.
  await installDesktopRailRuntime(page, { "notes/audit.md": "# Inspection notes\nAn uncataloged document.\n" });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  const section = page.getByTestId("topology-index-tidy");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("topology-index-uncataloged-docs")).toBeVisible();
  await expect(section.getByTestId("topology-index-source-unbound")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const tree = document.querySelector<HTMLElement>('[data-testid="topology-index-tree"]')!;
    const section = document.querySelector<HTMLElement>('[data-testid="topology-index-tidy"]')!;
    const actionRows = [...section.querySelectorAll<HTMLElement>("a, button")];
    // Measured from the last row a person sees, not the tree box: the old
    // layout stretched the box to the floor, so the box's bottom sat next to
    // the list while the rows sat far above it.
    const treeRows = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const lastRowBottom = treeRows.length > 0 ? Math.max(...treeRows.map((row) => row.getBoundingClientRect().bottom)) : tree.getBoundingClientRect().bottom;
    return {
      treeOverflows: tree.scrollHeight > tree.clientHeight + 1,
      gap: section.getBoundingClientRect().top - lastRowBottom,
      rowClasses: new Set(actionRows.map((row) => row.className)).size,
      rowHeights: new Set(actionRows.map((row) => Math.round(row.getBoundingClientRect().height))).size,
    };
  });
  // A short tree: the list sits right under it (the section's own top margin, not the floor).
  if (!geometry.treeOverflows) {
    expect(geometry.gap, "정리할 것 목록이 트리 바로 아래가 아니라 바닥에 붙어 있다").toBeLessThanOrEqual(32);
  }
  expect(geometry.rowClasses, "행마다 모양이 다르다").toBe(1);
  expect(geometry.rowHeights, "행 높이가 다르다").toBe(1);

  const shot = process.env.INDEX_TIDY_SHOT;
  if (shot) await page.getByTestId("topology-index-panel").screenshot({ path: shot });
});
