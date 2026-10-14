import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";

/** Rendered geometry: jsdom reports zero for container queries and scrollWidth. */

/** Every control in Library's fixed-scope head row. */
const HEAD_CONTROL_IDS = [
  "docs-sidebar-search-toggle",
  "docs-sidebar-order-toggle",
  "docs-sidebar-new-doc",
] as const;

interface HeadGeometry {
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
    /*
     * The same sidebar body is mounted twice — the drawer below `lg` and the persistent pane
     * at `lg` and up — so a bare selector is ambiguous and would silently measure the hidden
     * copy at whichever width it is not the answer for. Only one of the two is laid out, and
     * a hidden one has no box; that is the one fact that tells them apart at every width.
     */
    const laidOut = [...document.querySelectorAll('[data-testid="docs-sidebar-head-row"]')].filter(
      (el) => el instanceof HTMLElement && el.getBoundingClientRect().width > 0,
    );
    if (laidOut.length !== 1) {
      throw new Error(`expected exactly one laid-out docs sidebar head row, found ${laidOut.length}`);
    }
    const row = laidOut[0] as HTMLElement;
    const scope = row.parentElement ?? document.body;
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    return {
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
  expect([...heights]).toHaveLength(1);
}

test("문서함 머리줄이 데스크톱 280px 칸에서 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 800 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/library/?tab=ontology");
  await expect(page.getByTestId("docs-sidebar-collection-all")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-guides")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-ontology")).toHaveCount(0);
  await expect(page.getByTestId("docs-vault-doc-list").getByTestId("docs-sidebar-new-doc")).toBeVisible();
  expectHeadHolds(await measureHead(page, HEAD_CONTROL_IDS));
});
