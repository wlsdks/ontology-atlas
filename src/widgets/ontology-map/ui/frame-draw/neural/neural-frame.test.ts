import { describe, expect, it, vi } from "vitest";
import { neuralGraphOf } from "../../../model/dome-view/neural-cells";
import { neuralImpact } from "../../../model/dome-view/neural-impact";
import type { DomeNodeFrame } from "../../../model/dome-view/runtime";
import type { NeuralTokens } from "../../../tokens/read-neural-tokens";
import type { TopologyWorld, WorldEdge, WorldNode } from "../../world/topology-world";
import { lastDrawnNodeCount, lastLitStateCounts } from "../frame-state";
import { buildNeuralFrame, type NeuralFrameInputs } from "./neural-frame";

const TOKENS = vi.hoisted((): NeuralTokens => ({
  capPx: 6, capGainPx: 1, elementPx: 3, elementGainPx: 0.5, domainPx: 10, projectPx: 12,
  nucleusShare: 0.4, nucleusAlpha: 0.8, ringGapPx: 2, ringPx: 1, glowReach: 3, glowAlpha: 0.3, farAlpha: 0.4,
  clusterGlowAlpha: 0.2, clusterGlowPadPx: 20, axonAlpha: 0.3, tractAlpha: 0.2, axonCapPx: 1.5, axonElementPx: 1,
  axonEndPx: 0.5, axonDotPx: 1, axonBow: 0.2, tractPull: 0.3, tractGain: 1, veil: 0.2, axonVeil: 0.1, titleVeil: 0.3,
  zoomGrowMax: 2, titlePinPx: 40, litStartPx: 2, litEndPx: 1, litAlpha: 0.9, litGlowPx: 4, litDotPx: 2,
  signalPx: 2, signalGlowPx: 8, focusRingGapPx: 3, focusRingPx: 1.5, domainNamePx: 14, domainMetaPx: 11,
  domainNameGapPx: 4, domainMetaGapPx: 6, namePx: 12, nameGapPx: 4, nameHaloPx: 3, nameBudget: 20, platePadPx: 8,
  plateRadiusPx: 6, impactNear: 0.9, impactMid: 0.6, impactFar: 0.35, signalMs: 400, spreadMs: 1200,
  inks: { strong: "#fff", name: "#ccc", arc: "#88f", reach: "#f8a", project: "#99f", warning: "#fa0", ground: "#000", halo: "#000", plate: "#111" },
}));
vi.mock("../../../tokens/read-neural-tokens", () => ({ readNeuralTokens: () => TOKENS }));

const CAMERA = { camX: 0, camY: 0, camScale: 1, halfW: 400, halfH: 300 };

function node(id: string, kind: WorldNode["kind"], parentId: string | null, x: number, y: number): WorldNode {
  return { id, kind, label: id, x, y, homeX: x, homeY: y, parentId, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 };
}

function dependency(sourceId: string, targetId: string, nodes: readonly WorldNode[]): WorldEdge {
  const a = nodes.find((n) => n.id === sourceId)!;
  const b = nodes.find((n) => n.id === targetId)!;
  return { id: `${sourceId}>${targetId}`, sourceId, targetId, kind: "depends", relationType: "depends_on", ax: a.x, ay: a.y, bx: b.x, by: b.y,
    controlX: (a.x + b.x) / 2, controlY: (a.y + b.y) / 2, t: 0, level: 2, declaredBySlug: null };
}

