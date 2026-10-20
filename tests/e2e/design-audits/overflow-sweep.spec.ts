import { waitForDocumentPaint } from '../visual-ready';
import { test, expect } from "@playwright/test";

/**
 * Viewports follow the responsive sweep matrix: the app floor 1040 and desktop 1280, 1440, 1512,
 * 1920 and 2560. 1920 and 2560 coincide with `.topology-ui-scale`'s zoom breakpoints
 * (1.15 / 1.3) in app/globals.css, which are real min-width media queries.
 */

const VIEWPORTS = [
  /*
   * `src-tauri/tauri.conf.json` enforces a 1040x720 minimum window, and the band up to 1263 differs:
   * above `lg` the rail takes 64px, so a container query on the scroll slot fires later than its
   * number suggests.
   */
  { label: "app-floor-1040", w: 1040, h: 720 },
  { label: "desktop-1280", w: 1280, h: 800 },
  { label: "desktop-1440", w: 1440, h: 900 },
  { label: "desktop-1512", w: 1512, h: 949 },
  { label: "desktop-1920", w: 1920, h: 1080 },
  { label: "desktop-2560", w: 2560, h: 1440 },
];

const ONTOLOGY_LIBRARY_ROUTE = "/en/library/?tab=ontology&guides=off";

const ROUTES = [
  "/en/",
  "/en/projects/",
  "/en/project/ontology-atlas/",
  "/en/project/new/",
  // Only the user-facing surfaces still alive after R10 (auth and cloud surfaces permanently removed).
  "/en/topology/",
  "/en/ontology/",
  // Every live Analysis section and its implementation question owns a different reading surface.
  "/en/ontology/insights/?guides=off",
  "/en/ontology/insights/?tab=do-next&guides=off",
  "/en/ontology/insights/?tab=brief&guides=off",
  "/en/ontology/insights/?tab=library&guides=off",
  "/en/architecture/?view=overview&guides=off",
  "/en/ontology/insights/?tab=composition&guides=off",
  ONTOLOGY_LIBRARY_ROUTE,
  "/en/download/",
];

async function waitForOverflowSurface(
  page: import("@playwright/test").Page,
  url: string,
) {
  if (url !== ONTOLOGY_LIBRARY_ROUTE) return;
  await expect(page).toHaveURL(
    (current) =>
      current.pathname === "/en/library/" &&
      current.searchParams.get("tab") === "ontology",
  );
  await expect(
    page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
  ).toBeVisible();
}

async function measureOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
}

/** Named so the probe calls the same predicate as the gate; deleting a term then turns the probe red. */
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
      await waitForDocumentPaint(page);
      await waitForOverflowSurface(page, url);
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
 * Instrument probe: `html` and `body` set `overflow-x: hidden`, so `documentElement.scrollWidth`
 * does not grow and only `body.scrollWidth` reports overflow. Deleting the `bodyScroll` term
 * as redundant turns this red.
 */
test("instrument probe: catches an overflowing element for real, which documentElement alone cannot", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto("/ko/library/?tab=ontology&guides=off", { waitUntil: "domcontentloaded" });
  await waitForDocumentPaint(page);
  await expect(
    page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
  ).toBeVisible();

  const clean = await measureOverflow(page);
  expect(
    isOverflowing(clean),
    "if it overflows before planting, this probe proves nothing",
  ).toBe(false);

  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-testid="ovf-probe" style="width:1400px;height:8px"></div>',
    );
  });
  await waitForDocumentPaint(page);
  const dirty = await measureOverflow(page);

  /* **Calls the gate's own predicate** — asserting the measurement alone stays green when a term is deleted. */
  expect(
    isOverflowing(dirty),
    "the gate's verdict formula missed the planted 1400px, so this sweep's zero is not evidence",
  ).toBe(true);
  expect(
    dirty.scroll,
    "if documentElement.scrollWidth saw the overflow, the overflow-x:hidden premise changed; update this message then",
  ).toBeLessThanOrEqual(dirty.client);

  await page.evaluate(() => document.querySelector('[data-testid="ovf-probe"]')?.remove());
});

// Resize transition 1920↔2560 — changes the viewport without a reload to check that
// no overflow appears at the moment `.topology-ui-scale`'s zoom media query
// recomputes (1.15→1.3). This is closest to the real usage pattern of resizing after
// an SPA route change (plugging or unplugging an external monitor, dragging the
// window).
for (const url of ROUTES) {
  test(`overflow sweep — resize transition 1920↔2560 — ${url}`, async ({ page }) => {
    const violations: Array<{ step: string; scroll: number; client: number }> = [];
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await waitForDocumentPaint(page);
    await waitForOverflowSurface(page, url);

    await page.setViewportSize({ width: 2560, height: 1440 });
    await waitForDocumentPaint(page);
    const afterGrow = await measureOverflow(page);
    if (afterGrow.scroll > afterGrow.client) violations.push({ step: "1920→2560", ...afterGrow });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForDocumentPaint(page);
    const afterShrink = await measureOverflow(page);
    if (afterShrink.scroll > afterShrink.client) violations.push({ step: "2560→1920", ...afterShrink });

    expect(violations, `resize-transition overflow on ${url}: ${JSON.stringify(violations)}`).toHaveLength(0);
  });
}
