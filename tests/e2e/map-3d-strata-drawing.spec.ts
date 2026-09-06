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
 * | …after the tier legend took its column (2026-09-06) | 66.3% | 63.6% | unchanged |
 * | …after the column became conditional (2026-09-07) | 66.3% | **73.4%** | unchanged |
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

/**
 * The two sizes the owner reviews on, with the floor and ceiling each has to hold.
 *
 * **1040 paid for the legend rail on 2026-09-06, and stopped paying on
 * 2026-09-07.** Strata's four tier names moved off the plane rims — where at this
 * very size they were drawn on top of the graph — onto a legend rail at the
 * canvas's right edge, and the fit kept that rail's column clear
 * (`TIER_LEGEND_RESERVE_PX`, 56 px). On a 976 px canvas that is 6% of the width,
 * and width is what binds the fit here, so the outline fell to **565 × 529 =
 * 63.6%** from 72.5% and two element pairs on one plane began to touch where none
 * did. At 1512 the fit is bound by height instead and the same reservation costs
 * nothing: **888 × 824 = 66.3%**.
 *
 * The rail is not what was wrong; taking that column unconditionally was.
 * `tierLegendPlacement` now decides from the fit's own free box, so the column is
 * reserved only where it was going to go unused, and at 1040 the four names become
 * a compact corner stack in the bottom-right corner the plane rims curve away
 * from. Measured after: **607 × 567 = 73.4%** — above even the 72.5% of before the
 * rail existed, because the corner stack asks for nothing — **0** same-tier
 * touching pairs, and 2 overlapping pairs down from 5. 1512 is unchanged at 66.3%
 * with the rail still on the edge. Ledger: `docs/DECISIONS.md`, 2026-09-06 and
 * 2026-09-07.
 */
const SCREENS = [
  { width: 1512, height: 982, fillFloor: 0.58, overlapMax: 3, sameTierMax: 1, stolenMax: 1 },
  { width: 1040, height: 720, fillFloor: 0.66, overlapMax: 4, sameTierMax: 1, stolenMax: 1 },
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

/**
 * **Pointing at a node's drawn centre answers with that node** (2026-09-06).
 *
 * `__atlasMap.nodes()` reports where the frame drew each disc, and every other
 * number in this file trusts that coordinate. When the pointer disagrees with it,
 * the suite is measuring one picture while the person is clicking another. It did
 * disagree: the 5 px courtesy ring that makes a 3.5 px element pressable used to
 * compete with the painted disc on equal terms, and because depth was decided
 * before distance, a near domain answered for the far elements drawn beside it,
 * 15 px away, with none of its ink under the cursor.
 *
 * The sweep is the whole vault rather than a sample, because the victims are the
 * small discs and a handful picked by size never included one: with the rule
 * reverted, five spine nodes still answered correctly and an earlier version of
 * this case stayed green (gate probe, 2026-09-06). What is asserted is the rule
 * itself. A node may lose its own centre to a node **drawn over it** — that is
 * depth, and the halo and the draw order exist to show it — and to nothing else.
 * Measured before the fix, sweeping all 125: 124 of 125 answered here at
 * 1512×982 and 123 of 125 at 1040×720, the rest to a disc that covered nothing.
 */
async function settleCamera(page: Page) {
  let previous: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    const camera = await page.evaluate(() =>
      JSON.stringify((window as unknown as { __atlasMap: { camera: () => unknown } }).__atlasMap.camera()),
    );
    if (camera === previous) return;
    previous = camera;
    await page.waitForTimeout(150);
  }
}

type DrawnNode = { id: string; label: string; x: number; y: number; radius: number; hidden: boolean };

async function drawnNodes(page: Page): Promise<DrawnNode[]> {
  return page.evaluate(() =>
    (window as unknown as { __atlasMap: { nodes: () => DrawnNode[] } }).__atlasMap
      .nodes()
      .filter((n) => !n.hidden),
  );
}

/** A canvas point with no drawn disc within 40 px — clicking it clears the focus. */
async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="topology-map-v2-canvas"]')!.getBoundingClientRect();
    const nodes = (
      window as unknown as {
        __atlasMap: { nodes: () => Array<{ x: number; y: number; radius: number; hidden: boolean }> };
      }
    ).__atlasMap
      .nodes()
      .filter((n) => !n.hidden);
    for (let y = 40; y < canvas.height - 40; y += 20) {
      for (let x = 360; x < canvas.width - 90; x += 20) {
        if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + 40)) return { x, y };
      }
    }
    return { x: canvas.width - 40, y: canvas.height - 40 };
  });
}