/** One domain holding capabilities a, b, c and element e: b and e depend on a, c on b. Depth grows with the index. */
function fixture(overrides: Partial<NeuralFrameInputs> = {}): NeuralFrameInputs {
  const nodes = [
    node("domain", "domain", null, 0, -100),
    node("a", "capability", "domain", -80, 0),
    node("b", "capability", "domain", 0, 40),
    node("c", "capability", "domain", 80, 0),
    node("e", "element", "domain", 0, 120),
  ];
  const edges = [dependency("b", "a", nodes), dependency("e", "a", nodes), dependency("c", "b", nodes)];
  const world = { nodes, edges, nodeById: new Map(nodes.map((n) => [n.id, n])) } as unknown as TopologyWorld;
  const domeFrame = new Map<string, DomeNodeFrame>(nodes.map((n, i) => [n.id, { dx: 0, dy: 0, s: 1, a: 1, u: [0.5, 0.1, 0.9, 0.3, 0.7][i] }]));
  const frames = nodes.map((n) => domeFrame.get(n.id)!);
  return {
    world, domeFrame, viewportWidth: 800, viewportHeight: 600, hoveredNodeId: null, colorFocusedNodeId: null, focusedNodeId: null,
    emphasisById: new Map(), focusRampById: new Map(), reducedMotion: true, now: 1_000, domeLight: null, neural: 1,
    nodeFrameAt: (i: number) => frames[i], tokens: { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as NeuralFrameInputs["tokens"],
    domeFitScale: null, hoveredEdge: null, selectedEdge: null, mapLensKind: "all", pathEdgeIds: null,
    ...overrides,
  };
}

const ids = (input: NeuralFrameInputs) => input.world.nodes.map((n) => n.id);

describe("buildNeuralFrame", () => {
  it("orders the drawn cells far to near", () => {
    const input = fixture();
    const f = buildNeuralFrame(input, CAMERA);
    const depths = [...f.drawOrder.subarray(0, f.drawCount)].map((i) => f.cellU[i]);
    expect(f.drawCount).toBe(5);
    expect(depths).toEqual([...depths].sort((a, b) => b - a));
  });

  it("gives a selected concept's cells and lit axons the hops of its impact", () => {
    const input = fixture({ colorFocusedNodeId: "a", focusedNodeId: "a", focusRampById: new Map([["a", 1]]) });
    const f = buildNeuralFrame(input, CAMERA);
    const impact = neuralImpact(neuralGraphOf(input.world.nodes, input.world.edges), "a");
    const expected = ids(input).map((id) => (id === "a" ? 0 : impact.distance.get(id) ?? -1));
    expect([...f.cellHop.subarray(0, f.cellCount)]).toEqual(expected);
    const litHops = Array.from({ length: f.litCount }, (_, k) => [input.world.edges[f.litEdge[k]].sourceId, f.litHop[k]]);
    expect(litHops.sort()).toEqual([["b", 1], ["c", 2], ["e", 1]]);
  });

  it("lights only a hovered concept's direct ends", () => {
    const input = fixture({ hoveredNodeId: "b", emphasisById: new Map([["b", 1]]) });
    const f = buildNeuralFrame(input, CAMERA);
    const lit = ids(input).filter((_, i) => f.cellLit[i] === 1);
    expect(lit.sort()).toEqual(["a", "b", "c"]);
    expect([...f.cellHop.subarray(0, f.cellCount)].every((hop) => hop === -1)).toBe(true);
  });

  it("flags a cell whose evidence is stale", () => {
    const evidence = new Map([["e", "stale" as const], ["a", "current" as const]]);
    const input = fixture({ domeLight: { evidence } as unknown as NeuralFrameInputs["domeLight"] });
    const f = buildNeuralFrame(input, CAMERA);
    expect(ids(input).filter((_, i) => f.cellStale[i] === 1)).toEqual(["e"]);
    expect(lastLitStateCounts()).toEqual({ current: 1, stale: 1, unknown: 3 });
  });

  it("wraps a cluster's shell around its cells, the farthest one a capability radius inside the rim", () => {
    const input = fixture();
    const f = buildNeuralFrame(input, CAMERA);
    const cells = ids(input).map((_, i) => i);
    const margin = Math.max(...cells.filter((i) => input.world.nodes[i].kind === "capability").map((i) => f.cellR[i]));
    const { shellX, shellY, shellPx } = f.pools[0];
    const reach = cells.map((i) => Math.hypot(f.cellX[i] - shellX, f.cellY[i] - shellY) + f.cellR[i]);
    expect(f.poolCount).toBe(1);
    expect(Math.max(...reach)).toBeCloseTo(shellPx - margin, 6);
  });

  it("reuses its buffers when the same graph is built again", () => {
    const input = fixture();
    const first = buildNeuralFrame(input, CAMERA);
    const buffers = [first.cellX, first.cellAlpha, first.drawOrder, first.axonAX, first.litHop, first.pools, first.pools[0]];
    const lengths = [first.cellX.length, first.axonAX.length];
    const second = buildNeuralFrame({ ...input, now: 2_000 }, { ...CAMERA, camX: 10 });
    const again = [second.cellX, second.cellAlpha, second.drawOrder, second.axonAX, second.litHop, second.pools, second.pools[0]];
    again.forEach((buffer, k) => expect(buffer).toBe(buffers[k]));
    expect([second.cellX.length, second.axonAX.length]).toEqual(lengths);
  });

  it("reports as drawn exactly the cells it emits", () => {
    const f = buildNeuralFrame(fixture(), { ...CAMERA, camX: -380 });
    expect(f.drawCount).toBeGreaterThan(0);
    expect(f.drawCount).toBeLessThan(f.cellCount);
    expect(lastDrawnNodeCount()).toBe(f.drawCount);
  });
});
