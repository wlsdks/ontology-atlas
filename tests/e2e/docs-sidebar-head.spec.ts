import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The docs sidebar head holds its own width** (owner report 2026-09-07, installed app,
 * `/ko/library?tab=ontology`).
 *
 * Library fixes this reader to Ontology, so the head is one row of the three controls that
 * remain meaningful: filter · order · new document. At the only width the
 * desktop pane has — `--docs-list-width`, 280px — the active chip's own name spent more than
 * the row had, and **the new-document button was cut in half by the pane's right border**.
 * Measured before the fix on this same static export: `scrollWidth` 285 against
 * `clientWidth` 279 in Korean (283/279 in English), with the `+` button's right edge 13.8px
 * past the row's content box.
 *
 * Two facts are asserted, and they are different failures:
 *
 * ① **`scrollWidth === clientWidth`** — the row is not secretly scrollable. A row that
 *    overflows into a scroll container hides the last control instead of clipping it, which
 *    is the same defect wearing a different symptom.
 * ② **no control's right edge passes the row's content box** — nothing is drawn under the
 *    pane border, so every control keeps its full hit area.
 *
 * Both widths matter and they are not the same layout. 1040 is the desktop pane (280px,
 * `lg` and up, labels collapsed to glyphs). 390 is the drawer (300px), where the same
 * component renders inside a different container — a viewport breakpoint would answer for
 * neither, which is why the component measures **the row** with a container query.
 *
 * Why e2e rather than jsdom: a container query and a flex row's `scrollWidth` are rendered
 * geometry. jsdom reports zero for both, so a unit test of this row cannot fail on the
 * defect. `DocsSidebarBody.test.tsx` owns the part that is checkable there — that the
 * threshold written into the class and the constant beside it are one number.
 */

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

test("문서함 머리줄이 390px 서랍에서도 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/library/?tab=ontology");
  await expect(page.getByTestId("docs-sidebar-collection-all")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-guides")).toHaveCount(0);
  await expect(page.getByTestId("docs-sidebar-collection-ontology")).toHaveCount(0);
  // Below `lg` the pane is a drawer, so the head only exists once it is opened.
  await page.getByRole("button", { name: "문서 목록 열기" }).click();
  await expect(page.getByRole("complementary").getByTestId("docs-sidebar-new-doc")).toBeVisible();
  expectHeadHolds(await measureHead(page, HEAD_CONTROL_IDS));
});
