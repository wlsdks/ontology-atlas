import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * The sub-`lg` node detail is **a bottom sheet, not a full-bleed sheet.**
 *
 * `.claude/rules/forbidden.md` (`dont:node-click-fullscreen-modal`) and
 * `.claude/rules/design.md` ("Topology focus and scale") both say the same thing:
 * clicking a node keeps its ego graph opaque and anchors a **compact** surface
 * beside it; full detail is an explicit action inside that surface. Below `lg` the
 * positioner was `fixed inset-x-3 top-[72px]`, which measured (2026-09-05, dev,
 * sample vault, INDEX expanded, node picked from the INDEX tree):
 *
 * | | 390×844 | 834×1112 |
 * |---|---:|---:|
 * | painted sheet | 366×691 (93.8% W · 81.9% H) | 520×691 |
 * | canvas covered | **76.8%** | 38.7% |
 * | visible nodes covered | **28 / 36** | **20 / 36** |
 * | INDEX controls still pressable under it | **24 / 25** | **24 / 25** |
 * | positioner hit area vs paint | 366 / 366 | **810 / 520** |
 *
 * Four separate defects live in that one rectangle, and **only a rendered check can
 * see any of them**:
 *
 * 1. **Coverage** is geometry against the live canvas, and the covered-node count
 *    additionally needs the camera to have run — a class-string assertion cannot
 *    tell "wide sheet" from "wide sheet the camera made room for".
 * 2. **The INDEX interception** is `elementFromPoint`, i.e. the browser's own
 *    hit-testing over a real stacking context. jsdom has no layout and returns
 *    nothing here.
 * 3. **The positioner's dead gutter** (834: 290px of the hit area paints nothing)
 *    is the difference between two rects, not a property of either.
 * 4. **Tab-bar clearance** depends on `--topology-mobile-bottom-tab-reserve`, whose
 *    `env(safe-area-inset-bottom)` term only resolves in a browser.
 *
 * The camera half is measured by `map-viewport-reframe.spec.ts` ("a full-width
 * mobile sheet contributes no left/right inset"); this spec owns the sheet itself.
 */

const CASES = [
  { label: "mobile", width: 390, height: 844 },
  { label: "tablet", width: 834, height: 1112 },
] as const;

/** The ceiling this sheet is allowed to take from the map — half the canvas, less breath. */
const MAX_CANVAS_COVERAGE_PCT = 45;
/**
 * "The ego graph stays visible" as a number.
 *
 * The denominator is the **non-hidden** nodes: focus hides the rest, and counting
 * them measured the sample's size rather than this sheet. Measured 2026-09-05,
 * node picked from the INDEX tree, 36 visible nodes both widths:
 *
 * | | top-anchored (before) | bottom sheet (after) |
 * |---|---:|---:|
 * | 390×844 | 28 / 36 = **78%** | 13 / 36 = 36% |
 * | 834×1112 | 20 / 36 = **56%** | 10 / 36 = 28% |
 *
 * ⚠️ **Why not "almost none".** The remainder is not the sheet's geometry, it is the
 * camera: the selection camera feeds `centerForInsets` with `top: 0, bottom: 0`
 * (`use-topology-loop.ts`) and `measureCanvasInsets` measures only left and right,
 * so a *bottom* obstacle can shrink the free area but cannot push the frame up.
 * Giving the camera a vertical inset is its own change with its own evidence; this
 * spec pins the half the sheet owns and would go red if the sheet grew back.
 */
const MAX_COVERED_VISIBLE_RATIO = 0.4;

async function openSheetFromIndex(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("demo:sample-source:v1", "storefront");
    window.sessionStorage.setItem("demo:first-run-starter-dismissed:v1", "1");
  });
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("topology-index-panel")).toBeVisible({ timeout: 30_000 });
  // Selecting **from the INDEX tree** is the path that leaves the INDEX open beside
  // the sheet — the `?p=` deep link collapses it, so it cannot see this defect at all.
  await page.getByTestId("topology-index-row").first().click();
  await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({ timeout: 20_000 });
  // Let the focus camera finish making room before anything is counted.
  await page.waitForTimeout(1_200);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const q = <T extends Element>(id: string) =>
      document.querySelector<T>(`[data-testid="${id}"]`);
    const positioner = q<HTMLElement>("topology-node-popover-positioner");
    const panel = q<HTMLElement>("topology-v2-detail-panel");
    const index = q<HTMLElement>("topology-index-panel");
    const canvas = q<HTMLElement>("topology-map-v2-canvas");
    const full = q<HTMLElement>("topology-v2-detail-panel-open-full-detail");
    const tabBar = document.querySelector<HTMLElement>("[data-tabbar-min-height-token]");
    if (!positioner || !panel || !canvas) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const overlapW = Math.max(
      0,
      Math.min(canvasRect.right, panelRect.right) - Math.max(canvasRect.left, panelRect.left),
    );
    const overlapH = Math.max(
      0,
      Math.min(canvasRect.bottom, panelRect.bottom) - Math.max(canvasRect.top, panelRect.top),
    );

    const visibleNodes = (window.__atlasMap?.nodes() ?? []).filter((node) => !node.hidden);
    const coveredNodes = visibleNodes.filter((node) => {
      const x = canvasRect.left + node.x;
      const y = canvasRect.top + node.y;
      return x >= panelRect.left && x <= panelRect.right && y >= panelRect.top && y <= panelRect.bottom;
    }).length;

    // A control **under** the sheet is fine — a bottom sheet legitimately overlaps a
    // list. The defect is a control that is under it and *still offers itself*: it
    // takes a tap that the sheet answers instead, and it stays in the focus order.
    let indexControls = 0;
    let indexLiveIntercepted = 0;
    if (index) {
      for (const control of index.querySelectorAll(
        'button, a[href], [role="treeitem"], input, summary',
      )) {
        const box = control.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        indexControls += 1;
        const hit = document.elementFromPoint(
          Math.min(Math.max(box.x + box.width / 2, 1), window.innerWidth - 1),
          Math.min(Math.max(box.y + box.height / 2, 1), window.innerHeight - 1),
        );
        const covered = Boolean(hit && positioner.contains(hit));
        const stillOffered =
          control.closest("[inert]") === null &&
          getComputedStyle(control).pointerEvents !== "none";
        if (covered && stillOffered) indexLiveIntercepted += 1;
      }
    }

    let fullDetailHit: string | null = null;
    if (full) {
      const box = full.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      fullDetailHit =
        hit === full || full.contains(hit)
          ? "topology-v2-detail-panel-open-full-detail"
          : (hit?.closest("[data-testid]")?.getAttribute("data-testid") ??
            hit?.tagName.toLowerCase() ??
            null);
    }

    return {
      canvasCoveragePct: (overlapW * overlapH * 100) / (canvasRect.width * canvasRect.height),
      visibleNodes: visibleNodes.length,
      coveredNodes,
      indexControls,
      indexLiveIntercepted,
      indexInert: index !== null && index.closest("[inert]") !== null,
      positionerPointerEvents: getComputedStyle(positioner).pointerEvents,
      paintedPointerEvents: getComputedStyle(panel).pointerEvents,
      positionerWidth: positioner.getBoundingClientRect().width,
      paintedWidth: panelRect.width,
      panelBottom: panelRect.bottom,
      tabBarTop: tabBar ? tabBar.getBoundingClientRect().top : null,
      fullDetailHit,
    };
  });
}

