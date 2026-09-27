import { describe, expect, it } from "vitest";

import {
  chipAnchorRadius,
  computeDensityGate,
  DENSITY_GATE_THRESHOLD,
  DEFAULT_CHIP_RING,
  EXPANDED_CHIP_CLEARANCE,
  type DensityGateParentGeometry,
} from "./density-gate";

/** Builds N child ids. */
function children(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

const NO_GEO = new Map<string, DensityGateParentGeometry>();

describe("computeDensityGate", () => {
  it("does not fold a parent at or below the threshold (no clustered, no chip)", () => {
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", children("cap", DENSITY_GATE_THRESHOLD)], // exactly at the threshold: no folding
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips).toHaveLength(0);
  });

  it("folds every child of an unexpanded parent above the threshold into clustered and emits one chip", () => {
    const kids = children("cap", DENSITY_GATE_THRESHOLD + 1); // 13 of them
    const childrenByParent = new Map<string, readonly string[]>([["d", kids]]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 10, y: 0, angle: 0, ring: 100 }]]),
    });
    for (const kid of kids) expect(result.clusteredIds.has(kid)).toBe(true);
    expect(result.clusteredIds.has("d")).toBe(false); // the parent itself stays visible
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "d", count: 13, expanded: false });
    // anchor = parent + outward(angle 0) × ring(100) = (10+100, 0)
    expect(result.chips[0].anchor.x).toBeCloseTo(110, 6);
    expect(result.chips[0].anchor.y).toBeCloseTo(0, 6);
  });

  it("reveals the children of an expanded dense parent and emits a collapse chip (expanded=true)", () => {
    const kids = children("cap", 20);
    const result = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(["d"]),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "d", expanded: true, count: 20 });
  });

  it("marks the grandchildren (whole subtree) of a folded parent as clustered", () => {
    const caps = children("cap", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", ["el-a", "el-b"]], // grandchildren
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
    });
    expect(result.clusteredIds.has("cap-0")).toBe(true);
    expect(result.clusteredIds.has("el-a")).toBe(true);
    expect(result.clusteredIds.has("el-b")).toBe(true);
  });

  it("emits no chip for a nested dense parent while its ancestor is folded", () => {
    const caps = children("cap", 20);
    const els = children("el", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", els], // cap-0 is crowded too, but d is collapsed so it is hidden
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // Only d emits a chip; cap-0 is clustered and so emits none.
    expect(result.chips.map((c) => c.parentId)).toEqual(["d"]);
  });

  it("emits the chip of a nested dense parent once its ancestor opens", () => {
    const caps = children("cap", 20);
    const els = children("el", 20);
    const childrenByParent = new Map<string, readonly string[]>([
      ["d", caps],
      ["cap-0", els],
    ]);
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(["d"]), // d expanded, cap-0 still collapsed
      parentGeometry: new Map([
        ["d", { x: 0, y: 0, angle: 0 }],
        ["cap-0", { x: 5, y: 5, angle: 0 }],
      ]),
    });
    // d gets an expanded chip and cap-0 a collapsed one; both are visible.
    const byId = new Map(result.chips.map((c) => [c.parentId, c]));
    expect(byId.get("d")?.expanded).toBe(true);
    expect(byId.get("cap-0")?.expanded).toBe(false);
    // el-* stay clustered because cap-0 is collapsed
    expect(result.clusteredIds.has("el-0")).toBe(true);
    // cap-0 itself is visible now that d is expanded
    expect(result.clusteredIds.has("cap-0")).toBe(false);
  });

  it("skips the chip for a parent without geometry but keeps it clustered", () => {
    const kids = children("cap", 20);
    const result = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(),
      parentGeometry: NO_GEO,
    });
    expect(result.chips).toHaveLength(0);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  it("uses DEFAULT_CHIP_RING when no ring is given", () => {
    const result = computeDensityGate({
      childrenByParent: new Map([["d", children("cap", 20)]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: Math.PI / 2 }]]), // outward = +y
    });
    expect(result.chips[0].anchor.x).toBeCloseTo(0, 6);
    expect(result.chips[0].anchor.y).toBeCloseTo(DEFAULT_CHIP_RING, 6);
  });

  it("returns the same result for the same input twice", () => {
    const childrenByParent = new Map<string, readonly string[]>([
      ["d1", children("a", 20)],
      ["d2", children("b", 15)],
      ["d3", children("c", 3)],
    ]);
    const geo = new Map<string, DensityGateParentGeometry>([
      ["d1", { x: 1, y: 2, angle: 0.3 }],
      ["d2", { x: 3, y: 4, angle: 1.1 }],
    ]);
    const args = { childrenByParent, expandedParents: new Set<string>(), parentGeometry: geo };
    const a = computeDensityGate(args);
    const b = computeDensityGate(args);
    expect(b.chips).toEqual(a.chips);
    expect([...b.clusteredIds].sort()).toEqual([...a.clusteredIds].sort());
    // Chip order follows childrenByParent insertion order; d3 is below the threshold.
    expect(a.chips.map((c) => c.parentId)).toEqual(["d1", "d2"]);
  });

  it("exempts domain children, so a project with 14 domains never folds", () => {
    // Reproduced with `/?synth=2000`: a project with 14 direct domains exceeds
    // the threshold of 12, but they are the spine and must not fold. Exempting
    // domains through kindOf leaves zero chips and zero clustered nodes.
    const domainKids = children("domain", 14);
    const result = computeDensityGate({
      childrenByParent: new Map([["project", domainKids]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["project", { x: 0, y: 0, angle: 0 }]]),
      kindOf: () => "domain",
    });
    expect(result.chips).toHaveLength(0);
    expect(result.clusteredIds.size).toBe(0);
  });

  it("with mixed children, shows domains and folds only capabilities", () => {
    // A project with 2 domains plus 13 capabilities as direct children — unusual,
    // but guarded: only the 13 capabilities exceed 12 and fold, the 2 domains stay.
    const kids = [...children("domain", 2), ...children("cap", 13)];
    const kind = (id: string) => (id.startsWith("domain") ? "domain" : "capability");
    const result = computeDensityGate({
      childrenByParent: new Map([["p", kids]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["p", { x: 0, y: 0, angle: 0 }]]),
      kindOf: kind,
    });
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0]).toMatchObject({ parentId: "p", count: 13, expanded: false });
    // Domain children are never clustered; only capability children are.
    expect(result.clusteredIds.has("domain-0")).toBe(false);
    expect(result.clusteredIds.has("domain-1")).toBe(false);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  it("respects a custom threshold", () => {
    const result = computeDensityGate({
      childrenByParent: new Map([["d", children("cap", 5)]]),
      expandedParents: new Set(),
      parentGeometry: new Map([["d", { x: 0, y: 0, angle: 0 }]]),
      threshold: 4, // 5 > 4, so it folds
    });
    expect(result.chips).toHaveLength(1);
    expect(result.clusteredIds.has("cap-0")).toBe(true);
  });

  // Expanded chips are pushed outside the child disc so they never overlap a child node or label.
  it("places the expanded chip anchor outside the child ring, EXPANDED_CHIP_CLEARANCE beyond the folded one", () => {
    const kids = children("cap", 20);
    const geo = new Map<string, DensityGateParentGeometry>([["d", { x: 0, y: 0, angle: 0, ring: 100 }]]);
    const collapsed = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(),
      parentGeometry: geo,
    });
    const expanded = computeDensityGate({
      childrenByParent: new Map([["d", kids]]),
      expandedParents: new Set(["d"]),
      parentGeometry: geo,
    });
    // Collapsed sits on the child ring (100); expanded is ring + clearance.
    expect(collapsed.chips[0].anchor.x).toBeCloseTo(100, 6);
    expect(expanded.chips[0].anchor.x).toBeCloseTo(100 + EXPANDED_CHIP_CLEARANCE, 6);
    // The expanded chip is safely outside the child ring, so it cannot overlap a child.
    const parentToExpanded = Math.hypot(expanded.chips[0].anchor.x, expanded.chips[0].anchor.y);
    expect(parentToExpanded).toBeGreaterThan(100);
    expect(parentToExpanded).toBeGreaterThan(Math.hypot(collapsed.chips[0].anchor.x, collapsed.chips[0].anchor.y));
  });
});

