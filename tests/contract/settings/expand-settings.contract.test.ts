import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPAND,
  EXPAND_AFFORDANCES,
  EXPAND_RANGES,
  EXPAND_STRUCTURES,
  resolveExpand,
  type ExpandStructure,
} from "@/shared/lib/preferences/appearance-preferences";
import {
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_BAR_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
  clusterBadgeRect,
  clusterBarLabel,
  clusterBarRect,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterControlForm,
  drawClusterChip,
  estimateCanvasTextWidth,
  orbitButtonRect,
  type ClusterBarLabels,
  type ClusterChipColors,
  type ClusterChipRect,
} from "@/widgets/ontology-map/render/cluster-chips";
import {
  EGO_NEIGHBOR_LIMIT,
  selectiveEgoNeighbors,
} from "@/widgets/ontology-map/model/visibility/focus-state";
import {
  DISC_LABEL_TOP_K,
  selectDiscLabelEligible,
} from "@/widgets/ontology-map/model/visibility/label-lod";
import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "@/widgets/ontology-map/model/layout/layout";
import {
  MAX_EXPANDED_PARENTS,
  limitExpandedParents,
  toggleExpandedParent,
  parseExpandedParentsParam,
} from "@/views/home/model/route-state/url-state";

/**
 * Expand-settings contract — **evidence that the settings are not decoration**.
 *
 * Porting the prototype's left panel (`.qa-scratch/proto-expand.html`) into the
 * product has one easy failure mode: **the value is stored and the screen is
 * unchanged**. Then there is a settings screen but no settings. So for each of the
 * five values this file measures that changing it really changes what is drawn —
 * by **rectangles and counts**, not snapshots.
 *
 * The second failure mode is **draw and hit diverging** (a defect the chips have
 * already suffered twice — the lesson of
 * `draw-hit-lockstep.contract.test.ts`). An affordance changes the drawn shape, so
 * the clickable rectangle must change with it, and that decision must live in
 * **one** function (`clusterControlForm`).
 */

const PARENT = { x: 400, y: 300, radius: 17 };
const ANCHOR = { x: 520, y: 300 };
/** The copy actually shown on screen (ko) — measured with this, not the English fallback. */
const KO_BAR_LABELS: ClusterBarLabels = {
  expand: "펼치기",
  expandCount: "{count}개 펼치기",
  collapse: "접기",
};

const chipInput = (over: Partial<Parameters<typeof clusterChipOccupancyRect>[0]> = {}) => ({
  screenX: ANCHOR.x,
  screenY: ANCHOR.y,
  count: 31,
  expanded: false,
  hovered: false,
  parentScreenX: PARENT.x,
  parentScreenY: PARENT.y,
  nodeScreenRadius: PARENT.radius,
  batchSize: 24,
  barLabels: KO_BAR_LABELS,
  ...over,
});