for (const screen of SCREENS) {
  test(`Strata ${screen.width}x${screen.height} — a node's drawn centre answers with that node`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openStrata(page, screen.width, screen.height);
    const canvas = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')!.getBoundingClientRect();
      return { x: box.x, y: box.y };
    });

    // ① The sweep. Nothing is focused, so the pointer's answer is the hit test's
    // and the camera never moves under it.
    const nodes = await drawnNodes(page);
    expect(nodes.length, "the sample vault did not load").toBeGreaterThan(100);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let answered = 0;
    const stolen: string[] = [];
    for (const node of nodes) {
      await page.mouse.move(canvas.x + node.x, canvas.y + node.y);
      const got = await page.evaluate(
        () => (window as unknown as { __atlasMap: { hover: () => string | null } }).__atlasMap.hover(),
      );
      if (got === node.id) {
        answered += 1;
        continue;
      }
      if (got === null) continue; // not hittable this frame — a different rule's business
      const winner = byId.get(got);
      // Losing your own centre to a disc drawn over it is depth, not a defect.
      const covers = winner !== undefined && Math.hypot(winner.x - node.x, winner.y - node.y) <= winner.radius;
      if (!covers) stolen.push(`${node.id} (r ${node.radius.toFixed(1)}) answered ${got}`);
    }
    /*
     * **Ratcheted at one, not pinned at zero, and the one is a different defect.**
     * A node can be drawn and still be absent from the hit test: `isNodeHittable`
     * reads the alpha the frame painted, and depth fog can take a far element
     * under that threshold while it is still a visible dot. When that happens the
     * node is not competing at all, and whichever disc reaches it through the
     * slack ring answers. Measured here both before and after the ink rule
     * changed: the same single node at 1512×982
     * (`element:stock-snapshot` losing to `domain:loyalty`, which paints nothing
     * at that point), which is why it cannot be this rule's doing. Fixing that one
     * is a question about the fog's hittability threshold, not about ranking.
     * Planting the old rule back returns 3 at 1040×720 (gate probe, 2026-09-06),
     * so this still fails on the defect it was written for.
     */
    expect(
      stolen.length,
      `a disc that paints nothing at that point took the answer: ${stolen.slice(0, 6).join(", ")}`,
    ).toBeLessThanOrEqual(screen.stolenMax);
    expect(answered / nodes.length, "too few discs answered at all — the instrument is idling").toBeGreaterThan(0.9);

    // ② …and the click path agrees with the pointer, on five of them, with the
    // panel naming the concept. Two pixels off centre where the disc allows it.
    const wanted = [0, 2, -2, 0, 2];
    const chosen = nodes.filter((n) => n.radius > 3).slice(0, 5);
    expect(chosen.length).toBe(5);
    for (let i = 0; i < chosen.length; i += 1) {
      // Back to the overview between clicks: with a node focused the ego dim and
      // the tier reveal decide what is hittable, and a miss would then be telling
      // us about the focus state rather than about the drawn centre.
      if (i > 0) {
        const spare = await emptyPoint(page);
        await page.mouse.click(canvas.x + spare.x, canvas.y + spare.y);
        await page.waitForTimeout(400);
      }
      await settleCamera(page);
      const drawn = await drawnNodes(page);
      const node = drawn.find((n) => n.id === chosen[i].id);
      expect(node, `${chosen[i].id} left the frame`).toBeTruthy();
      const clear = (dx: number) =>
        Math.abs(dx) <= node!.radius &&
        !drawn.some(
          (other) =>
            other.id !== node!.id && Math.hypot(other.x - (node!.x + dx), other.y - node!.y) <= other.radius,
        );
      const offset = clear(wanted[i]) ? wanted[i] : 0;
      await page.mouse.click(canvas.x + node!.x + offset, canvas.y + node!.y);
      await page.waitForTimeout(500);
      const selection = await page.evaluate(
        () =>
          (
            window as unknown as { __atlasMap: { selection: () => { nodeId: string | null; edge: unknown } } }
          ).__atlasMap.selection(),
      );
      expect(
        selection.nodeId,
        `clicking ${node!.id} at its drawn centre${offset ? ` ${offset > 0 ? "+" : ""}${offset}px` : ""} selected ${selection.nodeId ?? "nothing"}${selection.edge ? " (a relation)" : ""}`,
      ).toBe(node!.id);
      await expect(page.locator('[data-testid="topology-v2-detail-panel"]').first()).toContainText(node!.label);
    }
  });
}

/**
 * **The tier names land on nothing, at either size and in either placement**
 * (2026-09-06, extended 2026-09-07).
 *
 * They used to hang on the plane rims, and at 1040×720 that put them over the
 * graph — the fit takes the widest plane's rim to the canvas edge, so outside the
 * ring there is nowhere to hang a name. What replaces them has to be checked for
 * the same failure it was built to end, plus the two neighbours it could walk
 * into: the utility tiles above it and the selected-node inspector beside it.
 *
 * Since 2026-09-07 there are two placements, chosen by whether the rail's column
 * is width the fit was going to use (`model/tier-legend-rows.ts#tierLegendPlacement`):
 * the aligned rail at 1512×982, the compact corner stack at 1040×720, where the
 * rail was costing the graph 6% of the canvas. Both are checked here, and which
 * one is expected at which size is pinned — a legend that quietly reverted to the
 * rail at 1040 would take that width back with nothing on screen to say so.
 */
