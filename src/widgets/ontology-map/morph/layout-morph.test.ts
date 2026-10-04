import { describe, expect, it } from "vitest";

import type { MapLayoutMark, MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import { SPRING, springVisualMs } from "@/shared/motion/spring";
import { MOTION } from "@/shared/motion/tokens";
import { chooseLayoutSwitch, containmentParents, planLayoutMorph, sampleLayoutMorph } from "./layout-morph";

const VIEWS: readonly MapLayoutView[] = ["flat", "territories", "hex", "strata", "coupling"];

const mark = (id: string, x: number, y: number, extra: Partial<MapLayoutMark> = {}): MapLayoutMark => ({
  id,
  x,
  y,
  size: 6,
  shape: "disc",
  fill: "#445566",
  stroke: "#778899",
  alpha: 1,
  ...extra,
});

const END = 2000;

const at = (marks: readonly MapLayoutMark[], id: string) => {
  const hit = marks.find((m) => m.id === id);
  return hit && { ...hit, x: Math.round(hit.x * 1e6) / 1e6, y: Math.round(hit.y * 1e6) / 1e6 };
};

describe("chooseLayoutSwitch", () => {
  const base = { armed: true, reducedMotion: false, conceptCount: 2000 };

  it("does nothing when the pick names the view already shown", () => {
    for (const view of VIEWS) expect(chooseLayoutSwitch({ ...base, from: view, to: view })).toBe("none");
  });

  it("cuts every unarmed change, so an address arrival never morphs", () => {
    expect(chooseLayoutSwitch({ ...base, armed: false, from: "flat", to: "hex" })).toBe("cut");
  });

  it("crossfades all thirty directions under reduced motion", () => {
    for (const from of VIEWS) {
      for (const to of VIEWS) {
        if (from !== to) expect(chooseLayoutSwitch({ ...base, reducedMotion: true, from, to })).toBe("fade");
      }
    }
  });

  it("leaves the map's own three views to their native morphs", () => {
    for (const from of ["flat", "strata", "coupling"] as const) {
      for (const to of ["flat", "strata", "coupling"] as const) {
        if (from !== to) expect(chooseLayoutSwitch({ ...base, from, to })).toBe("native");
      }
    }
  });

  it("crossfades into and out of Coupling, and into the map's views past their measured ceilings", () => {
    expect(chooseLayoutSwitch({ ...base, from: "hex", to: "coupling" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, from: "coupling", to: "territories" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "flat" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "structure" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "strata" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "flat", to: "territories" })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "structure", to: "hex" })).toBe("fade");
  });

  it("retargets a travel in flight instead of handing it to a native morph", () => {
    expect(chooseLayoutSwitch({ ...base, from: "flat", to: "structure", fromOverlay: true })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, from: "hex", to: "coupling", fromOverlay: true })).toBe("fade");
  });
});