describe("expand settings: defaults", () => {
  /**
   * The default affordance is the overhead bar. It is the one default that deliberately changes the
   * screen, so it is pinned (`docs/DECISIONS.md`).
   */
  it("someone who never touched the settings gets the \"bar above the head\"", () => {
    expect(DEFAULT_EXPAND.affordance).toBe("bar");
    expect(resolveExpand(null).affordance).toBe("bar");
    expect(resolveExpand({}).affordance).toBe("bar");
    // A hand-edited stored value with an unknown string still falls back to the default.
    expect(resolveExpand({ affordance: "sparkles" }).affordance).toBe("bar");
  });

  /**
   * Two defaults change the screen: the affordance (bar) and the layout (fan). The three numbers stay
   * at their existing constants, else the cause of a screen change cannot be told.
   */
  it("only two defaults change the screen: affordance and arrangement", () => {
    expect(DEFAULT_EXPAND.affordance).toBe("bar");
    expect(DEFAULT_EXPAND.structure).toBe<ExpandStructure>("fan");
    expect(DEFAULT_EXPAND.batchSize).toBe(EGO_NEIGHBOR_LIMIT);
    expect(DEFAULT_EXPAND.labelAttempts).toBe(DISC_LABEL_TOP_K);
    expect(DEFAULT_EXPAND.maxOpenParents).toBe(MAX_EXPANDED_PARENTS);
  });

  /**
   * `disc` stays selectable because it is the way back to the previous layout; removing it turns that
   * reversal into a code change (`docs/DECISIONS.md`).
   */
  it("the previous arrangement (spiral disc) remains as a choice", () => {
    expect(EXPAND_STRUCTURES).toContain<ExpandStructure>("disc");
  });

  /**
   * Slider bounds are the prototype's values, not narrowed arbitrarily. And all
   * three defaults must sit **inside** those ranges — outside, opening settings
   * clamps the value and changes a screen the user never touched.
   */
  it("the range is the mockup value and the default is inside it", () => {
    expect(EXPAND_RANGES.batchSize).toMatchObject({ min: 4, max: 24 });
    expect(EXPAND_RANGES.labelAttempts).toMatchObject({ min: 3, max: 40 });
    expect(EXPAND_RANGES.maxOpenParents).toMatchObject({ min: 1, max: 6 });
    for (const key of ["batchSize", "labelAttempts", "maxOpenParents"] as const) {
      expect(DEFAULT_EXPAND[key], key).toBeGreaterThanOrEqual(EXPAND_RANGES[key].min);
      expect(DEFAULT_EXPAND[key], key).toBeLessThanOrEqual(EXPAND_RANGES[key].max);
    }
  });

  it("a stored value outside the range is clamped in, so NaN does not leak into the renderer", () => {
    expect(resolveExpand({ batchSize: 999 }).batchSize).toBe(24);
    expect(resolveExpand({ batchSize: -5 }).batchSize).toBe(4);
    expect(resolveExpand({ maxOpenParents: Number.NaN }).maxOpenParents).toBe(
      DEFAULT_EXPAND.maxOpenParents,
    );
  });
});

