import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPAND,
  EXPAND_AFFORDANCES,
  EXPAND_RANGES,
  EXPAND_STRUCTURES,
  resolveExpand,
  type ExpandStructure,
} from "@/shared/lib/appearance-preferences";
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
} from "@/widgets/topology-map-v2/render/cluster-chips";
import {
  EGO_NEIGHBOR_LIMIT,
  selectiveEgoNeighbors,
} from "@/widgets/topology-map-v2/model/focus-state";
import {
  DISC_LABEL_TOP_K,
  selectDiscLabelEligible,
} from "@/widgets/topology-map-v2/model/label-lod";
import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "@/widgets/topology-map-v2/model/layout";
import {
  MAX_EXPANDED_PARENTS,
  limitExpandedParents,
  toggleExpandedParent,
  parseExpandedParentsParam,
} from "@/views/home/model/url-state";

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
  expandAll: "모두 펼치기",
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

describe("확장 설정 — 기본값", () => {
  /**
   * **Owner decision 2026-08-01: the default affordance is the overhead bar.**
   * This single value is the only one that deliberately changes today's screen. If
   * it quietly reverts the decision is gone, so it is pinned here (background and
   * falsifier: `docs/DECISIONS.md`).
   */
  it("설정을 안 건드린 사람은 「머리 위 막대」를 받는다", () => {
    expect(DEFAULT_EXPAND.affordance).toBe("bar");
    expect(resolveExpand(null).affordance).toBe("bar");
    expect(resolveExpand({}).affordance).toBe("bar");
    // A hand-edited stored value with an unknown string still falls back to the default.
    expect(resolveExpand({ affordance: "sparkles" }).affordance).toBe("bar");
  });

  /**
   * **Two defaults change the screen** — the affordance (bar) and the layout (fan).
   * Owner decisions 2026-08-01 and 08-02. The three numbers must stay at their
   * pre-existing constants: moving those too makes it impossible to tell what caused
   * a screen to change.
   */
  it("화면을 바꾸는 기본값은 어포던스와 배치 둘뿐이다", () => {
    expect(DEFAULT_EXPAND.affordance).toBe("bar");
    expect(DEFAULT_EXPAND.structure).toBe<ExpandStructure>("fan");
    expect(DEFAULT_EXPAND.batchSize).toBe(EGO_NEIGHBOR_LIMIT);
    expect(DEFAULT_EXPAND.labelAttempts).toBe(DISC_LABEL_TOP_K);
    expect(DEFAULT_EXPAND.maxOpenParents).toBe(MAX_EXPANDED_PARENTS);
  });

  /**
   * **`disc` stays because it is the way back.** With fan as the default, the
   * spiral disc became the only value that restores the previous screen — if the
   * falsifier is observed, that is where it returns to (`docs/DECISIONS.md`
   * 2026-08-02). Removing it from the list turns that reversal into a code
   * change.
   */
  it("종전 배치(나선 원반)는 선택지로 남아 있다", () => {
    expect(EXPAND_STRUCTURES).toContain<ExpandStructure>("disc");
  });

  /**
   * Slider bounds are the prototype's values, not narrowed arbitrarily. And all
   * three defaults must sit **inside** those ranges — outside, opening settings
   * clamps the value and changes a screen the user never touched.
   */
  it("범위는 시안 값이고 기본값은 그 안에 있다", () => {
    expect(EXPAND_RANGES.batchSize).toMatchObject({ min: 4, max: 24 });
    expect(EXPAND_RANGES.labelAttempts).toMatchObject({ min: 3, max: 40 });
    expect(EXPAND_RANGES.maxOpenParents).toMatchObject({ min: 1, max: 6 });
    for (const key of ["batchSize", "labelAttempts", "maxOpenParents"] as const) {
      expect(DEFAULT_EXPAND[key], key).toBeGreaterThanOrEqual(EXPAND_RANGES[key].min);
      expect(DEFAULT_EXPAND[key], key).toBeLessThanOrEqual(EXPAND_RANGES[key].max);
    }
  });

  it("범위 밖 저장값은 잘라 넣는다(렌더러에 NaN 이 새지 않게)", () => {
    expect(resolveExpand({ batchSize: 999 }).batchSize).toBe(24);
    expect(resolveExpand({ batchSize: -5 }).batchSize).toBe(4);
    expect(resolveExpand({ maxOpenParents: Number.NaN }).maxOpenParents).toBe(
      DEFAULT_EXPAND.maxOpenParents,
    );
  });
});

