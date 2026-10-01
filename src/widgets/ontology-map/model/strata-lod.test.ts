import { describe, expect, it } from "vitest";

import {
  buildDomeModel,
  createDomeRuntime,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_NODE_PX,
  DOME_PLANE,
  updateDomeFrame,
  type DomeRuntime,
  type DomeViewKind,
} from "./dome-view";
import {
  buildStrataLodIndex,
  createStrataLodState,
  fadeStrataLodOut,
  pickStrataLodSlot,
  STRATA_LOD_AGGREGATE_RATIO,
  STRATA_LOD_DISC_BUDGET_HIGH,
  STRATA_LOD_DISC_BUDGET_LOW,
  STRATA_LOD_RESOLVE_RATIO,
  stepStrataLod,
  strataPlaneResolve,
  type StrataLodState,
} from "./strata-lod";

interface VaultNode {
  id: string;
  kind: DomeViewKind;
  x: number;
  y: number;
  parentId: string | null;
}

function vault(size: number): VaultNode[] {
  const domains = Math.max(2, Math.round(Math.sqrt(size) / 3));
  const capabilities = Math.max(domains, Math.round(size * 0.15));
  const spread = Math.sqrt(size) * 30;
  const at = (i: number) => ({ x: Math.cos(i * 2.399) * spread * ((i % 97) / 97), y: Math.sin(i * 2.399) * spread * ((i % 89) / 89) });
  const nodes: VaultNode[] = [{ id: "p", kind: "project", x: 0, y: 0, parentId: null }];
  for (let d = 0; d < domains; d += 1) nodes.push({ id: `d${d}`, kind: "domain", ...at(nodes.length), parentId: "p" });
  for (let c = 0; c < capabilities; c += 1) nodes.push({ id: `c${c}`, kind: "capability", ...at(nodes.length), parentId: `d${c % domains}` });
  for (let e = 0; nodes.length < size; e += 1) {
    const parentId = e % 5 === 0 ? `d${e % domains}` : `c${(e * 7) % capabilities}`;
    nodes.push({ id: `e${e}`, kind: "element", ...at(nodes.length), parentId });
  }
  return nodes;
}

const VIEW = { width: 1440, height: 900 };

function assembledRuntime(nodes: VaultNode[]): DomeRuntime {
  const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
  runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
  runtime.entryArmed = false;
  return runtime;
}

function fitScale(runtime: DomeRuntime): number {
  return 420 / (DOME_PLANE.element.r * runtime.model.unit);
}

function frame(runtime: DomeRuntime, nodes: VaultNode[], scale: number) {
  updateDomeFrame(runtime, nodes, () => 1, 0, scale);
  return { x: runtime.model.centerX, y: runtime.model.centerY, scale, ...VIEW };
}

function step(
  state: StrataLodState,
  runtime: DomeRuntime,
  nodes: VaultNode[],
  scale: number,
  extra: { hoveredId?: string | null; focusedId?: string | null; pointer?: { x: number; y: number } | null; dtMs?: number } = {},
): StrataLodState {
  return stepStrataLod(state, {
    runtime,
    world: { nodes },
    camera: frame(runtime, nodes, scale),
    hoveredId: extra.hoveredId ?? null,
    focusedId: extra.focusedId ?? null,
    pointer: extra.pointer ?? null,
    dtMs: extra.dtMs ?? 8,
    fadeMs: 120,
  });
}

describe("strataPlaneResolve", () => {
  const disc = 2 * DOME_NODE_PX.element;
  it("returns exactly 1 once discs on a lane stand apart, so a sparse plane is drawn as before", () => {
    expect(strataPlaneResolve(1, disc * STRATA_LOD_RESOLVE_RATIO, "element", 10)).toBe(1);
    expect(strataPlaneResolve(1, disc * 4, "element", STRATA_LOD_DISC_BUDGET_LOW)).toBe(1);
  });

  it("returns 0 when neighbouring discs overlap by half, or when too many would be on screen", () => {
    expect(strataPlaneResolve(1, disc * STRATA_LOD_AGGREGATE_RATIO, "element", 10)).toBe(0);
    expect(strataPlaneResolve(1, disc * 4, "element", STRATA_LOD_DISC_BUDGET_HIGH)).toBe(0);
  });

  it("treats a plane with fewer than two nodes on any lane as resolved", () => {
    expect(strataPlaneResolve(Infinity, 1, "capability", 0)).toBe(1);
  });
});

describe("buildStrataLodIndex", () => {
  it("files every capability and element under the domain that holds it, inside that domain's sector", () => {
    const nodes = vault(600);
    const model = buildDomeModel(nodes, { arrangement: "strata" });
    const index = buildStrataLodIndex({ nodes }, model);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    nodes.forEach((node, i) => {
      if (node.kind !== "capability" && node.kind !== "element") return;
      let cursor: VaultNode | undefined = node;
      while (cursor && cursor.kind !== "domain") cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      expect(index.domainIds[index.domainSlotOf[i]]).toBe(cursor!.id);
    });
    for (const domain of index.domains) {
      for (const span of [domain.capability, domain.element, domain.direct]) {
        if (span === null) continue;
        expect(span.lo).toBeGreaterThanOrEqual(domain.from - 1e-6);
        expect(span.hi).toBeLessThanOrEqual(domain.to + 1e-6);
      }
    }
    expect(index.planeCount.capability).toBe(nodes.filter((n) => n.kind === "capability").length);
    expect(index.planeCount.element).toBe(nodes.filter((n) => n.kind === "element").length);
  });
});

