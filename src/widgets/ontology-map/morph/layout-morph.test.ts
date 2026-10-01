import { describe, expect, it } from "vitest";

import type { MapLayoutMark, MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import { CAMERA_TWEEN_MAX_MS, CAMERA_TWEEN_MIN_MS } from "../model/motion-physics";
import { chooseLayoutSwitch, containmentParents, planLayoutMorph, sampleLayoutMorph } from "./layout-morph";

const VIEWS: readonly MapLayoutView[] = ["flat", "territories", "hex", "galaxy", "strata", "coupling"];

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

const at = (marks: readonly MapLayoutMark[], id: string) => marks.find((m) => m.id === id);

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

  it("leaves the map's own four views to their native morphs", () => {
    for (const from of ["flat", "galaxy", "strata", "coupling"] as const) {
      for (const to of ["flat", "galaxy", "strata", "coupling"] as const) {
        if (from !== to) expect(chooseLayoutSwitch({ ...base, from, to })).toBe("native");
      }
    }
  });

  it("carries ghosts through every pair with Territories or Hex whose targets are ready", () => {
    expect(chooseLayoutSwitch({ ...base, from: "flat", to: "hex" })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, from: "hex", to: "territories" })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, from: "territories", to: "galaxy" })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, from: "strata", to: "territories" })).toBe("ghost");
  });

  it("crossfades into and out of Coupling, and into the map's views past their measured ceilings", () => {
    expect(chooseLayoutSwitch({ ...base, from: "hex", to: "coupling" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, from: "coupling", to: "territories" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "flat" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "galaxy" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "territories", to: "strata" })).toBe("fade");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "flat", to: "territories" })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, conceptCount: 10000, from: "galaxy", to: "hex" })).toBe("ghost");
  });

  it("retargets a travel in flight instead of handing it to a native morph", () => {
    expect(chooseLayoutSwitch({ ...base, from: "flat", to: "galaxy", fromOverlay: true })).toBe("ghost");
    expect(chooseLayoutSwitch({ ...base, from: "hex", to: "coupling", fromOverlay: true })).toBe("fade");
  });
});

describe("planLayoutMorph", () => {
  const parents = new Map([
    ["domain:a", "project:p"],
    ["capability:a1", "domain:a"],
    ["element:a1x", "capability:a1"],
  ]);

  it("moves a concept drawn in both views from its old place to its new one", () => {
    const plan = planLayoutMorph([mark("domain:a", 10, 20)], [mark("domain:a", 110, 220)], parents);
    expect(at(sampleLayoutMorph(plan, 0), "domain:a")).toMatchObject({ x: 10, y: 20 });
    expect(at(sampleLayoutMorph(plan, 1), "domain:a")).toMatchObject({ x: 110, y: 220 });
  });

  it("sends a concept missing from the target into its nearest drawn ancestor, fading out", () => {
    const plan = planLayoutMorph(
      [mark("domain:a", 0, 0), mark("element:a1x", 50, 50)],
      [mark("domain:a", 300, 100)],
      parents,
    );
    const middle = at(sampleLayoutMorph(plan, 0.5), "element:a1x")!;
    expect(middle.x).toBeGreaterThan(50);
    expect(middle.alpha).toBeLessThan(1);
    expect(at(sampleLayoutMorph(plan, 1), "element:a1x")).toBeUndefined();
  });

  it("raises a concept missing from the source out of its nearest drawn ancestor", () => {
    const plan = planLayoutMorph([mark("domain:a", 40, 60)], [mark("domain:a", 40, 60), mark("capability:a1", 200, 60)], parents);
    const i = plan.ids.indexOf("capability:a1");
    expect([plan.x0[i], plan.y0[i]]).toEqual([40, 60]);
    expect(at(sampleLayoutMorph(plan, 0.5), "capability:a1")!.alpha).toBeLessThan(1);
    expect(at(sampleLayoutMorph(plan, 1), "capability:a1")).toMatchObject({ x: 200, y: 60, alpha: 1 });
  });

  it("fades an orphan in place", () => {
    const plan = planLayoutMorph([], [mark("element:loose", 70, 80)], parents);
    for (const p of [0.25, 0.5, 1]) expect(at(sampleLayoutMorph(plan, p), "element:loose")).toMatchObject({ x: 70, y: 80 });
  });

  it("plans nothing for empty views and one travel for a single concept", () => {
    const empty = planLayoutMorph([], [], parents);
    expect(empty.ids).toEqual([]);
    expect(empty.durationMs).toBe(CAMERA_TWEEN_MIN_MS);
    expect(planLayoutMorph([mark("project:p", 0, 0)], [mark("project:p", 9, 9)], parents).ids).toEqual(["project:p"]);
  });

  it("keeps the first of duplicate ids and drops non-finite marks", () => {
    const plan = planLayoutMorph(
      [mark("domain:a", 0, 0), mark("domain:a", 999, 999), mark("domain:b", Number.NaN, 0), mark("domain:c", 0, Number.POSITIVE_INFINITY)],
      [mark("domain:a", 10, 0)],
      parents,
    );
    expect(plan.ids).toEqual(["domain:a"]);
    expect(at(sampleLayoutMorph(plan, 0), "domain:a")).toMatchObject({ x: 0, y: 0 });
  });

  it("stops walking a containment cycle and falls back to fading in place", () => {
    const cyclic = new Map([
      ["capability:x", "capability:y"],
      ["capability:y", "capability:x"],
    ]);
    const plan = planLayoutMorph([mark("capability:x", 5, 5)], [mark("domain:z", 500, 500)], cyclic);
    expect(at(sampleLayoutMorph(plan, 0.5), "capability:x")).toMatchObject({ x: 5, y: 5 });
  });

  it("clamps the travel to the camera tween's bounds and lengthens it with distance", () => {
    const near = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 4, 0)], parents).durationMs;
    const mid = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 600, 0)], parents).durationMs;
    const far = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 9000, 0)], parents).durationMs;
    expect(near).toBeGreaterThanOrEqual(CAMERA_TWEEN_MIN_MS);
    expect(mid).toBeGreaterThan(near);
    expect(far).toBe(CAMERA_TWEEN_MAX_MS);
  });

  it("decelerates into the target", () => {
    const plan = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 1000, 0)], parents);
    const x = (p: number) => at(sampleLayoutMorph(plan, p), "domain:a")!.x;
    expect(x(0.05)).toBeGreaterThan(0);
    expect(x(1) - x(0.95)).toBeLessThan(x(0.55) - x(0.5));
  });

  it("reverses from where the concepts are, not from where they started", () => {
    const outbound = planLayoutMorph([mark("domain:a", 0, 0)], [mark("domain:a", 400, 0)], parents);
    const midway = sampleLayoutMorph(outbound, 0.4);
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
      { id: "capability:c", label: "C", kind: "capability" as const },
    ];
    const contains = (source: string, target: string) => ({ source, target, kind: "contains" as const, relationType: "contains" });
    const parents = containmentParents(nodes, [contains("domain:b", "capability:c"), contains("domain:a", "capability:c")]);
    expect(parents.get("capability:c")).toBe("domain:a");
    expect(parents.get("domain:a")).toBe("project:p");
    expect(parents.has("project:p")).toBe(false);
  });
});
