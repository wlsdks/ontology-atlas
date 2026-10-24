import { expect, test, type Page } from "@playwright/test";
import { waitForDomeEntered, waitForMapStill, waitFrames } from "../../settle";

import { seedFirstRunSeen } from "../../first-run-seed";



/**
 * Every number comes from `window.__atlasMap` (`?e2e=1`), which reports what the frame drew.
 * Floors sit a few points under measured values and ceilings a few pairs above,
 * so a legitimate vault edit does not fail.
 */

/**
 * At 1040 width binds the fit, so the legend column is reserved only where it costs
 * nothing (`tierLegendPlacement`). The lit map's key stays one row below `xl` so the
 * bottom strip does not shrink the fill; the ceilings are tuned to that.
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
  // Past the assembly and the entry sweep: while either is alive the drawn pose
  // keeps moving and the fit is still in flight. Both clocks belong to the dome,
  // so it is asked whether it has arrived rather than given six seconds to.
  await waitForDomeEntered(page);
  await waitForMapStill(page, { what: "camera" });
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
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]');
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
    /*
     * A strip declaring `data-map-fit-obstacle="bottom"` is canvas the drawing is kept out
     * of, so it leaves the free canvas instead of counting as unfilled.
     */
    let bottomStrip = 0;
    for (const strip of document.querySelectorAll('[data-map-fit-obstacle="bottom"]')) {
      const r = strip.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.top >= box.bottom || r.bottom <= box.top) continue;
      bottomStrip = Math.max(bottomStrip, box.bottom - r.top);
    }
    const freeH = Math.max(1, box.height - bottomStrip);

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
      fill: ((maxX - minX) * (maxY - minY)) / (freeW * freeH),
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
    console.info(
      "STRATA_READING",
      JSON.stringify({ size: `${screen.width}x${screen.height}`, fill: Number(strata.fill.toFixed(3)), outline: strata.outline, overlap: strata.overlapPairs, sameTier: strata.sameTierPairs }),
    );

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
 * Pointing at a node's drawn centre must answer with that node, unless another node
 * drawn over it wins by depth. Sweeps the whole vault because the failures are small discs.
 */
async function settleCamera(page: Page) {
  // Stillness judged in the page, on drawn frames: two samples 150 ms apart from
  // the test process could both land inside one slow step and call a moving camera
  // settled, and on a fast machine they threw 150 ms away per sample.
  await waitForMapStill(page, { what: "camera" });
}

type DrawnNode = { id: string; label: string; x: number; y: number; radius: number; hidden: boolean };

async function drawnNodes(page: Page): Promise<DrawnNode[]> {
  return page.evaluate(() =>
    (window as unknown as { __atlasMap: { nodes: () => DrawnNode[] } }).__atlasMap
      .nodes()
      .filter((n) => !n.hidden),
  );
}

/**
 * A canvas point with no drawn disc within 40 px that also reaches the canvas itself,
 * not floating chrome such as a toolbar tile.
 */
async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const canvasEl = document.querySelector<HTMLElement>('[data-testid="ontology-map-canvas"]')!;
    const canvas = canvasEl.getBoundingClientRect();
    const bare = (x: number, y: number) => document.elementFromPoint(canvas.x + x, canvas.y + y) === canvasEl;
    const nodes = (
      window as unknown as {
        __atlasMap: { nodes: () => Array<{ x: number; y: number; radius: number; hidden: boolean }> };
      }
    ).__atlasMap
      .nodes()
      .filter((n) => !n.hidden);
    for (let y = 40; y < canvas.height - 40; y += 20) {
      for (let x = 360; x < canvas.width - 90; x += 20) {
        if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + 40) && bare(x, y)) return { x, y };
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
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
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
     * Ratcheted at one: a far node can be drawn yet fall under the `isNodeHittable` alpha
     * threshold, so a neighbouring disc answers through the slack ring.
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
        /*
         * This click does not deselect: an empty-ground press inside the dome is an orbit grab.
         * It does end the ego dim and tier reveal in the pointer handler.
         */
        await waitFrames(page, 3);
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
      /*
       * The hit test runs inside the pointer handler, so the selection this click
       * produced — including the miss this case exists to catch — is already
       * decided by the next frames. Polling for a *correct* selection instead would
       * turn every miss into a timeout and throw away the message below, which
       * names what was hit.
       */
      await waitFrames(page, 3);
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
      await expect(page.locator('[data-testid="map-detail-panel"]').first()).toContainText(node!.label);
    }
  });
}

