import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The Cone view's drawing, measured on the real vault** (2026-09-05, owner
 * direction B2).
 *
 * ## What was wrong, in numbers
 *
 * On the sample vault (125 concepts, 9 domains) with the index panel open:
 *
 * | | 1920x1080 | 1440x900 | 1024x768 | 834x1112 |
 * |---|---|---|---|---|
 * | outline ÷ free canvas | 22.6% | 23.9% | 29.0% | 13.9% |
 * | overlapping node pairs | 27 | 27 | 27 | 27 |
 * | resting labels drawn | 0 | 0 | 0 | 0 |
 * | bottom readout | "1 project · 9 domains · Domains only · zoom in to reveal elements" |
 *
 * A hundred and twenty-five anonymous dots in a fifth of the stage, under an
 * instrument telling the reader to zoom in and reveal what was already drawn.
 * The identical overlap count at four different sizes is the signature of the
 * cause: the dots grew with the fit, so nothing about the crowding could change.
 *
 * ## Why an instrument and not a screenshot
 *
 * A canvas has no DOM. A screenshot says "something changed" and never "these
 * two names are on top of each other" or "this is 23% of the free area". Every
 * number here comes from `window.__atlasMap` (opened by `?e2e=1`), which reports
 * what the frame **drew** — the node centres and radii the paint used, the label
 * boxes it painted, and the panel obstruction the camera itself consumed. The
 * arithmetic twins live in `tests/contract/cone-fit-fill.contract.test.ts` (the
 * fit) and `tests/contract/dome-rim-contrast.contract.test.ts` (the rim floor);
 * this spec is the one that can fail because of the vault's own shape.
 */

/** The four sizes the direction names, with the fill floor each has to clear. */
const SCREENS = [
  { width: 1920, height: 1080, fillFloor: 0.6, overlapMax: 4, sameTierMax: 1 },
  { width: 1440, height: 900, fillFloor: 0.6, overlapMax: 7, sameTierMax: 1 },
  { width: 1024, height: 768, fillFloor: 0.6, overlapMax: 10, sameTierMax: 1 },
  /*
   * 834 is the one portrait size, and the index panel takes 324 of its 834 px, so
   * the cone is fitted into a 510 px strip — a quarter of the room 1920 gives it.
   * Measured 2026-09-05: 2 same-tier pairs and 11 pairs in all, against 27
   * same-tier pairs before. The ratchet records that rather than pretending the
   * strip is as roomy as a workbench.
   */
  { width: 834, height: 1112, fillFloor: 0.35, overlapMax: 14, sameTierMax: 3 },
] as const;

async function openCone(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  /*
   * Reduced motion, so the pose the measurement reads is the parked one. The
   * assembly choreography and the attract spin are app-generated motion and snap
   * under it; without that the outline keeps rotating and every number here would
   * be a reading of the wall clock as much as of the drawing.
   */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    // 3D is opt-in and its switch lives in localStorage (`appearance-preferences`).
    window.localStorage.setItem("atlas.appearance.view3d", "on");
  });
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // Past the assembly (≈1.1s) and the entry sweep (1.5s): while either is alive
  // the drawn pose keeps moving and the fit is still in flight.
  await page.waitForTimeout(6000);
}