describe("computeDensityGate — heldOpen (the focused node's cross-parent neighbours)", () => {
  const kids = children("cap", DENSITY_GATE_THRESHOLD + 1); // 13 fold
  const geo = new Map([["d", { x: 0, y: 0, angle: 0, ring: 100 }]]);

  it("a held-open child is drawn, the chip claims one fewer, and the rest still fold", () => {
    const result = computeDensityGate({
      childrenByParent: new Map<string, readonly string[]>([["d", kids]]),
      expandedParents: new Set(),
      parentGeometry: geo,
      heldOpen: new Set(["cap-3"]),
    });
    expect(result.clusteredIds.has("cap-3")).toBe(false);
    expect(result.clusteredIds.size).toBe(kids.length - 1);
    expect(result.chips).toHaveLength(1);
    expect(result.chips[0].count).toBe(kids.length - 1);
    expect(result.chips[0].expanded).toBe(false);
  });

  it("a held-open child's own children keep folding", () => {
    const result = computeDensityGate({
      childrenByParent: new Map<string, readonly string[]>([
        ["d", kids],
        ["cap-3", ["el-a", "el-b"]],
      ]),
      expandedParents: new Set(),
      parentGeometry: geo,
      heldOpen: new Set(["cap-3"]),
    });
    expect(result.clusteredIds.has("cap-3")).toBe(false);
    expect(result.clusteredIds.has("el-a")).toBe(true);
    expect(result.clusteredIds.has("el-b")).toBe(true);
  });

  it("without heldOpen nothing changes", () => {
    const plain = computeDensityGate({ childrenByParent: new Map([["d", kids]]), expandedParents: new Set(), parentGeometry: geo });
    const empty = computeDensityGate({ childrenByParent: new Map([["d", kids]]), expandedParents: new Set(), parentGeometry: geo, heldOpen: new Set() });
    expect([...empty.clusteredIds]).toEqual([...plain.clusteredIds]);
    expect(empty.chips).toEqual(plain.chips);
  });
});

