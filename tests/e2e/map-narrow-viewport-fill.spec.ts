import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The chrome may not eat the map** (map round, 2026-09-20).
 *
 * The map's side insets are absolute pixels — 350 for the INDEX panel, 120 for
 * the tool rail — so they do not shrink with the window. Measured before the
 * fix: on an 820-wide canvas they reserve 57% of it and the graph spans 31% of
 * the width; on a 390-wide canvas they total more than the whole canvas, the
 * free width collapses to a single pixel, and only `cameraScaleMin` keeps a
 * frame at all — the map sits at its floor zoom with its nodes spanning 118 px
 * of 390. The fit now reserves at most half an axis, never shrinking below what
 * a panel measurably covers.
 *
 * Measured after, drawn width as a share of the canvas: 1512 and 1280 and 1024
 * unchanged (37%, 44%, 38% — their chrome already asks for less than half), and
 * 820 31%→37%, 640 19%→37%, 390 30%→37% with its scale off the 0.24 floor.
 */
type Probe = {
  nodes: () => Array<{ hidden: boolean; x: number; alpha: number }>;
  camera: () => { scale: number };
};
async function measure(page: import("@playwright/test").Page) {
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __atlasMap?: unknown }).__atlasMap), null, { timeout: 30_000 });
  await waitForMapStill(page, { what: "camera" });
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="topology-index-panel"]')?.getBoundingClientRect() ?? null;
    const drawn = m.nodes().filter((n) => !n.hidden && n.alpha > 0.02);
    const xs = drawn.map((n) => n.x);
    return {
      canvasWidth: box.width,
      scale: m.camera().scale,
      spanShare: (Math.max(...xs) - Math.min(...xs)) / box.width,
      leftmost: box.left + Math.min(...xs),
      panelRight: panel && panel.width < box.width * 0.6 ? panel.right : null,
    };
  });
}

test("좁은 창에서도 지도가 캔버스를 쓴다", async ({ page }) => {
  test.setTimeout(180_000);
  await seedFirstRunSeen(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await measure(page);
  // The floor zoom is what the degenerate fit fell back to; being off it is the fix.
  expect(phone.scale, "휴대폰 폭에서 지도가 최소 배율에 주저앉았다").toBeGreaterThan(0.25);
  expect(phone.spanShare, "휴대폰 폭에서 지도가 캔버스를 안 쓴다").toBeGreaterThan(0.35);

  await page.setViewportSize({ width: 820, height: 1180 });
  const tablet = await measure(page);
  expect(tablet.spanShare, "태블릿 폭에서 지도가 캔버스를 안 쓴다").toBeGreaterThan(0.35);
  // The panel is a real side panel at this width, and the graph stays clear of it.
  expect(tablet.panelRight, "이 폭에서 INDEX 가 옆 패널이 아니다 — 스펙이 공회전한다").not.toBeNull();
  expect(tablet.leftmost, "지도가 열린 패널 아래로 밀려 들어갔다").toBeGreaterThan(tablet.panelRight!);

  // A desktop width asks for 39% of its canvas, under the half-canvas ceiling: unchanged.
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktop = await measure(page);
  expect(desktop.spanShare).toBeGreaterThan(0.4);
  expect(desktop.scale).toBeGreaterThan(1);
});
