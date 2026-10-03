import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The ego graph draws every neighbour, including the ones another domain holds**
 * (map round, 2026-09-19).
 *
 * Measured before the fix: selecting the exchange-request capability opened
 * its panel, which listed three relations (one parent, one user, two
 * dependencies), while the map drew only the ones inside its own domain. The
 * two dependencies lived in other domains (fulfillment, inventory), so the
 * picture said "this needs nothing from elsewhere". The flat dial
 * (2026-10-02) folds nothing, and a focused capability keeps its needs drawn
 * and named beside the detail panel, read from the frame the dial painted.
 */
type DialProbe = {
  owns: boolean;
  discs: Array<{ id: string; x: number; y: number; r: number }>;
  texts: Array<{ id: string | null; text: string }>;
};
type Probe = {
  dial: () => DialProbe;
  selection: () => { nodeId: string | null };
  camera: () => { x: number; y: number };
  cameraTarget: () => { x: number; y: number };
};

const NEEDS = ["capability:return-pickup", "capability:stock-reservation"];

test("선택한 개념이 다른 도메인의 이웃도 지도에 나온다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Aexchange-request", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __atlasMap?: Probe }).__atlasMap?.selection().nodeId ?? null), { timeout: 15_000 })
    .toBe("capability:exchange-request");
  // Under a selection the focus ring keeps breathing, so node stillness never
  // arrives; the camera coming to rest is the frame this spec reads.
  await waitForMapStill(page, { what: "camera" });

  const read = await page.evaluate((needs) => {
    const m = (window as unknown as { __atlasMap: Probe }).__atlasMap;
    const c = m.camera();
    const t = m.cameraTarget();
    const dial = m.dial();
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="map-detail-panel"]')!.getBoundingClientRect();
    return {
      gap: Math.hypot(c.x - t.x, c.y - t.y),
      owns: dial.owns,
      panelLeft: panel.left,
      canvasLeft: box.left,
      discs: needs.map((id) => {
        const d = dial.discs.find((p) => p.id === id);
        return d ? { id, left: box.left + d.x - d.r, right: box.left + d.x + d.r } : null;
      }),
      named: needs.filter((id) => dial.texts.some((text) => text.id === id)),
    };
  }, NEEDS);

  // The camera has arrived: the focus target lies inside its leash, so the idle
  // gate can close. Before, the target sat 370 world units out and the loop ran
  // at full frame rate for as long as the node stayed selected.
  expect(read.gap, "카메라가 목표에 닿지 못하고 있다").toBeLessThan(0.5);
  expect(read.owns, "평면 다이얼이 이 화면을 그리지 않는다").toBe(true);
  for (const [i, id] of NEEDS.entries()) {
    const disc = read.discs[i];
    expect(disc, `${id} 가 그려지지 않았다`).not.toBeNull();
    // Drawn is not seen: before the screen-sized leash the two dependencies
    // landed under the panel (x 1349 and 1369, panel from 1128).
    expect(disc!.right, `${id} 가 상세 패널 아래에 있다`).toBeLessThan(read.panelLeft);
    expect(disc!.left, `${id} 가 캔버스 왼쪽 밖으로 밀렸다`).toBeGreaterThan(read.canvasLeft);
  }
  expect(read.named, "다른 도메인의 이웃 이름이 없다").toEqual(NEEDS);
});