for (const vp of CASES) {
  test(`${vp.label} ${vp.width}px — 선택 상세 시트가 지도를 삼키지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await openSheetFromIndex(page, vp.width, vp.height);
    const m = await measure(page);
    expect(m, "시트 기하를 측정하지 못했다").not.toBeNull();

    // F1 — the sheet is a bottom sheet, so the map keeps its majority.
    expect(m!.canvasCoveragePct, "시트가 덮은 캔버스 비율").toBeLessThanOrEqual(
      MAX_CANVAS_COVERAGE_PCT,
    );
    // F1 — and the ego graph the click was about stays on screen.
    expect(m!.visibleNodes, "포커스 후 보이는 노드가 없다").toBeGreaterThan(20);
    expect(
      m!.coveredNodes / m!.visibleNodes,
      "시트에 가려진 보이는 노드 비율",
    ).toBeLessThanOrEqual(MAX_COVERED_VISIBLE_RATIO);
  });

  test(`${vp.label} ${vp.width}px — 시트가 열려도 INDEX 컨트롤을 가로채지 않는다`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openSheetFromIndex(page, vp.width, vp.height);
    const m = await measure(page);
    expect(m).not.toBeNull();

    // F3 — the INDEX beside the sheet is inert while the sheet owns the surface, so
    // no control of it answers a tap that lands on the sheet.
    expect(m!.indexControls, "INDEX 컨트롤을 하나도 세지 못했다").toBeGreaterThan(10);
    expect(m!.indexInert, "시트 아래로 물러난 INDEX 는 inert 다").toBe(true);
    expect(m!.indexLiveIntercepted, "가려졌는데도 여전히 눌리는 INDEX 컨트롤 수").toBe(0);
    // F4 — the positioner is a layout wrapper; only the painted sheet takes input.
    expect(m!.positionerPointerEvents, "포지셔너는 입력을 받지 않는다").toBe("none");
    expect(m!.paintedPointerEvents, "실제로 그려진 패널만 입력을 받는다").toBe("auto");
  });

  test(`${vp.label} ${vp.width}px — 시트 1차 행동이 탭 바 위에 온전히 선다`, async ({ page }) => {
    test.setTimeout(90_000);
    await openSheetFromIndex(page, vp.width, vp.height);
    const m = await measure(page);
    expect(m).not.toBeNull();

    // F5 — the footer's primary action answers its own centre, and the sheet ends
    // above the bottom tab bar rather than under it.
    expect(m!.fullDetailHit, "「전체 상세」 중심이 자기 자신을 돌려준다").toBe(
      "topology-v2-detail-panel-open-full-detail",
    );
    if (m!.tabBarTop !== null) {
      expect(m!.panelBottom, "시트 바닥이 하단 탭 바를 침범하지 않는다").toBeLessThanOrEqual(
        m!.tabBarTop,
      );
    }
  });
}