describe("expand display: the three really swap", () => {
  /**
   * A stored value with an unchanged screen is decoration, not a setting. Start by
   * locking that the three produce **different forms**.
   */
  it("collapsed parent: pill, bar (picked node) and badge are different forms", () => {
    const forms = EXPAND_AFFORDANCES.map((affordance) =>
      clusterControlForm({ affordance, expanded: false, focused: true }),
    );
    expect(forms).toEqual(["pill", "bar", "badge"]);
    expect(new Set(forms).size, "the three collapsed into the same form").toBe(3);
  });

  /**
   * The overhead bar exists **only on a selected node** (prototype: *"Nothing at all when unselected"* — nothing at all when unselected). Lose that property and the
   * bar floats permanently like the pill, erasing the difference between the
   * three.
   */
  it("the bar exists only on the picked node", () => {
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: false })).toBe("none");
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: true })).toBe("bar");
    // Judged absent means **it reserves no space either** — a phantom reservation
    // makes labels avoid an empty area (a defect this file already learned).
    expect(
      clusterChipOccupancyRect(chipInput({ affordance: "bar", focused: false })),
    ).toBeNull();
  });

  /** The three rectangles must sit in **different places** to differ on screen — measured in px. */
  it("the three rectangles sit in different places", () => {
    const rects = EXPAND_AFFORDANCES.map((affordance) => {
      const rect = clusterChipOccupancyRect(chipInput({ affordance, focused: true }));
      expect(rect, `${affordance} produces no rectangle`).not.toBeNull();
      return rect as NonNullable<typeof rect>;
    });
    const centers = rects.map((r) => `${Math.round(r.x + r.w / 2)},${Math.round(r.y + r.h / 2)}`);
    expect(new Set(centers).size, `the three are in the same place: ${centers.join(" / ")}`).toBe(3);

    const [pill, bar, badge] = rects;
    // The bar draws nothing in the pill's leading glyph zone. Assert the plate width is exactly text width
    // plus horizontal padding, not 'narrower than the pill', which would measure the language.
    const barLabel = clusterBarLabel({ expanded: false, count: 31, batchSize: 24, labels: KO_BAR_LABELS });
    expect(bar.w, "the bar got a width with nothing drawn on it").toBeCloseTo(
      estimateCanvasTextWidth(barLabel, 12) + 20,
      6,
    );
    // The pill is centred on the anchor (empty space away from the node).
    expect(pill.x + pill.w / 2).toBeCloseTo(ANCHOR.x, 6);
    // The bar sits **directly above** the parent: same horizontal centre, bottom edge above the node.
    expect(bar.x + bar.w / 2).toBeCloseTo(PARENT.x, 6);
    expect(bar.y + bar.h).toBeLessThan(PARENT.y - PARENT.radius);
    // The badge takes the **upper-left** shoulder: left and above (upper-right belongs to the orbit button).
    expect(badge.x + badge.w / 2).toBeLessThan(PARENT.x);
    expect(badge.y + badge.h / 2).toBeLessThan(PARENT.y);
  });

  /**
   * **Zero regression** — anyone who chose the floating pill must see pixels
   * identical to before: collapsed = pill (anchor), expanded = shoulder badge, the
   * same pairing as before.
   */
  it("the \"floating pill\" equals the previous geometry", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "pill", focused: true }));
    expect(collapsed).toEqual(clusterChipRect(ANCHOR.x, ANCHOR.y, "+31", 1));
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "pill", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(
      clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "−31", 1),
    );
  });

  /** The overhead bar is a bar both collapsed and expanded; the **copy** is what changes. */
  it("the reserved rectangle of the \"bar above the head\" equals the bar geometry", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "bar", focused: true }));
    expect(collapsed).toEqual(
      // Only 24 of the 31 open this time — that 24 is a **different number** from the node's engraved 31.
      clusterBarRect(PARENT.x, PARENT.y, PARENT.radius, "24개 펼치기", 1),
    );
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "bar", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(clusterBarRect(PARENT.x, PARENT.y, PARENT.radius, "접기", 1));
  });

  /** The shoulder badge is a badge **both** collapsed and expanded; only the sign changes. */
  it("the \"shoulder badge\" stays a badge when collapsed and only the sign differs, `+` versus `−`", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "badge", focused: true }));
    expect(collapsed).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "+31", 1));
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "badge", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "−31", 1));
  });

  /**
   * Hit tests (`topology-pointer-hit-tests.ts`), label reservation, and drawing
   * all read **the same decision function**. Without it, all three re-write their own
   * `if (expanded)` and eventually diverge — the path that produces a button that is
   * visible but unclickable.
   */
  /**
   * What cannot dock stays in an undocked form: the `+N more` chip has a synthetic parent id with no
   * node in the graph, so docking would leave it neither drawn nor clickable.
   */
  it("without the parent coordinates it stays a pill instead of the docked form, and does not disappear", () => {
    for (const affordance of ["bar", "badge"] as const) {
      const undocked = {
        screenX: ANCHOR.x,
        screenY: ANCHOR.y,
        count: 9,
        expanded: false,
        hovered: false,
        affordance,
        focused: true,
      };
      expect(
        clusterControlForm({ affordance, expanded: false, focused: true, dockable: false }),
        affordance,
      ).toBe("pill");
      // The pill geometry unchanged — centred on the anchor.
      expect(clusterChipOccupancyRect(undocked), affordance).toEqual(
        clusterChipRect(ANCHOR.x, ANCHOR.y, "+9", 1),
      );
      // And it really is painted (idling guard).
      const rec = recordingCtx();
      drawClusterChip(rec.ctx, undocked, COLORS);
      expect(rec.ops, `${affordance}: a chip that cannot attach vanished entirely`).toContain("fill");
    }
  });

  /**
   * The floating pill's expanded badge does **not** take this fallback (the
   * zero-regression contract) — as before, no parent coordinates means nothing is
   * drawn.
   */
  it("the expand badge of the \"floating pill\" still does not exist without a parent, as before", () => {
    expect(
      clusterChipOccupancyRect({
        screenX: ANCHOR.x,
        screenY: ANCHOR.y,
        count: 9,
        expanded: true,
        hovered: false,
        affordance: "pill",
        focused: true,
      }),
    ).toBeNull();
  });
});

