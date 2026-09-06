import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The Strata view's drawing, measured on the real vault** (2026-09-06).
 *
 * Sibling of `map-3d-cone-drawing.spec.ts`, and deliberately a sibling rather
 * than a fourth row inside it: the two arrangements answer the same containment
 * question with different geometry, so they crowd differently and their numbers
 * are not comparable to a shared threshold. Reading the two files side by side is
 * how a person sees which arrangement is paying what.
 *
 * ## The three measurements, and what they measured here
 *
 * Every number comes from `window.__atlasMap` (opened by `?e2e=1`), which reports
 * what the frame **drew**. Measured on the sample vault (125 concepts, 9 domains)
 * with the index panel open, at the two sizes the owner reviews on:
 *
 * | | 1512x982 | 1040x720 | Cone, same sizes |
 * |---|---|---|---|
 * | outline ÷ free canvas | 65.5% | 72.5% | 73.4% / 69.2% |
 * | overlapping node pairs | **0** | **2** | 4 / 8 |
 * | same-tier overlapping pairs | 0 | 0 | 0 / 0 |
 * | resting labels drawn | 15 | 11 | 15 / 13 |
 *
 * Strata crowds **less** than the cone at both sizes, and two things earn that: a
 * plane spreads its tier across a whole disc instead of packing it under one
 * parent, and each plane alternates two radii so neighbours from different
 * parents cannot fuse (`applyLanes` in `model/dome-view.ts`). What it pays is
 * silhouette width, which is why the fill floors below are not simply the cone's.
 *
 * The floors are set a few points under the measured value and the ceilings a few
 * pairs above it — a gate pinned to the exact number fails on the first
 * legitimate vault edit.
 */

/** The two sizes the owner reviews on, with the floor and ceiling each has to hold. */
const SCREENS = [
  { width: 1512, height: 982, fillFloor: 0.58, overlapMax: 3, sameTierMax: 1 },
  { width: 1040, height: 720, fillFloor: 0.63, overlapMax: 5, sameTierMax: 1 },
] as const;

async function openStrata(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  /*
   * Reduced motion, so the pose the measurement reads is the parked one — the
   * same reason the cone spec does it. The assembly choreography and the attract
   * spin are app-generated motion and snap under it; without that the outline
   * keeps moving and every number here would be a reading of the wall clock.
   */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "strata");
  });
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // Past the assembly (≈1.1s) and the entry sweep (1.5s): while either is alive
  // the drawn pose keeps moving and the fit is still in flight.
  await page.waitForTimeout(6000);
}