describe("stepStrataLod", () => {
  it("leaves a small vault fully resolved, with nothing aggregated to draw", () => {
    const nodes = vault(120);
    const runtime = assembledRuntime(nodes);
    const state = step(createStrataLodState(), runtime, nodes, fitScale(runtime));
    expect(state.active).toBe(false);
    expect(state.planeResolve).toEqual({ capability: 1, element: 1 });
    expect([...state.presence].every((p) => p === 1)).toBe(true);
    expect(state.shapeCount).toBe(0);
  });

  it("aggregates both lower planes of a large vault while every domain stays a disc", () => {
    const nodes = vault(6000);
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS * 0.5;
    const state = step(createStrataLodState(), runtime, nodes, fitScale(runtime));
    expect(state.planeResolve).toEqual({ capability: 0, element: 0 });
    expect(state.active).toBe(true);
    nodes.forEach((node, i) => {
      expect(state.presence[i]).toBe(node.kind === "capability" || node.kind === "element" ? 0 : 1);
    });
    expect(state.shapeCount).toBeGreaterThan(0);
  });

  it("crossfades a hovered domain's sector in, no faster than one fade length", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const scale = fitScale(runtime);
    const state = createStrataLodState();
    for (let i = 0; i < 40; i += 1) step(state, runtime, nodes, scale);
    const capability = nodes.findIndex((n) => n.kind === "capability");
    const slot = state.index!.domainSlotOf[capability];
    let previous = state.presence[capability];
    const seen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      step(state, runtime, nodes, scale, { hoveredId: nodes[capability].id, dtMs: 8 });
      const now = state.presence[capability];
      expect(now - previous).toBeLessThanOrEqual(8 / 120 + 1e-6);
      previous = now;
      seen.push(now);
    }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(0.1);
    expect(seen.at(-1)).toBe(1);
    expect(state.ramps[slot]).toBe(1);
    const other = nodes.findIndex((n, i) => n.kind === "element" && state.index!.domainSlotOf[i] !== slot && state.index!.domainSlotOf[i] >= 0);
    expect(state.presence[other]).toBe(0);
  });

  it("resolves the focused node's sector the same way and fades it out after the focus clears", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const scale = fitScale(runtime);
    const state = createStrataLodState();
    const element = nodes.findIndex((n) => n.kind === "element" && n.parentId?.startsWith("c"));
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale, { focusedId: nodes[element].id });
    expect(state.presence[element]).toBe(1);
    step(state, runtime, nodes, scale);
    expect(state.settling).toBe(true);
    expect(state.presence[element]).toBeGreaterThan(0.9);
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale);
    expect(state.presence[element]).toBe(0);
    expect(state.settling).toBe(false);
  });

  it("crossfades a zoom that crosses the threshold in one frame instead of switching levels at once", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const fit = fitScale(runtime);
    const state = createStrataLodState();
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, fit);
    expect(state.planeResolve.capability).toBe(0);
    const near = fit * 40;
    const levels: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      step(state, runtime, nodes, near, { dtMs: 8 });
      levels.push(state.planeResolve.capability);
    }
    for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(8 / 120 + 1e-6);
    expect(levels[0]).toBeLessThan(0.1);
    expect(levels.at(-1)).toBe(1);
  });

  it("takes its level at once while the tiers are still rising from the flat map", () => {
    const nodes = vault(6000);
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS * 0.3;
    const state = step(createStrataLodState(), runtime, nodes, fitScale(runtime));
    expect(state.planeResolve.element).toBe(0);
  });

  it("starts from fully resolved when arriving into a 3D view that is already standing", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const state = step(createStrataLodState(), runtime, nodes, fitScale(runtime), { dtMs: 8 });
    expect(state.planeResolve.element).toBeCloseTo(1 - 8 / 120, 6);
  });

  it("points at the sector under the pointer, so a band can be hovered without hitting a disc", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const scale = fitScale(runtime);
    const state = createStrataLodState();
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale);
    const region = state.regions[0];
    const m = Math.floor((region.length / 2 - 1) / 2);
    const x = (region.xs[m] + region.xs[region.length - 1 - m]) / 2;
    const y = (region.ys[m] + region.ys[region.length - 1 - m]) / 2;
    expect(pickStrataLodSlot(state, x, y)).toBeGreaterThanOrEqual(0);
    step(state, runtime, nodes, scale, { pointer: { x, y } });
    expect(state.hoverSlot).toBe(pickStrataLodSlot(state, x, y));
    expect(pickStrataLodSlot(state, -500, -500)).toBe(-1);
  });
});

describe("fadeStrataLodOut", () => {
  it("returns every plane to resolved at the same fade rate, then rests", () => {
    const nodes = vault(6000);
    const runtime = assembledRuntime(nodes);
    const state = createStrataLodState();
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, fitScale(runtime));
    expect(state.active).toBe(true);
    let calls = 0;
    let previous = state.planeResolve.element;
    while (fadeStrataLodOut(state, { nodes }, 8, 120)) {
      expect(state.planeResolve.element - previous).toBeLessThanOrEqual(8 / 120 + 1e-6);
      previous = state.planeResolve.element;
      calls += 1;
    }
    expect(calls).toBeGreaterThanOrEqual(13);
    expect(state.active).toBe(false);
    expect(state.shapeCount).toBe(0);
  });
});