describe("count opened at once: the number of drawn children changes", () => {
  const ranked = Array.from({ length: 60 }, (_, i) => `n${i}`);

  it("lowering the value really reduces the visible children", () => {
    const wide = selectiveEgoNeighbors(ranked, 1, 24);
    const narrow = selectiveEgoNeighbors(ranked, 1, 4);
    expect(wide.visibleNeighbors.size).toBe(24);
    expect(narrow.visibleNeighbors.size).toBe(4);
    // The rest are folded, not gone — pressing "expand N" again brings them.
    expect(narrow.hiddenCount).toBe(56);
    const second = selectiveEgoNeighbors(ranked, 2, 4);
    expect(second.visibleNeighbors.size).toBe(8);
  });

  it("the two ends of the range produce different screens", () => {
    const min = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.min);
    const max = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.max);
    expect(min.visibleNeighbors.size).toBeLessThan(max.visibleNeighbors.size);
  });
});

describe("count of names to try: the attached names change", () => {
  const disc = [Array.from({ length: 40 }, (_, i) => `c${i}`)];

  it("the value is exactly \"how many to try\"", () => {
    expect(selectDiscLabelEligible(disc, 3).size).toBe(3);
    expect(selectDiscLabelEligible(disc, 8).size).toBe(8);
    expect(selectDiscLabelEligible(disc, 40).size).toBe(40);
  });

  it("the default is the same budget as today", () => {
    expect(selectDiscLabelEligible(disc, DEFAULT_EXPAND.labelAttempts).size).toBe(DISC_LABEL_TOP_K);
  });
});

describe("parents kept expanded at once: the cap really moves", () => {
  it("lowering the cap closes the oldest one earlier", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id, 2);
    expect(open).toEqual(["c", "d"]);
  });

  it("raising the cap leaves more of them open", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) open = toggleExpandedParent(open, id, 6);
    expect(open).toEqual(["b", "c", "d", "e", "f", "g"]);
  });

  it("collapsing always works regardless of the cap", () => {
    expect(toggleExpandedParent(["a", "b"], "a", 1)).toEqual(["b"]);
  });

  /**
   * **Deep links take the same cap** — otherwise one link bypasses it and the
   * recipient sees a worse screen than the sender.
   */
  it("the `?open=` deep link is also cut by the user cap", () => {
    expect(parseExpandedParentsParam("a,b,c,d,e", 2)).toEqual(["d", "e"]);
    expect(parseExpandedParentsParam("a,b,c,d,e", 5)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("the default is today's cap as it is", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id);
    expect(open.length).toBe(MAX_EXPANDED_PARENTS);
  });
});

describe("expand structure: child coordinates really change", () => {
  const rings: LayoutRings = { domain: 300, capability: 120, element: 70 };
  /** More children than the threshold (12) — exactly the parent the expand structure applies to. */
  const nodes: LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      kind: "capability" as const,
      parentId: "d",
    })),
  ];
  const place = (expandStructure: ExpandStructure) =>
    new Map(
      computeConcentricLayout(nodes, rings, { expandStructure, relaxIterations: 0 }).map((p) => [
        p.id,
        p,
      ]),
    );

  it("the four produce different arrangements", () => {
    const signatures = EXPAND_STRUCTURES.map((structure) => {
      const points = place(structure);
      return EXPAND_STRUCTURES.length > 0
        ? Array.from({ length: 30 }, (_, i) => {
            const p = points.get(`c${i}`);
            return `${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)}`;
          }).join("|")
        : "";
    });
    expect(new Set(signatures).size, "the coordinates are the same even after changing the structure, so the setting is decoration").toBe(
      EXPAND_STRUCTURES.length,
    );
  });

  /**
   * A call passing no option must equal the default (fan), else call sites unaware of the setting draw
   * a different map.
   */
  it("without options the default arrangement comes out", () => {
    const withOption = computeConcentricLayout(nodes, rings, {
      expandStructure: DEFAULT_EXPAND.structure,
      relaxIterations: 0,
    });
    const withoutOption = computeConcentricLayout(nodes, rings, { relaxIterations: 0 });
    expect(withOption).toEqual(withoutOption);
  });

  /**
   * **Is it reversible** — choosing the spiral disc must reproduce the previous
   * coordinates. Since the default moved to fan, that is precisely why `disc`
   * exists.
   */
  it("choosing the spiral disc gives coordinates different from the fan", () => {
    const disc = computeConcentricLayout(nodes, rings, { expandStructure: "disc", relaxIterations: 0 });
    const fan = computeConcentricLayout(nodes, rings, { expandStructure: "fan", relaxIterations: 0 });
    const sig = (pts: ReturnType<typeof computeConcentricLayout>) =>
      pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
    expect(sig(disc)).not.toBe(sig(fan));
  });

  /**
   * Each structure must keep the **property** the prototype recorded for it — if
   * only the name differs and the picture is the same, there is no reason to
   * choose.
   */
  it("the ring wraps the parent (uses all four sides)", () => {
    const points = place("ring");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    // The fan stays inside one wedge; the ring uses all four quadrants.
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "the ring does not use all four sides").toBe(4);
  });

  it("the column has several lines and each column goes further outward", () => {
    const points = place("column");
    const parent = points.get("d") as { x: number; y: number };
    const dists = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.hypot(p.x - parent.x, p.y - parent.y);
    });
    // More columns means further from the parent — "it gets longer instead" is this layout's cost.
    expect(Math.max(...dists)).toBeGreaterThan(Math.min(...dists));
  });

  it("the fan stays inside one wedge", () => {
    const points = place("fan");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "the fan spread to all four sides, so it cannot be told from the ring").toBeLessThan(4);
  });
});