for (const legend of [
  { width: 1512, height: 982, placement: "rail" },
  { width: 1040, height: 720, placement: "corner" },
] as const) {
test(`Strata ${legend.width}x${legend.height} — the tier legend names four planes without landing on anything`, async ({ page }) => {
  test.setTimeout(120_000);
  await openStrata(page, legend.width, legend.height);

  const read = async () =>
    page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="topology-map-v2-canvas"]')!;
      const cb = canvas.getBoundingClientRect();
      const local = (element: Element | null) => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { minX: r.x - cb.x, maxX: r.right - cb.x, minY: r.y - cb.y, maxY: r.bottom - cb.y, h: r.height };
      };
      const rows = [...document.querySelectorAll('[data-testid^="topology-tier-legend-row-"]')].map((el) => ({
        kind: (el as HTMLElement).dataset.tierKind ?? "",
        text: el.textContent ?? "",
        rect: local(el)!,
      }));
      const chrome = [
        "topology-tour-button",
        "topology-shortcuts-help-button",
        "topology-replay-growth",
        "topology-v2-detail-panel",
        "first-run-readout",
      ]
        .map((id) => ({ id, rect: local(document.querySelector(`[data-testid="${id}"]`)) }))
        .filter((c) => c.rect !== null);
      const probe = (
        window as unknown as {
          __atlasMap: {
            nodes: () => Array<{ x: number; y: number; radius: number; hidden: boolean }>;
            labels: () => ReadonlyArray<{ minX: number; minY: number; maxX: number; maxY: number }>;
          };
        }
      ).__atlasMap;
      const nodes = probe.nodes().filter((n) => !n.hidden);
      const hits: string[] = [];
      for (const row of rows) {
        for (const other of chrome) {
          const r = other.rect!;
          if (row.rect.minX < r.maxX && r.minX < row.rect.maxX && row.rect.minY < r.maxY && r.minY < row.rect.maxY)
            hits.push(`${row.kind} on ${other.id}`);
        }
        for (const n of nodes) {
          if (
            n.x + n.radius > row.rect.minX &&
            n.x - n.radius < row.rect.maxX &&
            n.y + n.radius > row.rect.minY &&
            n.y - n.radius < row.rect.maxY
          )
            hits.push(`${row.kind} on a node`);
        }
        for (const l of probe.labels()) {
          if (l.maxX > row.rect.minX && l.minX < row.rect.maxX && l.maxY > row.rect.minY && l.minY < row.rect.maxY)
            hits.push(`${row.kind} on a node label`);
        }
      }
      const rail = document.querySelector('[data-testid="topology-tier-legend"]') as HTMLElement | null;
      return {
        rows,
        hits,
        placement: rail?.dataset.tierLegendPlacement ?? null,
        selectedPanel: chrome.some((c) => c.id === "topology-v2-detail-panel"),
      };
    });

  const before = await read();
  expect(before.placement, "the legend chose the other placement for this size").toBe(legend.placement);
  expect(before.rows.map((r) => r.kind)).toEqual(["project", "domain", "capability", "element"]);
  expect(before.rows.every((r) => r.text.trim().length > 0)).toBe(true);
  // Equal row heights — a legend whose rows differ because their words do is the
  // content-decided height defect wearing a legend's clothes.
  expect(new Set(before.rows.map((r) => Math.round(r.rect.h))).size).toBe(1);
  // Top tier highest, in order, and never two rows on the same line.
  for (let i = 1; i < before.rows.length; i += 1) {
    expect(before.rows[i].rect.minY).toBeGreaterThanOrEqual(before.rows[i - 1].rect.maxY - 1e-6);
  }
  expect(before.hits, `the legend landed on something: ${before.hits.join(", ")}`).toEqual([]);

  // …and the same holds once the inspector is docked at the same edge.
  const target = (await drawnNodes(page)).sort((a, b) => b.radius - a.radius)[0];
  const canvasBox = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="topology-map-v2-canvas"]')!.getBoundingClientRect();
    return { x: box.x, y: box.y };
  });
  await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  await page.waitForTimeout(900);
  const after = await read();
  expect(after.selectedPanel, "the inspector did not open, so this proves nothing").toBe(true);
  // The inspector owns this edge while it is docked, so the rail steps aside
  // rather than sharing it — and the rim names do not come back in its place.
  expect(after.rows, "the legend stayed under the inspector").toEqual([]);
  expect(after.hits).toEqual([]);
});
}