describe("펼치기 표시 — 셋이 실제로 갈아끼워진다", () => {
  /**
   * A stored value with an unchanged screen is decoration, not a setting. Start by
   * locking that the three produce **different forms**.
   */
  it("접힌 부모: 알약 · 막대(고른 노드) · 배지가 서로 다른 형태다", () => {
    const forms = EXPAND_AFFORDANCES.map((affordance) =>
      clusterControlForm({ affordance, expanded: false, focused: true }),
    );
    expect(forms).toEqual(["pill", "bar", "badge"]);
    expect(new Set(forms).size, "셋이 같은 형태로 붕괴했다").toBe(3);
  });

  /**
   * The overhead bar exists **only on a selected node** (prototype: *"Nothing at all when unselected"* — nothing at all when unselected). Lose that property and the
   * bar floats permanently like the pill, erasing the difference between the
   * three.
   */
  it("막대는 고른 노드에만 존재한다", () => {
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: false })).toBe("none");
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: true })).toBe("bar");
    // Judged absent means **it reserves no space either** — a phantom reservation
    // makes labels avoid an empty area (a defect this file already learned).
    expect(
      clusterChipOccupancyRect(chipInput({ affordance: "bar", focused: false })),
    ).toBeNull();
  });

  /** The three rectangles must sit in **different places** to differ on screen — measured in px. */
  it("셋의 사각형이 서로 다른 자리에 앉는다", () => {
    const rects = EXPAND_AFFORDANCES.map((affordance) => {
      const rect = clusterChipOccupancyRect(chipInput({ affordance, focused: true }));
      expect(rect, `${affordance} 가 사각형을 안 낸다`).not.toBeNull();
      return rect as NonNullable<typeof rect>;
    });
    const centers = rects.map((r) => `${Math.round(r.x + r.w / 2)},${Math.round(r.y + r.h / 2)}`);
    expect(new Set(centers).size, `셋이 같은 자리다: ${centers.join(" / ")}`).toBe(3);

    const [pill, bar, badge] = rects;
    // **The bar has no empty width.** The pill seats a `＋` in a 14px leading glyph
    // zone; the bar draws nothing there — it once inherited that zone verbatim and
    // carried width with nothing drawn in it (measured 2026-08-02).
    //
    // The assertion must not be "narrower than the pill": once the bar became a text
    // button, longer copy makes that inequality a function of the copy, so it would
    // measure **the language rather than the empty width** (it already inverts on the
    // Korean 「Expand All」). So the empty width is measured directly — the plate's
    // width is *exactly* text width plus horizontal padding.
    const barLabel = clusterBarLabel({ expanded: false, count: 31, batchSize: 24, labels: KO_BAR_LABELS });
    expect(bar.w, "막대에 그리는 것 없는 폭이 생겼다").toBeCloseTo(
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
  it("「뜬 알약」은 종전 지오메트리와 같다", () => {
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
  it("「머리 위 막대」의 예약 사각형이 막대 지오메트리와 같다", () => {
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
  it("「어깨 배지」는 접혀도 배지고 부호만 `+`↔`−` 다", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "badge", focused: true }));
    expect(collapsed).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "+31", 1));
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "badge", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "−31", 1));
  });

  /**
   * Hit testing (`topology-pointer-handlers.ts`), label reservation, and drawing
   * all read **the same decision function**. Without it, all three re-write their own
   * `if (expanded)` and eventually diverge — the path that produces a button that is
   * visible but unclickable.
   */
  /**
   * **What cannot dock does not disappear; it stays in an undocked form** — defect
   * measured 2026-08-02.
   *
   * The batch-reveal `+N more` chip has a synthetic string as its parent id, so no
   * such node exists in the graph (this is structural — a synthetic id maps 1:1 to a
   * real parent but is not a node). After docking became the default, this chip was
   * **neither drawn nor clickable**, leaving anyone who lowered "how many open at
   * once" with no way to open the rest.
   */
  it("부모 좌표를 모르면 도킹 형태 대신 알약으로 남는다 — 사라지지 않는다", () => {
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
      expect(rec.ops, `${affordance}: 못 붙는 칩이 통째로 사라졌다`).toContain("fill");
    }
  });

  /**
   * The floating pill's expanded badge does **not** take this fallback (the
   * zero-regression contract) — as before, no parent coordinates means nothing is
   * drawn.
   */
  it("「뜬 알약」의 펼침 배지는 종전대로 부모 없이는 없다", () => {
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

describe("한 번에 여는 개수 — 그려지는 자식 수가 바뀐다", () => {
  const ranked = Array.from({ length: 60 }, (_, i) => `n${i}`);

  it("값을 내리면 보이는 자식이 실제로 줄어든다", () => {
    const wide = selectiveEgoNeighbors(ranked, 1, 24);
    const narrow = selectiveEgoNeighbors(ranked, 1, 4);
    expect(wide.visibleNeighbors.size).toBe(24);
    expect(narrow.visibleNeighbors.size).toBe(4);
    // The rest are folded, not gone — pressing "expand N" again brings them.
    expect(narrow.hiddenCount).toBe(56);
    const second = selectiveEgoNeighbors(ranked, 2, 4);
    expect(second.visibleNeighbors.size).toBe(8);
  });

  it("범위 양 끝이 서로 다른 화면을 만든다", () => {
    const min = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.min);
    const max = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.max);
    expect(min.visibleNeighbors.size).toBeLessThan(max.visibleNeighbors.size);
  });
});

