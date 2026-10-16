import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";

/** Rendered geometry: jsdom reports zero for container queries and scrollWidth. */

/** Every tool the document list carries; at `lg` they stand in the header over the list. */
const HEAD_CONTROL_IDS = [
  "docs-sidebar-search-toggle",
  "docs-sidebar-order-toggle",
  "docs-sidebar-new-doc",
] as const;

interface HeadGeometry {
  listRight: number;
  rowWidth: number;
  scrollWidth: number;
  clientWidth: number;
  contentLeft: number;
  contentRight: number;
  controls: { id: string; left: number; right: number; height: number }[];
}

async function measureHead(
  page: import("@playwright/test").Page,
  ids: readonly string[],
): Promise<HeadGeometry> {
  return page.evaluate((controlIds) => {
    const row = document.querySelector('[data-testid="docs-header-tree-tools"]');
    if (!(row instanceof HTMLElement) || row.getBoundingClientRect().width === 0) {
      throw new Error("the header's list tools are not laid out");
    }
    const scope = row;
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    const list = document.querySelector('[data-testid="docs-vault-doc-list"]');
    return {
      listRight: list ? list.getBoundingClientRect().right : Number.NaN,
      rowWidth: rect.width,
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      contentLeft: rect.left + parseFloat(style.paddingLeft),
      contentRight: rect.right - parseFloat(style.paddingRight),
      controls: controlIds.map((id) => {
        const el = scope.querySelector(`[data-testid="${id}"]`);
        if (!(el instanceof HTMLElement)) throw new Error(`${id} is not rendered`);
        const r = el.getBoundingClientRect();
        return { id, left: r.left, right: r.right, height: r.height };
      }),
    };
  }, [...ids]);
}

function expectHeadHolds(geometry: HeadGeometry) {
  // ① Not scrollable — the row shows everything it holds.
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  for (const control of geometry.controls) {
    // ② Inside the content box on both sides. Sub-pixel layout rounding is allowed; a
    // clipped control was 13.8px out, so 0.5px cannot hide the defect.
    expect(
      control.right,
      `${control.id} right edge ${control.right} passes the row's content box ${geometry.contentRight}`,
    ).toBeLessThanOrEqual(geometry.contentRight + 0.5);
    expect(control.left).toBeGreaterThanOrEqual(geometry.contentLeft - 0.5);
  }
  // One row, one height — `.claude/rules/forbidden.md` forbids heights that differ only
  // because their contents do.
  const heights = new Set(geometry.controls.map((c) => Math.round(c.height)));
  expect([...heights]).toEqual([36]);
  // Over the list they act on: the last tool ends inside the list column.
  for (const control of geometry.controls) {
    expect(control.right).toBeLessThanOrEqual(geometry.listRight + 0.5);
  }
}

test("the document list's tools stand unclipped in the header over the desktop 280px column", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 800 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/library/?tab=ontology");
  await expect(page.getByTestId("docs-sidebar-collection-all")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-guides")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-ontology")).toHaveCount(0);
  await expect(page.getByTestId("docs-header-tree-tools").getByTestId("docs-sidebar-new-doc")).toBeVisible();
  await expect(page.getByTestId("docs-sidebar-head-row")).toHaveCount(0);
  expectHeadHolds(await measureHead(page, HEAD_CONTROL_IDS));
});