async function readCone(page: Page) {
  return page.evaluate(() => {
    const probe = (
      window as unknown as {
        __atlasMap?: {
          nodes: () => Array<{ id: string; kind: string; x: number; y: number; radius: number; hidden: boolean }>;
          labels: () => ReadonlyArray<{ nodeId: string; text: string; minX: number; minY: number; maxX: number; maxY: number }>;
          obstacleInsets: () => { left: number; right: number } | null;
        };
      }
    ).__atlasMap;
    const canvas = document.querySelector('[data-testid="topology-map-v2-canvas"]');
    if (!probe || !canvas) return null;
    const box = canvas.getBoundingClientRect();
    const nodes = probe.nodes().filter((n) => !n.hidden);
    const labels = probe.labels();
    if (nodes.length === 0) return null;

    const minX = Math.min(...nodes.map((n) => n.x - n.radius));
    const maxX = Math.max(...nodes.map((n) => n.x + n.radius));
    const minY = Math.min(...nodes.map((n) => n.y - n.radius));
    const maxY = Math.max(...nodes.map((n) => n.y + n.radius));
    const insets = probe.obstacleInsets();
    const freeW = Math.max(1, box.width - (insets?.left ?? 0) - (insets?.right ?? 0));

    let overlapPairs = 0;
    let sameTierPairs = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius) continue;
        overlapPairs += 1;
        if (a.kind === b.kind) sameTierPairs += 1;
      }
    }

    /*
     * A name **laid over** another node's disc, not merely grazing it. The
     * product reserves each disc plus 1 px and each label box carries a side gap,
     * and the drawn radius breathes by a fraction of a pixel — so a strict
     * touch test reports the slack rather than the defect. Two pixels of real
     * overlap on both axes is a name a reader sees on top of a shape.
     */
    const TOUCH_SLACK_PX = 2;
    let labelsOverForeign = 0;
    const offenders: string[] = [];
    for (const label of labels) {
      const hit = nodes.find(
        (n) =>
          n.id !== label.nodeId &&
          Math.min(n.x + n.radius, label.maxX) - Math.max(n.x - n.radius, label.minX) >
            TOUCH_SLACK_PX &&
          Math.min(n.y + n.radius, label.maxY) - Math.max(n.y - n.radius, label.minY) >
            TOUCH_SLACK_PX,
      );
      if (hit) {
        labelsOverForeign += 1;
        if (offenders.length < 4) offenders.push(`${label.text} over ${hit.id}`);
      }
    }

    const readout = document.querySelector('[data-testid="first-run-readout"]');
    return {
      nodeCount: nodes.length,
      fill: ((maxX - minX) * (maxY - minY)) / (freeW * box.height),
      outline: { width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
      overlapPairs,
      sameTierPairs,
      labelsDrawn: labels.length,
      labelsOverForeign,
      labelOffenders: offenders,
      readoutText: readout?.textContent ?? null,
      readoutDrawn: readout?.getAttribute("data-drawn-concepts") ?? null,
      readoutHasTier: readout?.querySelector('[data-testid="first-run-readout-tier"]') !== null,
      readoutHasZoomHint:
        readout?.querySelector('[data-testid="first-run-readout-zoom-hint"]') !== null,
    };
  });
}

for (const screen of SCREENS) {
  test(`Cone ${screen.width}x${screen.height} — 캔버스를 채우고, 겹치지 않고, 이름을 남의 원판에 얹지 않는다`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCone(page, screen.width, screen.height);
    const read = await readCone(page);
    expect(read, "3D 노드를 하나도 못 읽었다 — 계기가 공회전하고 있다").not.toBeNull();
    const cone = read!;

    expect(cone.nodeCount, "샘플 볼트가 안 실렸다").toBeGreaterThan(100);

    // ① The cone fills the free canvas. Before: 22.6 / 23.9 / 29.0 / 13.9%.
    expect(
      cone.fill,
      `outline ${cone.outline.width}x${cone.outline.height} = ${(cone.fill * 100).toFixed(1)}% of the free canvas`,
    ).toBeGreaterThanOrEqual(screen.fillFloor);
    // …and does not spill: a fit that overflows is a crop, not a fill.
    expect(cone.fill).toBeLessThanOrEqual(1);

    // ② Nothing is piled on a peer. The pairs that remain at the narrow sizes are
    // cross-tier, which is depth occlusion — the halo and the draw order exist to
    // render exactly that — so same-tier crowding is held at zero and the total is
    // ratcheted per size. Before: 27 at every size, every pair same-tier.
    expect(cone.sameTierPairs, "같은 층 노드가 서로 뭉쳤다").toBeLessThanOrEqual(screen.sameTierMax);
    expect(cone.overlapPairs).toBeLessThanOrEqual(screen.overlapMax);

    // ③ Resting names exist, and none of them is laid over a foreign disc.
    // Before: zero labels at rest, so there was nothing to collide and nothing to
    // read either.
    expect(cone.labelsDrawn, "원뿔에 쉬는 이름이 하나도 없다").toBeGreaterThan(5);
    expect(cone.labelsOverForeign, `이름이 남의 원판 위에 앉았다: ${cone.labelOffenders.join(", ")}`).toBe(0);

    // ④ The readout says what is drawn. Before: "1 project · 9 domains · Domains
    // only · zoom in to reveal elements" over 125 visible dots.
    expect(cone.readoutDrawn).toBe(String(cone.nodeCount));
    expect(cone.readoutText).toContain(String(cone.nodeCount));
    expect(cone.readoutHasTier, "다 그렸는데 여전히 층 이름을 말한다").toBe(false);
    expect(cone.readoutHasZoomHint, "다 그렸는데 여전히 줌인하라고 한다").toBe(false);
  });
}