/**
 * Tier names must be in tier order, equal heights and land on nothing, and be gone while
 * the inspector is docked. `map-strata-tier-scale.spec.ts` owns placement beside the rim.
 */
for (const legend of [
  { width: 1512, height: 982 },
  { width: 1040, height: 720 },
] as const) {
test(`Strata ${legend.width}x${legend.height} — the tier names land on nothing`, async ({ page }) => {
  test.setTimeout(120_000);
  await openStrata(page, legend.width, legend.height);

  const read = async () =>
    page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!;
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
        "topology-fit-control",
        "topology-tour-button",
        "topology-shortcuts-help-button",
        "topology-replay-growth",
        "topology-index-panel",
        "topology-light-legend",
        "map-detail-panel",
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
      return {
        rows,
        hits,
        placement: document.querySelector<HTMLElement>('[data-testid="topology-tier-legend"]')?.dataset.tierLegendPlacement ?? null,
        selectedPanel: chrome.some((c) => c.id === "map-detail-panel"),
      };
    });

  /*
   * Names are measured, then placed on the next frame, so wait for a drawn name;
   * the later reading expects none.
   */
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="topology-tier-legend-row-"]').length > 0,
    undefined,
    { timeout: 30_000 },
  );

  const before = await read();
  expect(before.placement, "the names are not the anchored shape").toBe("anchored");
  const order = ["project", "domain", "capability", "element"];
  const ranks = before.rows.map((r) => order.indexOf(r.kind));
  expect(ranks, "names out of tier order").toEqual([...ranks].sort((a, b) => a - b));
  expect(before.rows.every((r) => r.text.trim().length > 0)).toBe(true);
  // Equal row heights — names whose rows differ because their words do is the
  // content-decided height defect wearing a legend's clothes.
  expect(new Set(before.rows.map((r) => Math.round(r.rect.h))).size).toBe(1);
  // Top tier highest, in order, and never two names on the same line.
  for (let i = 1; i < before.rows.length; i += 1) {
    expect(before.rows[i].rect.minY).toBeGreaterThanOrEqual(before.rows[i - 1].rect.maxY - 1e-6);
  }
  expect(before.hits, `a tier name landed on something: ${before.hits.join(", ")}`).toEqual([]);

  // …and the same holds once the inspector is docked at the same edge.
  const target = (await drawnNodes(page)).sort((a, b) => b.radius - a.radius)[0];
  const canvasBox = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    return { x: box.x, y: box.y };
  });
  const targetReachesCanvas = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]');
    return document.elementFromPoint(x, y) === canvas;
  }, { x: canvasBox.x + target.x, y: canvasBox.y + target.y });
  expect(targetReachesCanvas, `${target.id}'s drawn centre was covered by transparent chrome`).toBe(true);
  await page.mouse.click(canvasBox.x + target.x, canvasBox.y + target.y);
  // The names are measured against the docked inspector, so wait for the inspector
  // to be there and for the reframe it causes to finish — not for 900 ms of this
  // machine, which is either too little or wasted depending on the machine.
  await expect(page.locator('[data-testid="map-detail-panel"]').first()).toBeVisible();
  await waitForMapStill(page, { what: "camera" });
  const after = await read();
  expect(after.selectedPanel, "the inspector did not open, so this proves nothing").toBe(true);
  // The inspector owns this edge while it is docked, so the names step aside rather
  // than sharing it.
  expect(after.rows, "a tier name stayed under the inspector").toEqual([]);
  expect(after.hits).toEqual([]);
});
}
