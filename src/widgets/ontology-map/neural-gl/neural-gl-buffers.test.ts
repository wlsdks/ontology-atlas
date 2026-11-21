import { describe, expect, it, vi } from "vitest";
import type { DomeNodeFrame } from "../model/dome-view/runtime";
import type { NeuralTokens } from "../tokens/read-neural-tokens";
import { buildNeuralFrame, type NeuralFrameInputs } from "../ui/frame-draw/neural/neural-frame";
import type { TopologyWorld, WorldEdge, WorldNode } from "../ui/world/topology-world";
import {
  BEHIND_CELLS,
  CELL_FLOATS,
  createNeuralGlBuffers,
  fillNeuralGlBuffers,
  RIBBON_FLOATS,
  SHELL_FLOATS,
  SPOT_FLOATS,
  type NeuralGlInks,
} from "./neural-gl-buffers";

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
vi.mock("../tokens/read-neural-tokens", () => ({ readNeuralTokens: () => TOKENS }));

const INKS: NeuralGlInks = {
  strong: [1, 1, 1, 1], arc: [0.5, 0.5, 1, 1], reach: [1, 0.5, 0.6, 1], project: [0.6, 0.6, 1, 1], warning: [1, 0.6, 0, 1], ground: [0, 0, 0, 1],
  shellAlpha: 0.1, litGlowAlpha: 0.2,
};
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

