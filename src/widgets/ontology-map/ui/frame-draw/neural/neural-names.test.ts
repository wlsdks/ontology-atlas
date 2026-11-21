import { describe, expect, it, vi } from "vitest";
import type { DomeNodeFrame } from "../../../model/dome-view/runtime";
import type { NeuralTokens } from "../../../tokens/read-neural-tokens";
import type { TopologyWorld, WorldNode } from "../../world/topology-world";
import type { FrameInputs } from "../frame-begin";
import { buildNeuralFrame, type NeuralFrameInputs } from "./neural-frame";
import { paintNeuralNames } from "./neural-names";

const TOKENS = vi.hoisted((): NeuralTokens => ({
  capPx: 6, capGainPx: 1, elementPx: 3, elementGainPx: 0.5, domainPx: 10, projectPx: 12,
  nucleusShare: 0.4, nucleusAlpha: 0.8, ringGapPx: 2, ringPx: 1, glowReach: 3, glowAlpha: 0.3, farAlpha: 0.4,
  clusterGlowAlpha: 0.2, clusterGlowPadPx: 20, axonAlpha: 0.3, tractAlpha: 0.2, axonCapPx: 1.5, axonElementPx: 1,
  axonEndPx: 0.5, axonDotPx: 1, axonBow: 0.2, tractPull: 0.3, tractGain: 1, veil: 0.2, axonVeil: 0.1, titleVeil: 0.3,
  zoomGrowMax: 2, titlePinPx: 40, litStartPx: 2, litEndPx: 1, litAlpha: 0.9, litGlowPx: 4, litDotPx: 2,
  signalPx: 2, signalGlowPx: 8, focusRingGapPx: 3, focusRingPx: 1.5, domainNamePx: 14, domainMetaPx: 11,
  domainNameGapPx: 4, domainMetaGapPx: 6, namePx: 12, nameGapPx: 8, nameHaloPx: 3, nameBudget: 20, platePadPx: 8,
  plateRadiusPx: 6, impactNear: 0.9, impactMid: 0.6, impactFar: 0.35, signalMs: 400, spreadMs: 1200,
  inks: { strong: "#fff", name: "#ccc", arc: "#88f", reach: "#f8a", project: "#99f", warning: "#fa0", ground: "#000", halo: "#000", plate: "#111" },
}));
vi.mock("../../../tokens/read-neural-tokens", () => ({ readNeuralTokens: () => TOKENS }));

const CHAR_PX = 7;

function node(id: string, kind: WorldNode["kind"], parentId: string | null, x: number, y: number): WorldNode {
  return { id, kind, label: `${id}-name`, x, y, homeX: x, homeY: y, parentId, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1 };
}

/** One domain and three capabilities in a row, the last at screen x 560 of an 800 px canvas. */
function inputs(): NeuralFrameInputs {
  const nodes = [
    node("domain", "domain", null, 0, -200),
    node("a", "capability", "domain", -160, 0),
    node("b", "capability", "domain", 0, 0),
    node("c", "capability", "domain", 160, 0),
  ];
  const world = { nodes, edges: [], nodeById: new Map(nodes.map((n) => [n.id, n])) } as unknown as TopologyWorld;
  const domeFrame = new Map<string, DomeNodeFrame>(nodes.map((n) => [n.id, { dx: 0, dy: 0, s: 1, a: 1, u: 0.5 }]));
  const frames = nodes.map((n) => domeFrame.get(n.id)!);
  return {
    world, domeFrame, viewportWidth: 800, viewportHeight: 600, hoveredNodeId: null, colorFocusedNodeId: null, focusedNodeId: null,
    emphasisById: new Map(), focusRampById: new Map(), reducedMotion: true, now: 1_000, domeLight: null, neural: 1,
    nodeFrameAt: (i: number) => frames[i], tokens: { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as NeuralFrameInputs["tokens"],
    domeFitScale: null, hoveredEdge: null, selectedEdge: null, mapLensKind: "all", pathEdgeIds: null,
  };
}

/** Where each name was written: its anchor x and alignment. */
function namesWritten(rightPanelPx: number) {
  const written = new Map<string, { x: number; align: CanvasTextAlign }>();
  const ctx = { textAlign: "left" as CanvasTextAlign, font: "", measureText: (text: string) => ({ width: text.length * CHAR_PX }) } as Record<string, unknown>;
  ctx.fillText = (text: string, x: number) => written.set(text, { x, align: ctx.textAlign as CanvasTextAlign });
  const painter = new Proxy(ctx, { get: (target, key) => (key in target ? target[key as string] : () => undefined) });
  const input = inputs();
  const nf = buildNeuralFrame(input, { camX: 0, camY: 0, camScale: 1, halfW: 400, halfH: 300 });
  const frame = { ...input, panelInsets: { left: 0, right: rightPanelPx, nameObstacles: [] } } as unknown as FrameInputs;
  paintNeuralNames(painter as unknown as CanvasRenderingContext2D, frame, nf, null);
  return written;
}

describe("Neural names beside a panel", () => {
  it("sets a name that would run under the right panel on its cell's left, and keeps it right when it fits", () => {
    const open = namesWritten(800 - 580);
    const closed = namesWritten(0);
    expect(closed.get("c-name")).toMatchObject({ align: "left" });
    expect(closed.get("c-name")!.x).toBeGreaterThan(560);
    expect(open.get("c-name")).toMatchObject({ align: "right" });
    expect(open.get("c-name")!.x).toBeLessThan(560);
  });
});