describe("things in the mockup that were not carried over", () => {
  /**
   * The prototype's "vault scale" (small/real/large) is a **test load** — a knob
   * built to measure itself, not a product setting. Porting it would show users a
   * control that appears to *choose* the size of their own data.
   */
  it("\"vault scale\" is not in the settings type", () => {
    const keys = Object.keys(DEFAULT_EXPAND);
    expect(keys).toEqual([
      "affordance",
      "structure",
      "batchSize",
      "labelAttempts",
      "maxOpenParents",
    ]);
    expect(keys.some((k) => /scale|vault|size$/i.test(k) && k !== "batchSize")).toBe(false);
  });
});

/* ── Is it really painted — a recording fake ctx measures what was drawn ──── */

const COLORS: ClusterChipColors = {
  surface: "#15161a",
  border: "#3a3b46",
  plusInk: "#5e6ad2",
  numeralInk: "#8a8a94",
  tether: "#646471",
  hoverSurface: "#17171d",
  hoverBorder: "#5e6ad2",
  hoverInk: "#787ef6",
};

/**
 * A recording 2D context that collects the **bounding box** of filled rounded
 * rectangles and circles. jsdom has no canvas, so "what was painted where" is
 * measured from path coordinates — rectangles, not snapshots.
 */
function recordingCtx() {
  const points: { x: number; y: number }[] = [];
  const ops: string[] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    setLineDash() {},
    moveTo(x: number, y: number) { points.push({ x, y }); },
    lineTo(x: number, y: number) { points.push({ x, y }); },
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    },
    arc(x: number, y: number, r: number) {
      points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
      ops.push("arc");
    },
    fill() { ops.push("fill"); },
    stroke() { ops.push("stroke"); },
    fillText() { ops.push("text"); },
    measureText(text: string) { return { width: text.length * 7 }; },
  };
  const bbox = () => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bbox, ops, points };
}

