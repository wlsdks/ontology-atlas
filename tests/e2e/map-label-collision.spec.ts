import { expect, test } from "@playwright/test";

/**
 * Map labels must not overlap — measured from the boxes the frame actually drew.
 *
 * ## Why this needs an instrument at all
 *
 * The map is a canvas. It has no DOM, so a spec can otherwise only diff pixels,
 * which reports *"something changed"* and never *"these two names are on top of
 * each other"*. Node centres are not a substitute either: measured 2026-08-22 on
 * `/download`'s evidence map, disc overlaps were **zero** on a frame whose names
 * were visibly crowding. Names collide long before discs do.
 *
 * `__atlasMap.labels()` returns the boxes recorded at the draw call, so what is
 * asserted here is what was painted — not what the placer decided. Those differ:
 * the LOD presence ramp can still put a candidate on screen after placement.
 *
 * ## What is asserted, and what is deliberately not
 *
 * **Overlap must be zero.** Two names sharing pixels is unreadable, full stop.
 *
 * **Clearance is only recorded, not enforced.** The obvious next step — require a
 * minimum gap — was tried and reverted the same day: raising the vertical box by
 * 2px dropped the drawn labels from **32 to 24** while the tightest pairs stayed
 * at 0px. The placer answers crowding by discarding labels, so a clearance floor
 * buys silence, not readability. If crowding is to be fixed it has to be fixed in
 * layout, and this spec is the instrument that will tell whether it worked.
 */

const MAP_ROUTE = "/ko/download/?e2e=1";

interface LabelBox {
  nodeId: string;
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

test.describe("지도 라벨 — 그려진 박스로 잰다", () => {
  test("이름이 서로 겹치지 않는다", async ({ page }) => {
    await page.goto(MAP_ROUTE);
    await page.getByTestId("download-stage-map-frame").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => Boolean((window as unknown as { __atlasMap?: { labels?: unknown } }).__atlasMap?.labels),
      undefined,
      { timeout: 20_000 },
    );
    // The map assembles with a homing spring; labels are placed per frame, so the
    // reading has to be taken after it settles (measured ~1.2s, with margin here).
    await page.waitForTimeout(6_000);

    const labels = (await page.evaluate(() =>
      (
        window as unknown as { __atlasMap: { labels: () => LabelBox[] } }
      ).__atlasMap.labels(),
    )) as LabelBox[];

    // Anti-idle: an empty or near-empty frame would pass every assertion below.
    expect(labels.length, "라벨을 거의 못 그렸다 — 이 시험이 헛돈다").toBeGreaterThan(10);

    const overlaps: string[] = [];
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const a = labels[i];
        const b = labels[j];
        if (a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY) {
          const w = Math.round(Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
          const h = Math.round(Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
          overlaps.push(`${w}x${h}px  「${a.text}」 ↔ 「${b.text}」`);
        }
      }
    }

    expect(
      overlaps,
      `지도에서 두 이름이 픽셀을 공유한다 — 읽을 수 없다:\n${overlaps.join("\n")}`,
    ).toEqual([]);
  });
});
