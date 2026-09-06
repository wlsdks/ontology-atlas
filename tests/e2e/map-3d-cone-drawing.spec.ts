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
 * | outline ÷ free canvas | 22.6% | 23.9% | 29.0% | 13.9% | *
 * (The three landscape sizes cleared 60% after the fit was rebuilt. 834 draws
 * **34.8%** against its own 38.3% ceiling, re-measured 2026-09-06 — the SCREENS
 * table below carries the arithmetic and the ledger record.)
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
   *
   * **The fill floor is 0.34, re-measured in the browser on 2026-09-06** (it was
   * 0.35 and had never passed). What the frame actually draws here is an outline
   * of **486 × 406 px in a 510 × 1112 free canvas = 34.8%**, identical on repeated
   * runs. Three numbers say the drawing is right and the floor was not:
   *
   * 1. The cone already spends **95.3% of the free width** (486 of 510). "Use the
   *    free width like Strata does" is a fix for a cone that is not doing this;
   *    this one is.
   * 2. Its silhouette is 1.197 : 1 wide by construction (`CONE_HEIGHT_SCALE`), so
   *    in a portrait strip the **area** it can cover is capped at
   *    (510 × 510/1.197) ÷ (510 × 1112) = **38.3%**, whatever the fit does. 34.8%
   *    is 91% of that ceiling. Area fill is simply the wrong shape of measurement
   *    for a landscape object in a tall frame, and only this one size is affected.
   * 3. The missing 1.6 points are arithmetic, not drawing. The floor was taken
   *    from the fit's twin (`tests/contract/cone-fit-fill.contract.test.ts`),
   *    which computes the outline as `span × tscale + 2 × DOME_NODE_FIT_ALLOWANCE_PX`
   *    — crediting 12 px of disc at each edge because that is the widest disc the
   *    cone draws (the project apex, r ≈ 14). The discs that actually sit at the
   *    horizontal extremes are elements at r ≈ 3.5. So the twin predicts 36.4% at
   *    the real 1.222 silhouette and the browser draws 34.8%, and the number
   *    copied into this file was the prediction.
   *
   * The twin keeps its own 0.35 — it is a statement about the fit, and the fit is
   * unchanged. Ledger: `docs/DECISIONS.md`, 2026-09-06.
   */
  { width: 834, height: 1112, fillFloor: 0.34, overlapMax: 14, sameTierMax: 3 },
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
     * A name **laid over a disc**, not merely grazing one. The product reserves
     * each disc plus 1 px and each label box carries a side gap, and the drawn
     * radius breathes by a fraction of a pixel — so a strict touch test reports
     * the slack rather than the defect. Two pixels of real overlap on both axes
     * is a name a reader sees on top of a shape.
     *
     * **Its OWN disc counts.** The first version of this check excluded the owner
     * (`n.id !== label.nodeId`), and that is exactly the hole the guardian walked
     * through: at 1920 the project label was clamped up to the label safe rect and
     * the apex ring ran straight through "e S" of "Online Store", while this gate
     * stayed at zero. A name unreadable under its own node's ring is the same
     * defect as a name unreadable under someone else's.
     */
    const TOUCH_SLACK_PX = 2;
    let labelsOverAnyDisc = 0;
    const offenders: string[] = [];
    for (const label of labels) {
      const hit = nodes.find(
        (n) =>
          Math.min(n.x + n.radius, label.maxX) - Math.max(n.x - n.radius, label.minX) >
            TOUCH_SLACK_PX &&
          Math.min(n.y + n.radius, label.maxY) - Math.max(n.y - n.radius, label.minY) >
            TOUCH_SLACK_PX,
      );
      if (hit) {
        labelsOverAnyDisc += 1;
        if (offenders.length < 4) {
          offenders.push(`"${label.text}" over ${hit.id === label.nodeId ? "its own disc" : hit.id}`);
        }
      }
    }

    /*
     * **A name is attached to its own shape, at the standard distance.**
     *
     * Overlap alone cannot see the other half of the defect: a label pushed 43 px
     * below its own disc sits in clear space and touches nothing, while the disc
     * it actually hugs belongs to somebody else — measured at 1440, where the
     * project name landed 9 px under an unlabelled neighbour.
     *
     * The rule is the placer's own contract rather than "the nearest node centre
     * wins". Nearest-centre is not satisfiable in a cone and does not describe how
     * a reader pairs the two: a domain's children ring it at about 20 px while its
     * own name is anchored at about 24 px, so `"Orders"` reads as the domain's
     * name (it is centred under the domain) while a child disc is nominally
     * closer — measured at all four sizes, on a healthy frame. What a reader does
     * use is the alignment: `resolveLabelBaselineY` centres a label on its owner's
     * x and puts it one offset step from the disc edge. Measured on a healthy
     * frame at all four sizes: gap 6.0–9.5 px, horizontal offset 0.0 px. A clamped
     * or displaced label breaks both at once.
     */
    const MAX_ANCHOR_GAP_PX = 24;
    const MAX_ANCHOR_DX_PX = 2;
    let labelsUnanchored = 0;
    const unanchored: string[] = [];
    for (const label of labels) {
      const owner = nodes.find((n) => n.id === label.nodeId);
      if (!owner) continue;
      const centreX = (label.minX + label.maxX) / 2;
      const below = label.minY >= owner.y;
      const gap = below
        ? label.minY - (owner.y + owner.radius)
        : owner.y - owner.radius - label.maxY;
      const dx = Math.abs(centreX - owner.x);
      if (gap > MAX_ANCHOR_GAP_PX || dx > MAX_ANCHOR_DX_PX) {
        labelsUnanchored += 1;
        if (unanchored.length < 4) {
          unanchored.push(`"${label.text}" gap ${gap.toFixed(1)}px dx ${dx.toFixed(1)}px`);
        }
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
      labelsOverAnyDisc,
      labelOffenders: offenders,
      labelsUnanchored,
      unanchoredLabels: unanchored,
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

    // ③ Resting names exist, none of them is laid over a disc — its own included —
    // and each one is still anchored to the node it names. Before: zero labels at
    // rest, so there was nothing to collide and nothing to read either.
    expect(cone.labelsDrawn, "원뿔에 쉬는 이름이 하나도 없다").toBeGreaterThan(5);
    expect(
      cone.labelsOverAnyDisc,
      `이름이 원판 위에 앉았다: ${cone.labelOffenders.join(", ")}`,
    ).toBe(0);
    expect(
      cone.labelsUnanchored,
      `이름이 제 원판에서 떨어졌다: ${cone.unanchoredLabels.join(", ")}`,
    ).toBe(0);

    // ④ The readout says what is drawn. Before: "1 project · 9 domains · Domains
    // only · zoom in to reveal elements" over 125 visible dots.
    expect(cone.readoutDrawn).toBe(String(cone.nodeCount));
    expect(cone.readoutText).toContain(String(cone.nodeCount));
    expect(cone.readoutHasTier, "다 그렸는데 여전히 층 이름을 말한다").toBe(false);
    expect(cone.readoutHasZoomHint, "다 그렸는데 여전히 줌인하라고 한다").toBe(false);
  });
}