async function readStrata(page: Page) {
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
     * The same two label rules the cone spec measures, for the same reasons: a
     * name laid over a disc (its own included) is unreadable, and a name that has
     * drifted off its own disc names the wrong shape. Both come from the shared
     * placer, so a break here would be a break there too — which is exactly why
     * this gate must not assume the cone's file is enough.
     */
    const TOUCH_SLACK_PX = 2;
    let labelsOverAnyDisc = 0;
    const offenders: string[] = [];
    for (const label of labels) {
      const hit = nodes.find(
        (n) =>
          Math.min(n.x + n.radius, label.maxX) - Math.max(n.x - n.radius, label.minX) > TOUCH_SLACK_PX &&
          Math.min(n.y + n.radius, label.maxY) - Math.max(n.y - n.radius, label.minY) > TOUCH_SLACK_PX,
      );
      if (hit) {
        labelsOverAnyDisc += 1;
        if (offenders.length < 4) {
          offenders.push(`"${label.text}" over ${hit.id === label.nodeId ? "its own disc" : hit.id}`);
        }
      }
    }

    const MAX_ANCHOR_GAP_PX = 24;
    const MAX_ANCHOR_DX_PX = 2;
    let labelsUnanchored = 0;
    const unanchored: string[] = [];
    for (const label of labels) {
      const owner = nodes.find((n) => n.id === label.nodeId);
      if (!owner) continue;
      const centreX = (label.minX + label.maxX) / 2;
      const below = label.minY >= owner.y;
      const gap = below ? label.minY - (owner.y + owner.radius) : owner.y - owner.radius - label.maxY;
      const dx = Math.abs(centreX - owner.x);
      if (gap > MAX_ANCHOR_GAP_PX || dx > MAX_ANCHOR_DX_PX) {
        labelsUnanchored += 1;
        if (unanchored.length < 4) unanchored.push(`"${label.text}" gap ${gap.toFixed(1)}px dx ${dx.toFixed(1)}px`);
      }
    }

    /*
     * **Height still carries the tier.** This is the one measurement the cone
     * spec has no use for and Strata cannot ship without: if the planes ever
     * stopped stacking on screen, "which level am I looking at" — the whole
     * reason this arrangement exists — would be answered wrongly by the picture
     * while every other number here stayed green.
     *
     * What is measured is each tier's **median** drawn y, not its full band. The
     * bands necessarily interleave and that is correct: a plane is seen at an
     * angle, so its near arc draws lower than the far arc of the plane under it —
     * that overlap *is* the perspective. What must never invert is the order of
     * the four centres, and that is what a reader reads as "this level is above
     * that one".
     */
    const byKind: Record<string, number[]> = {};
    for (const node of nodes) (byKind[node.kind] ??= []).push(node.y);
    const order = ["project", "domain", "capability", "element"].filter((k) => byKind[k]);
    const medianY = order.map((kind) => {
      const ys = [...byKind[kind]].sort((a, b) => a - b);
      return Math.round(ys[Math.floor(ys.length / 2)]);
    });
    let tierBandOverlaps = 0;
    for (let i = 0; i + 1 < medianY.length; i += 1) {
      // Down the screen is +y, and the project plane is the highest.
      if (medianY[i] >= medianY[i + 1]) tierBandOverlaps += 1;
    }

    return {
      nodeCount: nodes.length,
      fill: ((maxX - minX) * (maxY - minY)) / (freeW * box.height),
      outline: { width: Math.round(maxX - minX), height: Math.round(maxY - minY) },
      overlapPairs,
      sameTierPairs,
      labelsDrawn: labels.length,
      labelsOverAnyDisc,
      labelOffenders: offenders,
      labelsUnanchored,
      unanchoredLabels: unanchored,
      tierOrder: order,
      medianY,
      tierBandOverlaps,
    };
  });
}

for (const screen of SCREENS) {
  test(`Strata ${screen.width}x${screen.height} — fills the canvas, keeps its tiers apart, and keeps names off discs`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStrata(page, screen.width, screen.height);
    const read = await readStrata(page);
    expect(read, "read no 3D nodes at all — the instrument is idling").not.toBeNull();
    const strata = read!;

    expect(strata.nodeCount, "the sample vault did not load").toBeGreaterThan(100);

    // (1) The planes fill the free canvas. Measured 65.5% / 72.5%.
    expect(
      strata.fill,
      `outline ${strata.outline.width}x${strata.outline.height} = ${(strata.fill * 100).toFixed(1)}% of the free canvas`,
    ).toBeGreaterThanOrEqual(screen.fillFloor);
    expect(strata.fill, "a fit that overflows is a crop, not a fill").toBeLessThanOrEqual(1);

    // (2) Nothing is piled on a peer. Measured 0 pairs / 2 pairs, none same-tier
    // (the cone draws 4 and 8 on the same vault and the same two sizes).
    expect(strata.sameTierPairs, "two nodes on one plane fused").toBeLessThanOrEqual(screen.sameTierMax);
    expect(strata.overlapPairs).toBeLessThanOrEqual(screen.overlapMax);

    // (3) Resting names exist, none is laid over a disc, and each still names its
    // own node. Measured 15 / 11 names, zero offenders of either kind.
    expect(strata.labelsDrawn, "Strata drew no resting names").toBeGreaterThan(5);
    expect(strata.labelsOverAnyDisc, `a name sat on a disc: ${strata.labelOffenders.join(", ")}`).toBe(0);
    expect(strata.labelsUnanchored, `a name drifted off its disc: ${strata.unanchoredLabels.join(", ")}`).toBe(0);

    // (4) Strata's own fact: height is the tier. Four plane centres, in order.
    expect(strata.tierOrder).toEqual(["project", "domain", "capability", "element"]);
    expect(
      strata.tierBandOverlaps,
      `two tiers stopped stacking — median y by tier was ${strata.medianY.join(" > ")}`,
    ).toBe(0);
  });
}