/** One domain holding capabilities a, b, c and element e: b and e depend on a, c on b. */
function inputs(overrides: Partial<NeuralFrameInputs> = {}): NeuralFrameInputs {
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

const selected = () => inputs({ colorFocusedNodeId: "a", focusedNodeId: "a", focusRampById: new Map([["a", 1]]) });

describe("fillNeuralGlBuffers", () => {
  it("draws each drawn cell once, far to near, on the frame's own disc", () => {
    const buffers = createNeuralGlBuffers();
    const frame = buildNeuralFrame(inputs(), CAMERA);
    fillNeuralGlBuffers(buffers, frame, INKS);
    expect(buffers.cells.count).toBe(frame.drawCount);
    for (let k = 0; k < frame.drawCount; k += 1) {
      const i = frame.drawOrder[k];
      const o = k * CELL_FLOATS;
      expect([...buffers.cells.data.subarray(o, o + 4)]).toEqual([frame.cellX[i], frame.cellY[i], frame.cellR[i], frame.cellU[i]].map(Math.fround));
    }
    expect(buffers.restAxons.count).toBe(frame.axonCount);
  });

  it("reuses its arrays when a frame of the same graph is filled again", () => {
    const buffers = createNeuralGlBuffers();
    fillNeuralGlBuffers(buffers, buildNeuralFrame(selected(), CAMERA), INKS);
    const arrays = [buffers.shells, buffers.halos, buffers.cells, buffers.rings, buffers.restAxons, buffers.restDots, buffers.litAxons, buffers.litSpots].map((batch) => batch.data);
    fillNeuralGlBuffers(buffers, buildNeuralFrame({ ...selected(), now: 2_000 }, { ...CAMERA, camX: 10 }), INKS);
    [buffers.shells, buffers.halos, buffers.cells, buffers.rings, buffers.restAxons, buffers.restDots, buffers.litAxons, buffers.litSpots].forEach((batch, k) => expect(batch.data).toBe(arrays[k]));
  });

  it("draws lit axons and the focus ring only while a focus is lit", () => {
    const buffers = createNeuralGlBuffers();
    fillNeuralGlBuffers(buffers, buildNeuralFrame(inputs(), CAMERA), INKS);
    expect([buffers.litAxons.count, buffers.litSpots.count]).toEqual([0, 0]);
    fillNeuralGlBuffers(buffers, buildNeuralFrame(selected(), CAMERA), INKS);
    expect(buffers.litAxons.count).toBeGreaterThan(0);
    const ringRadii = Array.from({ length: buffers.litSpots.count }, (_, k) => buffers.litSpots.data[k * SPOT_FLOATS + 22]);
    expect(ringRadii.filter((r) => r > 0)).toHaveLength(1);
  });

  it("draws marks without the Neural ramp, which the GL canvas applies as its opacity", () => {
    const full = createNeuralGlBuffers();
    const half = createNeuralGlBuffers();
    fillNeuralGlBuffers(full, buildNeuralFrame(inputs(), CAMERA), INKS);
    const fullAlpha = full.cells.data[7];
    fillNeuralGlBuffers(half, buildNeuralFrame(inputs({ neural: 0.5 }), CAMERA), INKS);
    expect(half.cells.data[7]).toBeCloseTo(fullAlpha, 5);
  });

  it("gives a capability its nucleus and a stale cell its matte surface, and an element neither", () => {
    const buffers = createNeuralGlBuffers();
    const evidence = new Map([["b", "stale" as const]]);
    const frame = buildNeuralFrame(inputs({ domeLight: { evidence } as unknown as NeuralFrameInputs["domeLight"] }), CAMERA);
    fillNeuralGlBuffers(buffers, frame, INKS);
    const coreOf = (id: string) => {
      const k = Array.from(frame.drawOrder.subarray(0, frame.drawCount)).indexOf(["domain", "a", "b", "c", "e"].indexOf(id));
      const o = k * CELL_FLOATS + 8;
      return { nucleus: buffers.cells.data[o], matte: buffers.cells.data[o + 2], ink: [...buffers.cells.data.subarray(k * CELL_FLOATS + 4, k * CELL_FLOATS + 7)] };
    };
    expect(coreOf("a")).toEqual({ nucleus: Math.fround(TOKENS.nucleusShare), matte: 0, ink: [1, 1, 1] });
    expect(coreOf("b")).toEqual({ nucleus: Math.fround(TOKENS.nucleusShare), matte: 1, ink: [1, Math.fround(0.6), 0] });
    expect(coreOf("e")).toMatchObject({ nucleus: 0, matte: 0 });
  });

  it("puts every connection and its end dot behind all cells, and only a lit glow fades across", () => {
    const buffers = createNeuralGlBuffers();
    const needsA = inputs({ colorFocusedNodeId: "b", focusedNodeId: "b", focusRampById: new Map([["b", 1]]) });
    fillNeuralGlBuffers(buffers, buildNeuralFrame(needsA, CAMERA), INKS);
    const field = (batch: { data: Float32Array; count: number }, stride: number, at: number) =>
      Array.from({ length: batch.count }, (_, k) => batch.data[k * stride + at]);
    const cellDepths = field(buffers.cells, CELL_FLOATS, 3);
    for (const depth of [...field(buffers.restAxons, RIBBON_FLOATS, 10), ...field(buffers.litAxons, RIBBON_FLOATS, 10), ...field(buffers.restDots, SPOT_FLOATS, 3)]) {
      expect(depth).toBe(BEHIND_CELLS);
      expect(depth).toBeGreaterThan(Math.max(...cellDepths));
    }
    expect(field(buffers.restAxons, RIBBON_FLOATS, 11).every((glow) => glow === 0)).toBe(true);
    const litGlows = field(buffers.litAxons, RIBBON_FLOATS, 11);
    expect(litGlows[0], "b's need of a is lit with its glow under it").toBe(1);
    expect(litGlows[1]).toBe(0);
  });

  it("moves only the cells a selection veils out of the cells that hide what lies behind them", () => {
    const buffers = createNeuralGlBuffers();
    fillNeuralGlBuffers(buffers, buildNeuralFrame(inputs(), CAMERA), INKS);
    expect(buffers.veiledCells.count).toBe(0);
    const frame = buildNeuralFrame(selected(), CAMERA);
    fillNeuralGlBuffers(buffers, frame, INKS);
    const veiled = Array.from(frame.drawOrder.subarray(0, frame.drawCount)).filter((i) => frame.cellAlpha[i] < frame.cellRestAlpha[i] * 0.5);
    expect(veiled.length).toBeGreaterThan(0);
    expect(buffers.veiledCells.count).toBe(veiled.length);
    expect(buffers.cells.count + buffers.veiledCells.count).toBe(frame.drawCount);
    expect(buffers.cellCount).toBe(frame.drawCount);
  });

  it("draws one shell per cluster on the frame's shell circle, quieter while a selection veils the cluster", () => {
    const rest = createNeuralGlBuffers();
    const restFrame = buildNeuralFrame(inputs(), CAMERA);
    fillNeuralGlBuffers(rest, restFrame, INKS);
    expect(rest.shells.count).toBe(restFrame.poolCount);
    const { shellX, shellY, shellPx } = restFrame.pools[0];
    expect([...rest.shells.data.subarray(0, 3)]).toEqual([shellX, shellY, shellPx].map(Math.fround));
    const restAlpha = rest.shells.data[SHELL_FLOATS - 1];
    expect(restAlpha).toBeGreaterThan(0);
    expect(restAlpha).toBeLessThanOrEqual(INKS.shellAlpha);
    const lit = createNeuralGlBuffers();
    fillNeuralGlBuffers(lit, buildNeuralFrame(selected(), CAMERA), INKS);
    expect(lit.shells.data[SHELL_FLOATS - 1]).toBeLessThan(restAlpha);
  });
});
