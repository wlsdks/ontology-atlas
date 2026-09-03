import { expect, test } from "@playwright/test";
import { LABEL_TOP_K } from "../../src/widgets/topology-map-v2/model/label-lod";
import { EVIDENCE_SPECIMEN } from "../../src/views/download/model/evidence-specimen.generated";

/**
 * Reduced motion, deliberately: this spec measures the **resting** frame. The evidence section
 * now runs a one-shot linked demo (ego focus walking the specimen's relations, 2026-08-23), and
 * ego members are exempt from the label budget — measured mid-demo the frame legitimately carries
 * top-K plus the neighbourhood. Without pinning motion off, the reading races the choreography
 * and this spec flakes on timing. Reduced motion skips the demo (its own contract), so what is
 * measured is the frame every reader ends at.
 */
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
    /*
     * Under reduced motion (pinned above) the assembly snaps, so there is no spring to outwait —
     * and waiting the old 6s reads **after the gateway's ambient sleep** (3s idle): the sleeping
     * canvas's last frame carried ≤5 label boxes (measured 2026-08-23) and the anti-idle guard
     * below fired. 2s is after the snap settles and before sleep.
     */
    await page.waitForTimeout(2_000);

    const labels = (await page.evaluate(() =>
      (
        window as unknown as { __atlasMap: { labels: () => LabelBox[] } }
      ).__atlasMap.labels(),
    )) as LabelBox[];

    // Anti-idle: an empty or near-empty frame would pass every assertion below.
    expect(labels.length, "라벨을 거의 못 그렸다 — 이 시험이 헛돈다").toBeGreaterThan(5);

    /*
     * **The overview label budget applies here.** The gateway pulls the tier-reveal bands
     * forward so every dot exists at entry (its caption-honesty contract), and until 2026-08-23
     * that same override classified entry zoom as leaf-reading altitude and lifted the top-K
     * budget — all 82 labels raced the greedy placer and 33 landed wherever they fit, stacked
     * into walls (the owner's report: the map looks messy). The budget band now classifies
     * against the canonical zoom grammar, so entry is overview and at most `LABEL_TOP_K`
     * candidates may place. Nothing at rest is hovered or focused, so no exemption can exceed it.
     */
    expect(
      labels.length,
      `그려진 라벨 ${labels.length}개가 개관 예산(${LABEL_TOP_K})을 넘는다 — ` +
        "예산이 다시 풀렸다: 잎 라벨이 벽처럼 쌓인다",
    ).toBeLessThanOrEqual(LABEL_TOP_K);

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
    await page.waitForTimeout(2_500);

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

  /**
   * The linked demo drives the engine's focus with node ids the generator derived from the vault
   * (`EVIDENCE_SPECIMEN.facts.*.nodeId`). An id that stops matching a real node fails **silently**
   * — the engine just focuses nothing and the demo walks an empty stage. So the three ids are
   * checked against the nodes the map actually drew.
   */
  test("연결 시연이 모는 노드 id 셋이 실제 지도에 있다", async ({ page }) => {
    await page.goto(MAP_ROUTE);
    await page.getByTestId("download-stage-map-frame").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => Boolean((window as unknown as { __atlasMap?: { nodes?: unknown } }).__atlasMap?.nodes),
      undefined,
      { timeout: 20_000 },
    );
    const ids = new Set(
      (await page.evaluate(() =>
        (window as unknown as { __atlasMap: { nodes: () => { id: string }[] } }).__atlasMap
          .nodes()
          .map((node) => node.id),
      )) as string[],
    );
    expect(ids.size, "지도가 노드를 하나도 안 그렸다 — 이 시험이 헛돈다").toBeGreaterThan(10);
    for (const nodeId of [
      EVIDENCE_SPECIMEN.facts.name.nodeId,
      EVIDENCE_SPECIMEN.facts.domain.nodeId,
      EVIDENCE_SPECIMEN.facts.dependency.nodeId,
    ]) {
      expect(ids.has(nodeId), `시연이 모는 ${nodeId} 가 지도에 없다 — 빈 무대를 걷는다`).toBe(true);
    }
  });
});