describe("이름을 시도할 개수 — 붙는 이름이 바뀐다", () => {
  const disc = [Array.from({ length: 40 }, (_, i) => `c${i}`)];

  it("값이 곧 「몇 개까지 시도하나」다", () => {
    expect(selectDiscLabelEligible(disc, 3).size).toBe(3);
    expect(selectDiscLabelEligible(disc, 8).size).toBe(8);
    expect(selectDiscLabelEligible(disc, 40).size).toBe(40);
  });

  it("기본값에서는 오늘과 같은 예산이다", () => {
    expect(selectDiscLabelEligible(disc, DEFAULT_EXPAND.labelAttempts).size).toBe(DISC_LABEL_TOP_K);
  });
});

describe("동시에 펼쳐 둘 부모 — 상한이 실제로 움직인다", () => {
  it("상한을 낮추면 더 일찍 가장 오래된 것이 닫힌다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id, 2);
    expect(open).toEqual(["c", "d"]);
  });

  it("상한을 올리면 더 많이 열린 채로 남는다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) open = toggleExpandedParent(open, id, 6);
    expect(open).toEqual(["b", "c", "d", "e", "f", "g"]);
  });

  it("접기는 상한과 무관하게 언제나 된다", () => {
    expect(toggleExpandedParent(["a", "b"], "a", 1)).toEqual(["b"]);
  });

  /**
   * **Deep links take the same cap** — otherwise one link bypasses it and the
   * recipient sees a worse screen than the sender.
   */
  it("`?open=` 딥링크도 사용자 상한에 잘린다", () => {
    expect(parseExpandedParentsParam("a,b,c,d,e", 2)).toEqual(["d", "e"]);
    expect(parseExpandedParentsParam("a,b,c,d,e", 5)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("기본값은 오늘 상한 그대로다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id);
    expect(open.length).toBe(MAX_EXPANDED_PARENTS);
  });
});

describe("확장 구조 — 자식 좌표가 실제로 바뀐다", () => {
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

  it("넷이 서로 다른 배치를 낸다", () => {
    const signatures = EXPAND_STRUCTURES.map((structure) => {
      const points = place(structure);
      return EXPAND_STRUCTURES.length > 0
        ? Array.from({ length: 30 }, (_, i) => {
            const p = points.get(`c${i}`);
            return `${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)}`;
          }).join("|")
        : "";
    });
    expect(new Set(signatures).size, "구조를 바꿔도 좌표가 같다 — 설정이 장식이다").toBe(
      EXPAND_STRUCTURES.length,
    );
  });

  /**
   * A call passing no option must equal **the default (fan)** — otherwise call
   * sites unaware of the setting (pure functions, tests, future consumers) draw a
   * different map. This pairing moved with the default when it changed from `disc`
   * to `fan` on 2026-08-02.
   */
  it("옵션을 안 넘기면 기본값 배치가 나온다", () => {
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
  it("나선 원반을 고르면 부챗살과 다른 좌표가 나온다", () => {
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
  it("고리는 부모를 감싼다(사방을 쓴다)", () => {
    const points = place("ring");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    // The fan stays inside one wedge; the ring uses all four quadrants.
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "고리가 사방을 안 쓴다").toBe(4);
  });

  it("기둥은 줄이 여럿이고 열마다 바깥으로 나아간다", () => {
    const points = place("column");
    const parent = points.get("d") as { x: number; y: number };
    const dists = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.hypot(p.x - parent.x, p.y - parent.y);
    });
    // More columns means further from the parent — "it gets longer instead" is this layout's cost.
    expect(Math.max(...dists)).toBeGreaterThan(Math.min(...dists));
  });

  it("부챗살은 한쪽 쐐기 안에 머문다", () => {
    const points = place("fan");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "부챗살이 사방으로 퍼졌다 — 고리와 구별이 없다").toBeLessThan(4);
  });
});

