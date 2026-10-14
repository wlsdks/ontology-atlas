import { expect, test } from "@playwright/test";
import { waitForMapSettled } from "../../settle";

/** Reduced motion, deliberately: this spec measures the **resting** frame. */
test.use({ contextOptions: { reducedMotion: "reduce" } });

/**
 * Measured from the boxes the frame actually drew via `__atlasMap.labels()`: names collide
 * long before node discs do, and the LOD presence ramp can differ from the placer's decision.
 * Overlap must be zero; clearance is only recorded, as the placer answers crowding by dropping labels.
 */

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
    await page.goto("/ko/topology/?e2e=1&guides=off");
    await page.waitForFunction(
      () => Boolean((window as unknown as { __atlasMap?: { labels?: unknown } }).__atlasMap?.labels),
      undefined,
      { timeout: 20_000 },
    );
    /*
     * Reduced motion snaps the assembly, so read the moment it settles, before the map's ambient
     * sleep (3s idle) leaves the canvas's last frame with too few label boxes.
     */
    await waitForMapSettled(page);

    const labels = (await page.evaluate(() =>
      (
        window as unknown as { __atlasMap: { labels: () => LabelBox[] } }
      ).__atlasMap.labels(),
    )) as LabelBox[];

    // Anti-idle: an empty or near-empty frame would pass every assertion below.
    expect(labels.length, "라벨을 거의 못 그렸다 — 이 시험이 헛돈다").toBeGreaterThan(5);

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

    /* The flat dial places names whole or not at all, so assert its own count of overlapping texts. */
    const dial = await page.evaluate(
      () => (window as unknown as { __atlasMap: { dial: () => { owns: boolean; textOverlaps?: number } } }).__atlasMap.dial(),
    );
    expect(dial.owns, "the dial does not paint the topology map's overview").toBe(true);
    expect(dial.textOverlaps, "the dial drew two of its texts on top of each other").toBe(0);
  });
});