describe("what is drawn: by default the thing on the map is the \"bar above the head\"", () => {
  const drawWith = (affordance: (typeof EXPAND_AFFORDANCES)[number], focused = true) => {
    const rec = recordingCtx();
    drawClusterChip(
      rec.ctx,
      { ...chipInput({ affordance, focused }) },
      COLORS,
    );
    return rec;
  };

  /**
   * The map of someone who never touched settings. **What is actually painted at
   * the defaults** must be the bar above the parent — if the value is merely stored
   * and the screen is unchanged, this test catches it.
   */
  it("drawing with the default affordance paints a bar above the parent", () => {
    const rec = drawWith(DEFAULT_EXPAND.affordance);
    const box = rec.bbox();
    expect(rec.ops, "nothing was painted").toContain("fill");
    // The plate's bottom edge is **above** the node.
    expect(box.maxY).toBeLessThan(PARENT.y - PARENT.radius);
    // Horizontally centred on the parent — it does not go looking for space.
    expect((box.x + box.maxX) / 2).toBeCloseTo(PARENT.x, 0);
    // The height is the bar's spec, not the pill's or badge's.
    expect(Math.round(box.maxY - box.y)).toBe(CLUSTER_BAR_HEIGHT);
    // It draws no circle — it is not a badge.
    expect(rec.ops).not.toContain("arc");
  });

  it("an unpicked parent gets nothing painted by default", () => {
    const rec = drawWith("bar", false);
    expect(rec.ops).toEqual([]);
  });

  /** Swapping the three really changes **the painted height and position**. */
  it("changing the affordance changes what is painted", () => {
    const heights = EXPAND_AFFORDANCES.map((affordance) => {
      const box = drawWith(affordance).bbox();
      return Math.round(box.maxY - box.y);
    });
    // Pill (28), bar (24), badge (18) — three different specs.
    expect(heights[0]).toBe(CLUSTER_CHIP_HEIGHT);
    expect(heights[1]).toBe(CLUSTER_BAR_HEIGHT);
    expect(heights[2]).toBe(CLUSTER_BADGE_HEIGHT);
    expect(new Set(heights).size, "the three draw the same thing").toBe(3);
  });
});

/**
 * Controls on one node use different compass points so they cannot overlap at any radius or zoom,
 * rather than separating one value on today's screen.
 */
describe("node control bearings: the bar, badge and orbit button do not fight for space", () => {
  const overlapArea = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): number => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };

  it("overlap is 0 at any node size and zoom", () => {
    let checked = 0;
    // The radius ladder (element 7 → project 30) multiplied by magnitudeScale (max 1.4) and zoom.
    for (const radius of [7, 11, 17, 24, 30, 42]) {
      for (const scale of [0.85, 1, 1.25, 1.5]) {
        for (const count of [2, 17, 240]) {
          const orbit = orbitButtonRect(PARENT.x, PARENT.y, radius);
          const bar = clusterBarRect(PARENT.x, PARENT.y, radius, `+${count}`, scale);
          const badge = clusterBadgeRect(PARENT.x, PARENT.y, radius, `+${count}`, scale);
          expect(
            overlapArea(bar, orbit),
            `bar x orbit overlap (r=${radius} scale=${scale} count=${count})`,
          ).toBe(0);
          expect(
            overlapArea(badge, orbit),
            `badge x orbit overlap (r=${radius} scale=${scale} count=${count})`,
          ).toBe(0);
          checked += 1;
        }
      }
    }
    // Idling guard — running zero combinations means this test looked at nothing.
    expect(checked).toBeGreaterThan(60);
  });

  /**
   * The rule only holds while the position is computed in **one place**. If the
   * loop re-inlines the 45° expression, the test above stays green while the screen
   * overlaps again — so this also checks that the consumer calls the function.
   */
  it("the orbit button DOM placement uses the same function", () => {
    const source = readFileSync("src/widgets/ontology-map/ui/frame-loop/topology-realm-frame-stage.ts", "utf8");
    const scheduler = readFileSync("src/widgets/ontology-map/ui/frame-loop/use-topology-frame-loop.ts", "utf8");
    expect(scheduler).toContain("createRealmFrameStage(configuration.realmFrameStage)");
    expect(scheduler).toContain("runRealmFrameStage(");
    expect(source).toContain("orbitButtonRect(");
    expect(source, "the 45 degree inline calculation came back").not.toContain("Math.cos(-Math.PI / 4)");
  });
});

/**
 * Deep links take the user's cap too: `?open=` parsing is a pure function unaware of settings, so it
 * must receive the cap or one link expands more parents than allowed.
 */