describe("시안의 것 중 옮기지 않은 것", () => {
  /**
   * The prototype's "vault scale" (small/real/large) is a **test load** — a knob
   * built to measure itself, not a product setting. Porting it would show users a
   * control that appears to *choose* the size of their own data.
   */
  it("「볼트 규모」는 설정 타입에 없다", () => {
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

describe("그려진 것 — 기본값에서 지도에 서는 것은 「머리 위 막대」다", () => {
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
  it("기본 어포던스로 그리면 부모 머리 위에 막대가 칠해진다", () => {
    const rec = drawWith(DEFAULT_EXPAND.affordance);
    const box = rec.bbox();
    expect(rec.ops, "아무것도 안 칠해졌다").toContain("fill");
    // The plate's bottom edge is **above** the node.
    expect(box.maxY).toBeLessThan(PARENT.y - PARENT.radius);
    // Horizontally centred on the parent — it does not go looking for space.
    expect((box.x + box.maxX) / 2).toBeCloseTo(PARENT.x, 0);
    // The height is the bar's spec, not the pill's or badge's.
    expect(Math.round(box.maxY - box.y)).toBe(CLUSTER_BAR_HEIGHT);
    // It draws no circle — it is not a badge.
    expect(rec.ops).not.toContain("arc");
  });

  it("안 고른 부모에는 기본값에서 아무것도 안 칠해진다", () => {
    const rec = drawWith("bar", false);
    expect(rec.ops).toEqual([]);
  });

  /** Swapping the three really changes **the painted height and position**. */
  it("어포던스를 바꾸면 칠해지는 것이 바뀐다", () => {
    const heights = EXPAND_AFFORDANCES.map((affordance) => {
      const box = drawWith(affordance).bbox();
      return Math.round(box.maxY - box.y);
    });
    // Pill (28), bar (24), badge (18) — three different specs.
    expect(heights[0]).toBe(CLUSTER_CHIP_HEIGHT);
    expect(heights[1]).toBe(CLUSTER_BAR_HEIGHT);
    expect(heights[2]).toBe(CLUSTER_BADGE_HEIGHT);
    expect(new Set(heights).size, "셋이 같은 것을 그린다").toBe(3);
  });
});

/**
 * Controls attached to one node use **different compass points** — prescription
 * measured 2026-08-02.
 *
 * Measured (1512×982, sample vault "Marketing"): **80% of the shoulder badge
 * (513px²)** sat under the orbit "show only this" button, and
 * `document.elementFromPoint(badge centre)` returned that button — the badge was
 * never clickable. The default overhead bar had 80px² of its bottom-right corner
 * caught too. One cause for both: **they were both at upper-right 45°**.
 *
 * So this test locks not "they do not overlap on today's screen" but **they do
 * not overlap at any radius or any zoom**. That is exactly the difference between
 * this rule and the patch of enlarging one value until this particular screen
 * separates.
 */
describe("노드 컨트롤 방위 — 막대·배지·궤도 버튼이 자리를 안 다툰다", () => {
  const overlapArea = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): number => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };

  it("어떤 노드 크기·줌에서도 겹침이 0 이다", () => {
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
            `막대×궤도 겹침 (r=${radius} scale=${scale} count=${count})`,
          ).toBe(0);
          expect(
            overlapArea(badge, orbit),
            `배지×궤도 겹침 (r=${radius} scale=${scale} count=${count})`,
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
  it("궤도 버튼 DOM 배치가 같은 함수를 쓴다", () => {
    const source = readFileSync("src/widgets/topology-map-v2/ui/use-topology-loop.ts", "utf8");
    expect(source).toContain("orbitButtonRect(");
    expect(source, "45° 인라인 계산이 되살아났다").not.toContain("Math.cos(-Math.PI / 4)");
  });
});

/**
 * **Deep links take the user's cap too** — defect measured 2026-08-02.
 *
 * `?open=` parsing is a pure function unaware of settings, so it used the default
 * of 3. A screen with "parents open at once" lowered to 1 therefore expanded three
 * parents from one link (measured: 82 nodes where it should have been 51). A cap
 * honoured only on the click path is not a cap.
 */
describe("동시에 펼쳐 둘 부모 — 딥링크도 상한을 받는다", () => {
  it("상한을 넘긴 목록은 뒤쪽만 남는다", () => {
    expect(limitExpandedParents(["a", "b", "c", "d"], 1)).toEqual(["d"]);
    expect(limitExpandedParents(["a", "b", "c", "d"], 3)).toEqual(["b", "c", "d"]);
    expect(limitExpandedParents(["a"], 6)).toEqual(["a"]);
    // Zero, negative, and fractional values clamp to a minimum of 1 rather than "nothing can expand" (so clicking still works).
    expect(limitExpandedParents(["a", "b"], 0)).toEqual(["b"]);
  });

  it("지도 화면이 그 상한을 실제로 건다", () => {
    const source = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
    expect(source).toContain("limitExpandedParents(expandedParentSlugs, expand.maxOpenParents)");
  });
});

/**
 * **A bar is only a bar if it is a text button** — owner report 2026-08-02:
 * *"The overhead bar seems slightly different, but it is no different from the overhead badge."*
 * (the overhead bar
 * seems slightly different, but it is no different from the overhead badge).
 *
 * The prototype separates the three by more than position: the floating pill is
 * "empty space away from the node + a dotted tether", the shoulder badge is "a
 * small circle that speaks on hover", and the overhead bar is "directly above the
 * selected node + **a text button** + a number saying how many will open". The
 * implementation ported only the position and the selection gating and still drew
 * just `+N`, leaving "a small mark near the node" — identical to the badge. The
 * owner's reading was exact.
 */
describe("머리 위 막대 — 동사가 든 글자 버튼", () => {
  it("접히면 동사를 말하고, 펼쳐지면 되돌리는 동사를 말한다", () => {
    expect(clusterBarLabel({ expanded: false, count: 17, batchSize: 24, labels: KO_BAR_LABELS }))
      .toBe("모두 펼치기");
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
  it("한 번에 다 열리는 경우에는 숫자를 말하지 않는다", () => {
    const label = clusterBarLabel({ expanded: false, count: 17, batchSize: 24, labels: KO_BAR_LABELS });
    expect(label, "막대가 노드 각인과 같은 수를 되풀이한다").not.toContain("17");
  });

  it("나뉘어 열릴 때는 이번에 열릴 개수를 말한다 — 각인과 다른 수", () => {
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
  it("폭 추정기가 한글을 라틴보다 넓게 잰다", () => {
    const hangul = estimateCanvasTextWidth("가나다", 12);
    const latin = estimateCanvasTextWidth("abc", 12);
    expect(hangul, "한글이 라틴과 같은 폭으로 계산됐다 — 2셀 폭이 빠졌다").toBeGreaterThan(latin * 1.4);
  });

  /**
   * The estimate must be **wider than the measurement** — narrower and the text
   * overflows the plate, and beyond the plate is outside the hit rectangle. The
   * measurements below come from headless Chromium at `600 12px -apple-system`
   * (`.qa-scratch/map-affordance/measure.mjs`).
   */
  it("추정 폭이 실측 폭보다 좁아지지 않는다", () => {
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
  it("예약 사각형이 그려질 문구의 폭과 같다", () => {
    for (const [expanded, label] of [[false, "모두 펼치기"], [true, "접기"]] as const) {
      const rect = clusterChipOccupancyRect(
        chipInput({ affordance: "bar", focused: true, expanded, count: 17 }),
      );
      expect(rect?.w, label).toBeCloseTo(estimateCanvasTextWidth(label, 12) + 20, 6);
    }
  });

  /**
   * **Copy follows the vault's language.** If the canvas builds the string itself,
   * Korean is drawn onto an English screen. This checks the wiring by which the map
   * injects translations along the path the warding-ring caption
   * (`wardingRing.caption`) already uses — if that wiring breaks, the English
   * fallback appears on screen.
   */
  it("지도 화면이 세 문구를 번역해 캔버스로 넘긴다", () => {
    const source = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
    expect(source).toContain('t("cluster.barExpandAll")');
    expect(source).toContain('t("cluster.barExpandCount"');
    expect(source).toContain('t("cluster.barCollapse")');
    expect(source).toContain("clusterBarLabels={clusterBarLabels}");
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
        topology: { cluster: Record<string, string> };
      };
      const cluster = messages.topology.cluster;
      for (const key of ["barExpandAll", "barExpandCount", "barCollapse"]) {
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
  it("문구가 길어져도 궤도 버튼과 겹치지 않는다", () => {
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
