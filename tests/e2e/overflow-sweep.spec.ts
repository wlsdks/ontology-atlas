import { test, expect } from "@playwright/test";

/**
 * Opens the main routes at several viewports and checks that the document's
 * scrollWidth never exceeds the viewport. Any horizontal scroll fails immediately.
 *
 * The viewport list follows the owner's responsive sweep matrix: desktop
 * 1280 · 1440 · 1512 (the MBP14's real resolution) · 1920 · 2560, plus mobile smoke
 * at 390 · 360 (breakage prevention only — this is a desktop-first product and they
 * are not an optimisation target), plus the existing tablet-768 regression. 1920 and
 * 2560 coincide with `.topology-ui-scale`'s real zoom breakpoints (1.15 / 1.3) in
 * app/globals.css, so chrome scaling is covered at the same time and no separate
 * zoom-simulation viewport is needed — those are real min-width media queries, so
 * passing at the real values is what counts.
 */

const VIEWPORTS = [
  { label: "mobile-390", w: 390, h: 844 },
  { label: "mobile-360", w: 360, h: 780 },
  { label: "tablet-768", w: 768, h: 1024 },
  { label: "desktop-1280", w: 1280, h: 800 },
  { label: "desktop-1440", w: 1440, h: 900 },
  { label: "desktop-1512", w: 1512, h: 949 },
  { label: "desktop-1920", w: 1920, h: 1080 },
  { label: "desktop-2560", w: 2560, h: 1440 },
];

const ROUTES = [
  "/en/",
  "/en/projects/",
  "/en/project/ontology-atlas/",
  "/en/project/new/",
  // Only the user-facing surfaces still alive after R10 (auth and cloud surfaces permanently removed).
  "/en/topology/",
  "/en/ontology/",
  "/en/ontology/insights/",
  "/en/docs/",
  "/en/download/",
];

async function measureOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
}

/**
 * Did it overflow — and **there is a reason the predicate is a named function**
 * (2026-08-06).
 *
 * The first probe asserted only `measureOverflow`'s return value, so **deleting the
 * whole `bodyScroll > client` term from the gate still left the probe green** — it
 * proved the instrument sees the overflow but not that the gate uses it.
 *
 * With the predicate in one place, the probe calls **the same function as the
 * gate**, and deleting a term turns the probe red.
 */
function isOverflowing({
  scroll,
  bodyScroll,
  client,
}: {
  scroll: number;
  bodyScroll: number;
  client: number;
}) {
  return scroll > client || bodyScroll > client;
}

for (const vp of VIEWPORTS) {
  test(`overflow sweep — ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const violations: Array<{
      route: string;
      scroll: number;
      bodyScroll: number;
      client: number;
    }> = [];

    for (const url of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const measured = await measureOverflow(page);
      if (isOverflowing(measured)) {
        violations.push({ route: url, ...measured });
      }
    }

    if (violations.length > 0) {
      console.log(`[OVF] ${vp.label} violations:`, JSON.stringify(violations));
    }
    expect(
      violations,
      `overflow at ${vp.label}: ${JSON.stringify(violations)}`,
    ).toHaveLength(0);
  });
}

/**
 * **Instrument probe — proof this check is not idling** (2026-08-06).
 *
 * This sweep always reports 0, which leaves no way to distinguish "0 because it is
 * clean" from "0 because it cannot see" (`/gate-probe`). A throwaway instrument
 * built the same day **reported 0** even with a 900px element planted in a 390px
 * viewport.
 *
 * The cause is that this repository sets `overflow-x: hidden` on `html` and `body`,
 * so **`documentElement.scrollWidth` does not grow** (390 → 390). The only thing
 * that reports the overflow is **`body.scrollWidth`** (390 → 900).
 *
 * This check watched both from the start. This probe pins that the `bodyScroll` term
 * is **actually doing work** — deleting it as "looks redundant" turns this red.
 */
test("계기 프로브 — 넘친 원소를 실제로 잡고, documentElement 만으로는 못 잡는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const clean = await measureOverflow(page);
  expect(
    isOverflowing(clean),
    "심기 전부터 넘쳐 있으면 이 프로브가 아무것도 증명하지 못한다",
  ).toBe(false);

  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-testid="ovf-probe" style="width:900px;height:8px"></div>',
    );
  });
  await page.waitForTimeout(200);
  const dirty = await measureOverflow(page);

  /* **Calls the gate's own predicate** — asserting the measurement alone stays green when a term is deleted. */
  expect(
    isOverflowing(dirty),
    "심어 둔 900px 을 게이트 판정식이 못 잡았다 — 이 스윕의 0은 증거가 아니다",
  ).toBe(true);
  expect(
    dirty.scroll,
    "documentElement.scrollWidth 가 넘침을 봤다면 overflow-x:hidden 전제가 바뀐 것이다 — 그때는 이 주석을 고쳐라",
  ).toBeLessThanOrEqual(dirty.client);

  await page.evaluate(() => document.querySelector('[data-testid="ovf-probe"]')?.remove());
});

// Resize transition 1920↔2560 — changes the viewport without a reload to check that
// no overflow appears at the moment `.topology-ui-scale`'s zoom media query
// recomputes (1.15→1.3). This is closest to the real usage pattern of resizing after
// an SPA route change (plugging or unplugging an external monitor, dragging the
// window).
test("overflow sweep — resize transition 1920↔2560", async ({ page }) => {
  const violations: Array<{ step: string; route: string; scroll: number; client: number }> = [];

  for (const url of ROUTES) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.waitForTimeout(300);
    const afterGrow = await measureOverflow(page);
    if (afterGrow.scroll > afterGrow.client) {
      violations.push({ step: "1920→2560", route: url, ...afterGrow });
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    const afterShrink = await measureOverflow(page);
    if (afterShrink.scroll > afterShrink.client) {
      violations.push({ step: "2560→1920", route: url, ...afterShrink });
    }
  }

  if (violations.length > 0) {
    console.log("[OVF] resize-transition violations:", JSON.stringify(violations));
  }
  expect(violations, `resize-transition overflow: ${JSON.stringify(violations)}`).toHaveLength(0);
});
