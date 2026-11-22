import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { computeHexBoard, type HexBoardLayout } from "./hex-board";
import { computeFocusPlan, NO_FOCUS, planCanals } from "./hex-focus-plan";

const contains = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
const needs = (source: string, target: string): TreeInputEdge => ({ source, target, kind: "depends", relationType: "depends_on" });

function board(): HexBoardLayout {
  const nodes: TreeInputNode[] = [
    { id: "project:p", label: "Project", kind: "project" },
    { id: "domain:d0", label: "Billing", kind: "domain" },
    { id: "domain:d1", label: "Search", kind: "domain" },
    ...["c0", "c1", "c2"].map((c) => ({ id: `capability:${c}`, label: c, kind: "capability" as const })),
    ...["c3", "c4", "c5"].map((c) => ({ id: `capability:${c}`, label: c, kind: "capability" as const })),
    { id: "element:e0", label: "Ledger", kind: "element" },
  ];
  const edges: TreeInputEdge[] = [
    contains("project:p", "domain:d0"),
    contains("project:p", "domain:d1"),
    ...["c0", "c1", "c2"].map((c) => contains("domain:d0", `capability:${c}`)),
    ...["c3", "c4", "c5"].map((c) => contains("domain:d1", `capability:${c}`)),
    contains("capability:c0", "element:e0"),
    needs("capability:c1", "capability:c0"),
    needs("capability:c3", "capability:c0"),
    needs("capability:c4", "capability:c3"),
    needs("capability:c2", "capability:c5"),
  ];
  return computeHexBoard(nodes, edges);
}

const none = new Map<string, string>();

describe("computeFocusPlan", () => {
  const layout = board();

  it("focuses nothing without a board, a selection or a hover", () => {
    expect(computeFocusPlan(null, "capability:c0", null, false, none)).toBe(NO_FOCUS);
    expect(computeFocusPlan(layout, null, null, false, none)).toBe(NO_FOCUS);
  });

  it("lights a selected capability with its domain, what it needs and who needs it", () => {
    const plan = computeFocusPlan(layout, "capability:c3", null, false, none);
    expect([...plan.lit!].sort()).toEqual(["capability:c0", "capability:c3", "capability:c4", "domain:d1"]);
    expect(plan.jobs.map((j) => [j.role, j.from[0], j.to[0]])).toEqual([
      ["need", "capability:c3", "capability:c0"],
      ["use", "capability:c4", "capability:c3"],
    ]);
    expect(plan.region).toBeNull();
  });

  it("routes a hovered capability's neighbours but keeps the rest lit", () => {
    const plan = computeFocusPlan(layout, null, "capability:c3", false, none);
    expect(plan.lit).toBeNull();
    expect(plan.jobs).toHaveLength(2);
  });

  it("ignores a selection that is not on the board and falls back to the hover", () => {
    const plan = computeFocusPlan(layout, "capability:gone", "capability:c0", false, none);
    expect(plan.jobs.map((j) => j.role).sort()).toEqual(["use", "use"]);
  });

  it("focuses a selected domain: its region, with outward needs ahead of inner ones", () => {
    const plan = computeFocusPlan(layout, "domain:d0", null, false, none);
    expect(plan.region).toBe("domain:d0");
    expect(plan.lit!.has("capability:c0")).toBe(true);
    expect(plan.lit!.has("capability:c5")).toBe(true);
    const roles = plan.jobs.map((j) => j.role);
    expect(roles.indexOf("need")).toBeLessThan(roles.indexOf("need-inside"));
  });

  it("draws no routes for a hovered domain and lights nothing for it", () => {
    const plan = computeFocusPlan(layout, null, "domain:d0", false, none);
    expect(plan).toEqual({ lit: null, jobs: [], region: null });
  });

  it("focuses nothing for a project or an element", () => {
    expect(computeFocusPlan(layout, "project:p", null, false, none)).toBe(NO_FOCUS);
    expect(computeFocusPlan(layout, "element:e0", null, false, none)).toBe(NO_FOCUS);
  });

  it("lights every stale capability and its domain in stale-only mode, with no routes", () => {
    const evidence = new Map([
      ["capability:c1", "stale"],
      ["capability:c4", "stale"],
      ["capability:c2", "fresh"],
    ]);
    const plan = computeFocusPlan(layout, null, null, true, evidence);
    expect([...plan.lit!].sort()).toEqual(["capability:c1", "capability:c4", "domain:d0", "domain:d1"]);
    expect(plan.jobs).toEqual([]);
  });

  it("lets a selection win over stale-only mode", () => {
    const evidence = new Map([["capability:c1", "stale"]]);
    const plan = computeFocusPlan(layout, "capability:c3", null, true, evidence);
    expect(plan.lit!.has("capability:c3")).toBe(true);
    expect(plan.lit!.has("capability:c1")).toBe(false);
  });
});

describe("planCanals", () => {
  it("is empty without a board", () => {
    expect(planCanals(null)).toEqual({ jobs: [], flows: new Map() });
  });

  it("makes one job per domain pair, from the domain tile to the other's, and keeps its flow", () => {
    const plan = planCanals(board());
    expect(plan.jobs).toHaveLength(1);
    const job = plan.jobs[0]!;
    expect(job.role).toBe("canal");
    expect(job.from[0]).toMatch(/^domain:/);
    expect(job.to[0]).toMatch(/^domain:/);
    expect(plan.flows.get(job.bundle)).toEqual({ count: 2, twoWay: true });
  });
});
