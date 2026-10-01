import { describe, expect, it } from "vitest";

import {
  buildDomeModel,
  createDomeRuntime,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_NODE_PX,
  updateDomeFrame,
  type DomeRuntime,
  type DomeViewKind,
} from "./dome-view";
import {
  buildStrataLodIndex,
  createStrataLodChords,
  createStrataLodState,
  fadeStrataLodOut,
  pickStrataLodSlot,
  rollUpStrataDependencies,
  STRATA_LOD_AGGREGATE_RATIO,
  STRATA_LOD_DISC_BUDGET_HIGH,
  STRATA_LOD_DISC_BUDGET_LOW,
  STRATA_LOD_MAX_STEP_MS,
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

const W = 1512;
const H = 982;

function vault(size: number): VaultNode[] {
  const domains = Math.max(1, Math.round(Math.sqrt(size) / 3));
  const capabilities = Math.round(size * 0.15);
  const elements = size - 1 - domains - capabilities;
  const spread = Math.sqrt(size) * 30;
  const nodes: VaultNode[] = [];
  const add = (id: string, kind: DomeViewKind, parentId: string | null) => {
    const i = nodes.length;
    nodes.push({
      id,
      kind,
      x: Math.cos(i * 2.399) * spread * ((i % 97) / 97),
      y: Math.sin(i * 2.399) * spread * ((i % 89) / 89),
      parentId,
    });
  };
  add("synth-project", "project", null);
  for (let d = 0; d < domains; d += 1) add(`synth-domain-${d}`, "domain", "synth-project");
  for (let c = 0; c < capabilities; c += 1) add(`synth-cap-${c}`, "capability", `synth-domain-${c % domains}`);
  for (let e = 0; e < elements; e += 1) {
    const r = e % 20;
    const skewed = Math.floor(capabilities * Math.pow(((e * 2654435761) >>> 0) / 4294967296, 2));
    const parentId =
      r === 0 ? null : r % 4 === 0 ? `synth-domain-${e % domains}` : `synth-cap-${Math.min(capabilities - 1, skewed)}`;
    add(`synth-el-${e}`, "element", parentId);
  }
  return nodes;
}

function assembled(nodes: VaultNode[], pitch?: number): DomeRuntime {
  const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
  runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
  runtime.entryArmed = false;
  if (pitch !== undefined) {
    runtime.pitch = pitch;
    runtime.pitchTarget = pitch;
  }
  return runtime;
}

function fitScale(runtime: DomeRuntime, nodes: VaultNode[]): number {
  updateDomeFrame(runtime, nodes, () => 1, 0, 1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const frame = runtime.frame.get(node.id)!;
    minX = Math.min(minX, node.x + frame.dx);
    maxX = Math.max(maxX, node.x + frame.dx);
    minY = Math.min(minY, node.y + frame.dy);
    maxY = Math.max(maxY, node.y + frame.dy);
  }
  return Math.min(((W - 420) * 0.98 - 26) / (maxX - minX), ((H - 140) * 0.98 - 26) / (maxY - minY));
}

interface StepExtra {
  hoveredId?: string | null;
  focusedId?: string | null;
  pointer?: { x: number; y: number } | null;
  evidence?: ReadonlyMap<string, "current" | "stale" | "unknown"> | null;
  dtMs?: number;
}

function step(state: StrataLodState, runtime: DomeRuntime, nodes: VaultNode[], scale: number, extra: StepExtra = {}) {
  updateDomeFrame(runtime, nodes, () => 1, 0, scale);
  const camera = { x: runtime.model.centerX, y: runtime.model.centerY, scale, width: W, height: H };
  stepStrataLod(state, {
    runtime,
    world: { nodes },
    camera,
    hoveredId: extra.hoveredId ?? null,
    focusedId: extra.focusedId ?? null,
    pointer: extra.pointer ?? null,
    evidence: extra.evidence ?? null,
    dtMs: extra.dtMs ?? 8,
    fadeMs: 120,
  });
  return camera;
}

function settled(nodes: VaultNode[], pitch?: number) {
  const runtime = assembled(nodes, pitch);
  const scale = fitScale(runtime, nodes);
  const state = createStrataLodState();
  let camera = step(state, runtime, nodes, scale);
  for (let i = 0; i < 40; i += 1) camera = step(state, runtime, nodes, scale);
  return { runtime, scale, state, camera };
}

function screenOf(runtime: DomeRuntime, node: VaultNode, camera: { x: number; y: number; scale: number }) {
  const frame = runtime.frame.get(node.id)!;
  return { x: (node.x + frame.dx - camera.x) * camera.scale + W / 2, y: (node.y + frame.dy - camera.y) * camera.scale + H / 2 };
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
      if (cursor === undefined) expect(index.domainSlotOf[i]).toBe(-1);
      else expect(index.domainIds[index.domainSlotOf[i]]).toBe(cursor.id);
    });
    for (const domain of index.domains) {
      for (const span of [domain.capability, domain.element, domain.direct]) {
        if (span === null) continue;
        expect(span.lo).toBeGreaterThanOrEqual(domain.from - 1e-6);
        expect(span.hi).toBeLessThanOrEqual(domain.to + 1e-6);
      }
    }
  });
});