describe("chipAnchorRadius", () => {
  it("folded is the child ring, expanded is the child ring plus clearance", () => {
    expect(chipAnchorRadius(100, false)).toBe(100);
    expect(chipAnchorRadius(100, true)).toBe(100 + EXPANDED_CHIP_CLEARANCE);
  });
  it("keeps the expanded radius larger than the folded one, outside the disc", () => {
    for (const ring of [40, 90, 145, 250]) {
      expect(chipAnchorRadius(ring, true)).toBeGreaterThan(chipAnchorRadius(ring, false));
    }
  });
});

describe("computeDensityGate — the chip claims what it hides", () => {
  const geo = new Map([["domain:a", { x: 0, y: 0, angle: 0, ring: 100 }]]);
  // Domain A holds 13 capabilities, so it folds. One of those capabilities holds
  // an element whose own `domain:` names domain B — the dogfood shape where
  // `capability:mcp-server` (domain "AI Agent Integration") holds
  // `element:saved-constellation-sidecar`, whose `domain:` is local vault
  // management. The containment spine gives that element one owner, so it hangs
  // under domain A and domain A's chip is holding it.
  const capabilities = children("cap", DENSITY_GATE_THRESHOLD + 1);
  const childrenByParent = new Map<string, readonly string[]>([
    ["domain:a", capabilities],
    ["cap-1", ["element:shared"]],
  ]);
  const kindOf = (id: string) =>
    id.startsWith("domain:") ? "domain" : id.startsWith("element:") ? "element" : "capability";

  it("counts the grandchild it folds away, so `+N` equals the node badge", () => {
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: geo,
      kindOf,
    });
    expect(result.clusteredIds.has("element:shared")).toBe(true);
    expect(result.chips).toHaveLength(1);
    // 13 capabilities + the element reached through one of them.
    expect(result.chips[0].count).toBe(capabilities.length + 1);
    expect(result.chips[0].count).toBe(result.clusteredIds.size);
  });

  it("counts a shared concept once, however many paths reach it", () => {
    const result = computeDensityGate({
      childrenByParent: new Map<string, readonly string[]>([
        ["domain:a", capabilities],
        ["cap-1", ["element:shared"]],
        ["cap-2", ["element:shared"]],
      ]),
      expandedParents: new Set(),
      parentGeometry: geo,
      kindOf,
    });
    expect(result.chips[0].count).toBe(capabilities.length + 1);
  });

  it("the glyph still names the rank the chip sits on, not the grandchild", () => {
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(),
      parentGeometry: geo,
      kindOf,
    });
    expect(result.chips[0].childKind).toBe("capability");
  });

  it("expanding the parent reveals everything the chip claimed", () => {
    const result = computeDensityGate({
      childrenByParent,
      expandedParents: new Set(["domain:a"]),
      parentGeometry: geo,
      kindOf,
    });
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips[0].expanded).toBe(true);
    expect(result.chips[0].count).toBe(capabilities.length + 1);
  });
});
