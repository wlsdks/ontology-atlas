import { expect, test } from "@playwright/test";
import { waitForMapStill } from "./settle";

/** Reduced motion, deliberately: this spec measures the **resting** frame. */
test.use({ contextOptions: { reducedMotion: "reduce" } });

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

interface LabelBox {
  nodeId: string;
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

test.describe("지도 라벨 — 그려진 박스로 잰다", () => {
  /**
   * A name must not paint across a neighbouring shape either. Until 2026-09-03 only ego members
   * and the hovered node reserved their discs, so with every domain open on the dogfood vault
   * twelve labels crossed a leaf or hub ring — visible the moment the ink ladder made those rings
   * readable. Every drawn disc now reserves its footprint; a blocked name flips above its node
   * before it is dropped. This case measures the crowded frame that exposed it.
   */
  test("펼친 구름에서 이름이 다른 노드의 원판을 덮지 않는다", async ({ page }) => {
    await page.goto("/ko/topology/?e2e=1&guides=off");
    await page.waitForFunction(
      () => Boolean((window as unknown as { __atlasMap?: { labels?: unknown } }).__atlasMap?.labels),
      undefined,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /전체 펼치기/ }).click();
    // The expansion is on, and the opened cloud has stopped moving.
    await expect(page.getByTestId("topology-expand-all")).toHaveAttribute("aria-pressed", "true");
    await waitForMapStill(page);

    const { labels, nodes } = (await page.evaluate(() => {
      const map = (
        window as unknown as {
          __atlasMap: {
            labels: () => LabelBox[];
            nodes: () => { id: string; label: string; x: number; y: number; radius: number }[];
          };
        }
      ).__atlasMap;
      return { labels: map.labels(), nodes: map.nodes() };
    })) as {
      labels: LabelBox[];
      nodes: { id: string; label: string; x: number; y: number; radius: number }[];
    };

    expect(labels.length, "라벨을 거의 못 그렸다 — 이 시험이 헛돈다").toBeGreaterThan(5);
    expect(nodes.length, "구름이 펼쳐지지 않았다 — 이 시험이 헛돈다").toBeGreaterThan(40);

    const crossings: string[] = [];
    for (const label of labels) {
      for (const node of nodes) {
        if (node.id === label.nodeId) continue;
        const minX = node.x - node.radius;
        const maxX = node.x + node.radius;
        const minY = node.y - node.radius;
        const maxY = node.y + node.radius;
        if (label.minX < maxX && minX < label.maxX && label.minY < maxY && minY < label.maxY) {
          const w = Math.round(Math.min(label.maxX, maxX) - Math.max(label.minX, minX));
          const h = Math.round(Math.min(label.maxY, maxY) - Math.max(label.minY, minY));
          crossings.push(`${w}x${h}px  「${label.text}」 over 「${node.label}」`);
        }
      }
    }
    expect(
      crossings,
      `이름이 다른 노드의 원판 위에 그려졌다 — 둘 다 읽을 수 없다:\n${crossings.join("\n")}`,
    ).toEqual([]);
  });
});