describe("stepStrataLod", () => {
  it("leaves a small vault fully resolved, with nothing aggregated to draw", () => {
    const { state } = settled(vault(150));
    expect(state.active).toBe(false);
    expect(state.planeResolve).toEqual({ capability: 1, element: 1 });
    expect([...state.presence].every((p) => p === 1)).toBe(true);
    expect(state.shapeCount).toBe(0);
  });

  it("aggregates both lower planes of a large vault while every domain stays a disc", () => {
    const nodes = vault(6000);
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS * 0.5;
    const state = createStrataLodState();
    step(state, runtime, nodes, fitScale(runtime, nodes));
    expect(state.planeResolve).toEqual({ capability: 0, element: 0 });
    nodes.forEach((node, i) => {
      expect(state.presence[i]).toBe(node.kind === "capability" || node.kind === "element" ? 0 : 1);
    });
    expect(state.shapeCount).toBeGreaterThan(0);
  });

  it.each([2000, 5000, 10000])("resolves the pointed dot's own domain for at least 99%% of on-screen dust at %i concepts", (size) => {
    for (const pitch of [undefined, 0.3, 0.9]) {
      const nodes = vault(size);
      const { runtime, state, camera } = settled(nodes, pitch);
      let own = 0;
      let total = 0;
      nodes.forEach((node, i) => {
        const slot = state.index!.domainSlotOf[i];
        if (slot < 0 || (node.kind !== "capability" && node.kind !== "element") || state.presence[i] > 0.02) return;
        const at = screenOf(runtime, node, camera);
        if (at.x < 0 || at.y < 0 || at.x > W || at.y > H) return;
        total += 1;
        if (pickStrataLodSlot(state, at.x, at.y) === slot) own += 1;
      });
      expect(total).toBeGreaterThan(size * 0.5);
      expect(own / total).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("crossfades a pointed domain's slice in, no faster than one fade length", () => {
    const nodes = vault(6000);
    const { runtime, scale, state, camera } = settled(nodes);
    const element = nodes.findIndex((n, i) => n.kind === "element" && state.index!.domainSlotOf[i] >= 0);
    const slot = state.index!.domainSlotOf[element];
    const pointer = screenOf(runtime, nodes[element], camera);
    let previous = state.presence[element];
    const seen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      step(state, runtime, nodes, scale, { pointer });
      expect(state.presence[element] - previous).toBeLessThanOrEqual(8 / 120 + 1e-6);
      previous = state.presence[element];
      seen.push(previous);
    }
    expect(state.hoverSlot).toBe(slot);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(0.1);
    expect(seen.at(-1)).toBe(1);
  });

  it("keeps the pointed slice while the dome coasts under a resting pointer", () => {
    const nodes = vault(10000);
    const { runtime, scale, state } = settled(nodes);
    const pointer = { x: W / 2 + 180, y: H / 2 + 230 };
    for (let i = 0; i < 40; i += 1) step(state, runtime, nodes, scale, { pointer });
    const held = state.hoverSlot;
    let switches = 0;
    for (let frame = 0; frame < 720; frame += 1) {
      runtime.yaw += (0.5 * Math.PI) / 180;
      runtime.yawVel = 0.001;
      step(state, runtime, nodes, scale, { pointer: { x: pointer.x + (frame % 3), y: pointer.y } });
      if (state.hoverSlot !== held) switches += 1;
    }
    expect(switches).toBe(0);
    expect(state.settling).toBe(false);
  });

  it("releases the slice the moment the pointer leaves the canvas", () => {
    const nodes = vault(6000);
    const { runtime, scale, state, camera } = settled(nodes);
    const element = nodes.findIndex((n, i) => n.kind === "element" && state.index!.domainSlotOf[i] >= 0);
    const pointer = screenOf(runtime, nodes[element], camera);
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale, { pointer });
    expect(state.presence[element]).toBe(1);
    step(state, runtime, nodes, scale, { pointer: null });
    expect(state.hoverSlot).toBe(-1);
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale, { pointer: null });
    expect(state.presence[element]).toBe(0);
  });

  it("resolves the focused concept's domain and fades it out after the focus clears", () => {
    const nodes = vault(6000);
    const { runtime, scale, state } = settled(nodes);
    const element = nodes.findIndex((n) => n.kind === "element" && n.parentId?.startsWith("synth-cap"));
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale, { focusedId: nodes[element].id });
    expect(state.presence[element]).toBe(1);
    for (let i = 0; i < 20; i += 1) step(state, runtime, nodes, scale);
    expect(state.presence[element]).toBe(0);
    expect(state.settling).toBe(false);
  });

  it("keeps stale and unknown concepts as discs when evidence was measured, and aggregates the current ones", () => {
    const nodes = vault(6000);
    const { runtime, scale, state } = settled(nodes);
    const elements = nodes.filter((n) => n.kind === "element");
    const evidence = new Map<string, "current" | "stale" | "unknown">();
    elements.forEach((n, i) => evidence.set(n.id, i % 3 === 0 ? "stale" : i % 3 === 1 ? "unknown" : "current"));
    step(state, runtime, nodes, scale, { evidence });
    nodes.forEach((node, i) => {
      if (node.kind !== "element") return;
      expect(state.presence[i]).toBe(evidence.get(node.id) === "current" ? 0 : 1);
    });
    step(state, runtime, nodes, scale, { evidence: null });
    nodes.forEach((node, i) => {
      if (node.kind === "element") expect(state.presence[i]).toBe(0);
    });
  });

  it("crossfades a zoom across the threshold instead of switching levels at once", () => {
    const nodes = vault(6000);
    const { runtime, scale, state } = settled(nodes);
    expect(state.planeResolve.capability).toBe(0);
    const levels: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      step(state, runtime, nodes, scale * 40, { dtMs: 8 });
      levels.push(state.planeResolve.capability);
    }
    for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(8 / 120 + 1e-6);
    expect(levels[0]).toBeLessThan(0.1);
    expect(levels.at(-1)).toBe(1);
  });

  it("advances no more than one sixtieth of a second on the first frame after the map wakes", () => {
    const nodes = vault(6000);
    const { runtime, scale, state } = settled(nodes);
    step(state, runtime, nodes, scale * 40, { dtMs: 50 });
    expect(state.planeResolve.capability).toBeCloseTo(STRATA_LOD_MAX_STEP_MS / 120, 6);
  });

  it("takes its level at once while the tiers are still rising from the flat map", () => {
    const nodes = vault(6000);
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "strata" }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS * 0.3;
    const state = createStrataLodState();
    step(state, runtime, nodes, fitScale(runtime, nodes));
    expect(state.planeResolve.element).toBe(0);
  });

  it("starts from fully resolved when arriving into a 3D view that is already standing", () => {
    const nodes = vault(6000);
    const runtime = assembled(nodes);
    const state = createStrataLodState();
    step(state, runtime, nodes, fitScale(runtime, nodes), { dtMs: 8 });
    expect(state.planeResolve.element).toBeCloseTo(1 - 8 / 120, 6);
  });
});