describe("parents kept expanded at once: a deep link also gets the cap", () => {
  it("a list over the cap keeps only the tail", () => {
    expect(limitExpandedParents(["a", "b", "c", "d"], 1)).toEqual(["d"]);
    expect(limitExpandedParents(["a", "b", "c", "d"], 3)).toEqual(["b", "c", "d"]);
    expect(limitExpandedParents(["a"], 6)).toEqual(["a"]);
    // Zero, negative, and fractional values clamp to a minimum of 1 rather than "nothing can expand" (so clicking still works).
    expect(limitExpandedParents(["a", "b"], 0)).toEqual(["b"]);
  });

  it("the map screen really applies that cap", () => {
    const source = readFileSync("src/views/home/model/route-state/use-topology-route-controls.tsx", "utf8");
    const composition = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
    expect(composition).toContain("useTopologyRouteControls({");
    expect(composition).toContain("topologyRouteControls={topologyRouteControls}");
    expect(source).toContain("limitExpandedParents(expandedParentSlugs, expand.maxOpenParents)");
  });
});

/**
 * A bar is only a bar if it is a text button: the pill, shoulder badge and overhead bar differ by more
 * than position. The bar sits directly above the selected node with a verb and a number saying how
 * many will open.
 */
describe("bar above the head: a text button carrying a verb", () => {
  it("says the verb when collapsed, and the reverse verb when expanded", () => {
    expect(clusterBarLabel({ expanded: false, count: 17, batchSize: 24, labels: KO_BAR_LABELS }))
      .toBe("펼치기");
    expect(clusterBarLabel({ expanded: true, count: 17, batchSize: 24, labels: KO_BAR_LABELS }))
      .toBe("접기");
  });

  /**
   * **Never say the same number twice.** A node engraves its total descendant count
   * on its own body (`17`). The old bar said `+17` directly above it — zero
   * information, zero verb. A number is spoken **only when it is information**: "all"
   * when everything opens at once, "N" when it is batched, and that N differs from
   * the engraved count.
   */
  it("says no number when everything opens at once", () => {
    const label = clusterBarLabel({ expanded: false, count: 17, batchSize: 24, labels: KO_BAR_LABELS });
    expect(label, "the bar repeats the same number as the node engraving").not.toContain("17");
  });

  it("when opening in parts it says the count opening this time, a number different from the engraving", () => {
    const label = clusterBarLabel({ expanded: false, count: 17, batchSize: 4, labels: KO_BAR_LABELS });
    expect(label).toBe("4개 펼치기");
    expect(label).not.toContain("17");
  });

  /**
   * **There is one ruler for width.** Where the rectangle is built
   * (`clusterBarRect`) there is no canvas, and hit testing and label reservation
   * call the same function. The moment what is measured here diverges from what draw
   * measures, text becomes visible but unclickable.
   *
   * That ruler must also know **CJK double-cell width** — a Latin-based
   * `length × constant` under-estimates Hangul width by nearly 40% (measured at
   * 600 12px: a Hangul syllable is 10.38px).
   */
  it("the width estimator measures Hangul wider than Latin", () => {
    const hangul = estimateCanvasTextWidth("가나다", 12);
    const latin = estimateCanvasTextWidth("abc", 12);
    expect(hangul, "Hangul was computed at the same width as Latin, so the 2-cell width is missing").toBeGreaterThan(latin * 1.4);
  });

  /**
   * The estimate must be **wider than the measurement** — narrower and the text
   * overflows the plate, and beyond the plate is outside the hit rectangle. The
   * measurements below come from headless Chromium at `600 12px -apple-system`
   * (`.qa-scratch/map-affordance/measure.mjs`).
   */
  it("the estimated width never falls narrower than the measured width", () => {
    const measured: [string, number][] = [
      ["모두 펼치기", 55.23],
      ["접기", 20.76],
      ["24개 펼치기", 58.2],
      ["Expand all", 60.02],
      ["Collapse", 50.02],
      ["Expand 24", 60.02],
    ];
    for (const [text, actual] of measured) {
      expect(estimateCanvasTextWidth(text, 12), text).toBeGreaterThanOrEqual(actual);
    }
  });

  /** Draw and reservation use **the same string** — diverge and the rectangles diverge. */
  it("the reserved rectangle equals the width of the wording to be drawn", () => {
    for (const [expanded, label] of [[false, "펼치기"], [true, "접기"]] as const) {
      const rect = clusterChipOccupancyRect(
        chipInput({ affordance: "bar", focused: true, expanded, count: 17 }),
      );
      expect(rect?.w, label).toBeCloseTo(estimateCanvasTextWidth(label, 12) + 20, 6);
    }
  });

  /**
   * Two controls, two scopes, two names: the toolbar button opens every folded node; the bar over a
   * selected parent opens that parent's children and says the bare verb. The count appears only when
   * the batch is smaller than the fold.
   */
  it("the chip bar says the count to expand, and \"expand all\" is only one toolbar item", () => {
    // One press opens everything left: the bare verb, no number (the node engraves it).
    expect(clusterBarLabel({ expanded: false, count: 15, batchSize: 24, labels: KO_BAR_LABELS })).toBe("펼치기");
    // A batch smaller than the fold: unchanged.
    expect(clusterBarLabel({ expanded: false, count: 108, batchSize: 12, labels: KO_BAR_LABELS })).toBe("12개 펼치기");
    // Expanded still collapses.
    expect(clusterBarLabel({ expanded: true, count: 15, batchSize: 24, labels: KO_BAR_LABELS })).toBe("접기");
  });

  it("the names of the two expand controls differ per locale", () => {
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
        searchWidgets: { hint: Record<string, string> };
        topology: { cluster: Record<string, string> };
      };
      const toolbar = messages.searchWidgets.hint.expandAllLabel;
      const cluster = messages.topology.cluster;
      expect(toolbar, locale).toBeTruthy();
      expect(cluster.barExpandAll, `${locale}: the bar must not keep a second "all" name`).toBeUndefined();
      expect(cluster.barExpand, locale).toBeTruthy();
      expect(cluster.barExpandCount, locale).toContain("{count}");
      for (const [key, value] of Object.entries(cluster)) {
        expect(value, `${locale}.${key} repeats the toolbar's name`).not.toBe(toolbar);
      }
    }
  });

  /**
   * **Copy follows the vault's language.** If the canvas builds the string itself,
   * Korean is drawn onto an English screen. This checks the wiring by which the map
   * injects translations along the path the warding-ring caption
   * (`wardingRing.caption`) already uses — if that wiring breaks, the English
   * fallback appears on screen.
   */
  it("the map screen translates the three wordings and hands them to the canvas", () => {
    const source = readFileSync("src/views/home/model/map-canvas/use-topology-scene-controls.tsx", "utf8");
    const composition = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
    const renderer = readFileSync("src/views/home/ui/map-surfaces/TopologyMapRenderer.tsx", "utf8");
    expect(composition).toContain("useTopologySceneControls({");
    expect(composition).toContain("topologySceneControls={topologySceneControls}");
    expect(source).toContain('t("cluster.barExpand")');
    expect(source).toContain('t("cluster.barExpandCount"');
    expect(source).toContain('t("cluster.barCollapse")');
    expect(renderer).toContain("clusterBarLabels={clusterBarLabels}");
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
        topology: { cluster: Record<string, string> };
      };
      const cluster = messages.topology.cluster;
      for (const key of ["barExpand", "barExpandCount", "barCollapse"]) {
        expect(cluster[key], `${locale}.${key}`).toBeTruthy();
      }
      // The renderer fills the `{count}` placeholder — lose it and it renders literally.
      expect(cluster.barExpandCount, locale).toContain("{count}");
    }
  });

  /**
   * The plate may be wider than the node but **never wider than its text** — the
   * no-empty-width rule stands. And the compass contract (bar = north) must hold
   * regardless of width: the plate's bottom edge is above the node and above the
   * orbit button's (east) top edge.
   */
  it("does not overlap the orbit button even when the wording gets longer", () => {
    const overlap = (a: ClusterChipRect, b: ClusterChipRect): number => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h : 0;
    };
    let checked = 0;
    for (const radius of [7, 11, 17, 30, 42]) {
      for (const scale of [0.85, 1, 1.5]) {
        for (const label of ["모두 펼치기", "접기", "24개 펼치기", "Expand all"]) {
          const bar = clusterBarRect(PARENT.x, PARENT.y, radius, label, scale);
          expect(
            overlap(bar, orbitButtonRect(PARENT.x, PARENT.y, radius)),
            `${label} r=${radius} scale=${scale}`,
          ).toBe(0);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