describe("planLayoutMorph", () => {
  const parents = new Map([
    ["domain:a", "project:p"],
    ["capability:a1", "domain:a"],
    ["element:a1x", "capability:a1"]
    ]);

  it("moves a concept drawn in both views from its old place to its new one", () => {
    const plan = planLayoutMorph([mark("domain:a", 10, 20)], [mark("domain:a", 110, 220)], parents);
    expect(at(sampleLayoutMorph(plan, 0), "domain:a")).toMatchObject({ x: 10, y: 20 });
    expect(at(sampleLayoutMorph(plan, END), "domain:a")).toMatchObject({ x: 110, y: 220 });
  });

  it("finishes shrinking a tile before painting it as a bright star while its position still glides", () => {
    const plan = planLayoutMorph(
      [{ ...mark("domain:a", 10, 20), size: 96, shape: "hex" }],
      [{ ...mark("domain:a", 1010, 620), size: 4, shape: "disc", fill: "#c8dcff" }],
      new Map());
    const moving = at(sampleLayoutMorph(plan, MOTION.base.duration * 1000), "domain:a")!;
    expect(moving).toMatchObject({ size: 4, shape: "disc", fill: "#c8dcff" });
    expect(moving.x).not.toBe(1010);
    expect(at(sampleLayoutMorph(plan, 0), "domain:a")!.size).toBe(96);
    expect(at(sampleLayoutMorph(plan, END), "domain:a")!.size).toBe(4);
  });

  it("keeps a growing tile on its positional clock so it cannot expand ahead of its landing", () => {
    const plan = planLayoutMorph(
      [{ ...mark("domain:a", 10, 20), size: 4 }],
      [{ ...mark("domain:a", 1010, 620), size: 96, shape: "hex" }],
      new Map());
    const moving = at(sampleLayoutMorph(plan, MOTION.base.duration * 1000), "domain:a")!;
    expect(moving.size).toBeGreaterThan(4);
    expect(moving.size).toBeLessThan(96);
    expect(moving.size).toBeCloseTo(4 + 92 * ((moving.x - 10) / 1000));
  });

  it("sends a concept missing from the target into its nearest drawn ancestor, fading out", () => {
    const plan = planLayoutMorph(
      [mark("domain:a", 0, 0), mark("element:a1x", 50, 50)],
      [mark("domain:a", 300, 100)],
      parents);
    const middle = at(sampleLayoutMorph(plan, 120), "element:a1x")!;
    expect(middle.x).toBeGreaterThan(50);
    expect(middle.alpha).toBeLessThan(1);
    expect(at(sampleLayoutMorph(plan, END), "element:a1x")).toBeUndefined();
  });

  it("raises a concept missing from the source out of its nearest drawn ancestor", () => {
    const plan = planLayoutMorph([mark("domain:a", 40, 60)], [mark("domain:a", 40, 60), mark("capability:a1", 200, 60)], parents);
    const i = plan.ids.indexOf("capability:a1");
    expect([plan.x0[i], plan.y0[i]]).toEqual([40, 60]);
    expect(at(sampleLayoutMorph(plan, 120), "capability:a1")!.alpha).toBeLessThan(1);
    expect(at(sampleLayoutMorph(plan, END), "capability:a1")).toMatchObject({ x: 200, y: 60, alpha: 1 });
  });

  it("fades an orphan in place", () => {
    const plan = planLayoutMorph([], [mark("element:loose", 70, 80)], parents);
    for (const p of [60, 120, END]) expect(at(sampleLayoutMorph(plan, p), "element:loose")).toMatchObject({ x: 70, y: 80 });
  });

  it("plans nothing for empty views and one travel for a single concept", () => {
    const empty = planLayoutMorph([], [], parents);
    expect(empty.ids).toEqual([]);
    expect(empty.durationMs).toBe(springVisualMs(SPRING.canvas));
    expect(planLayoutMorph([mark("project:p", 0, 0)], [mark("project:p", 9, 9)], parents).ids).toEqual(["project:p"]);
  });

  it("keeps the first of duplicate ids and drops non-finite marks", () => {
    const plan = planLayoutMorph(
      [mark("domain:a", 0, 0), mark("domain:a", 999, 999), mark("domain:b", Number.NaN, 0), mark("domain:c", 0, Number.POSITIVE_INFINITY)],
      [mark("domain:a", 10, 0)],
      parents);
    expect(plan.ids).toEqual(["domain:a"]);
    expect(at(sampleLayoutMorph(plan, 0), "domain:a")).toMatchObject({ x: 0, y: 0 });
  });

  it("stops walking a containment cycle and falls back to fading in place", () => {
    const cyclic = new Map([
      ["capability:x", "capability:y"],
      ["capability:y", "capability:x"]
        ]);
    const plan = planLayoutMorph([mark("capability:x", 5, 5)], [mark("domain:z", 500, 500)], cyclic);
    expect(at(sampleLayoutMorph(plan, 120), "capability:x")).toMatchObject({ x: 5, y: 5 });
  });

  it("ends the travel when the slowest, most delayed concept has settled into its visual band", () => {
    const plan = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 600, 0)], parents);
    expect(plan.durationMs).toBe(springVisualMs(SPRING.canvas));
  });

  it("decelerates into the target", () => {
    const plan = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 1000, 0)], parents);
    const x = (ms: number) => at(sampleLayoutMorph(plan, ms), "domain:a")!.x;
    expect(x(30)).toBeGreaterThan(0);
    expect(Math.abs(x(END) - x(END - 30))).toBeLessThan(x(130) - x(100));
  });

  it("reverses from where the concepts are, not from where they started", () => {
    const outbound = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 400, 0)], parents);
    const midway = sampleLayoutMorph(outbound, 120);
    const back = planLayoutMorph(midway, [mark("domain:a", 0, 0)], parents);
    expect(at(sampleLayoutMorph(back, 0), "domain:a")!.x).toBeCloseTo(at(midway, "domain:a")!.x, 6);
  });
});

describe("containmentParents", () => {
  it("names one parent per concept, choosing the first declared parent of the right kind", () => {
    const nodes = [
      { id: "project:p", label: "P", kind: "project" as const },
      { id: "domain:a", label: "A", kind: "domain" as const },
      { id: "domain:b", label: "B", kind: "domain" as const },
      { id: "capability:c", label: "C", kind: "capability" as const }
        ];
    const contains = (source: string, target: string) => ({ source, target, kind: "contains" as const, relationType: "contains" });
    const parents = containmentParents(nodes, [contains("domain:b", "capability:c"), contains("domain:a", "capability:c")]);
    expect(parents.get("capability:c")).toBe("domain:a");
    expect(parents.get("domain:a")).toBe("project:p");
    expect(parents.has("project:p")).toBe(false);
  });
});