describe("rollUpStrataDependencies", () => {
  it("carries each dependency with a dust end on its ordered domain pair, and counts those it cannot carry", () => {
    const domainSlotOf = Int32Array.from([0, 0, 1, 1, -1]);
    const edges = [
      { kind: "depends" },
      { kind: "depends" },
      { kind: "depends" },
      { kind: "depends" },
      { kind: "contains" },
      { kind: "depends" },
    ];
    const source = Int32Array.from([0, 1, 2, 0, 0, 4]);
    const target = Int32Array.from([2, 3, 0, 1, 2, 2]);
    const presence = [0, 0, 0, 0, 1];
    const chords = createStrataLodChords();
    rollUpStrataDependencies(chords, 2, domainSlotOf, edges, source, target, (i) => presence[i], () => 1);
    expect(chords.count[0 * 2 + 1]).toBe(2);
    expect(chords.count[1 * 2 + 0]).toBe(1);
    expect(chords.represented).toBe(3);
    expect(chords.hidden).toBe(2);
    presence[2] = 1;
    presence[0] = 1;
    rollUpStrataDependencies(chords, 2, domainSlotOf, edges, source, target, (i) => presence[i], () => 1);
    expect(chords.count[0 * 2 + 1]).toBe(1);
    expect(chords.weight[0 * 2 + 1]).toBeCloseTo(1, 6);
  });
});

describe("fadeStrataLodOut", () => {
  it("returns every plane to resolved at the same fade rate, then rests", () => {
    const nodes = vault(6000);
    const { state } = settled(nodes);
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
