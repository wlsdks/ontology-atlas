import { describe, expect, it } from "vitest";

import { stepTopologyPhysics, type PhysicsStepInput } from "./topology-physics-step";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";

const tokens = {
  edgePulseSpeed: 0.075,
  edgePulseSpeedEgo: 0.16,
  emphasisRiseTau: 0.09,
  emphasisDecayTau: 0.15,
  focusDimTau: 0.16,
  egoRevealRiseTau: 0.22,
  egoRevealDecayTau: 0.12,
  cameraDampingDefault: 1,
  cameraScaleMin: 0.2,
  cameraScaleMax: 4,
  breatheAmplitude: 0.02,
  breatheFreqRad: 1,
  rippleStaggerMs: 30,
  rippleStaggerMaxMs: 300,
  nodeHomeSpringAngFreq: 7.5,
  dragTug1Hop: 0.22,
  dragTug2Hop: 0.07,
  dragTugRadius: 400,
} as unknown as OntologyMapTokens;

type Ramps = Pick<PhysicsStepInput, "emphasisById" | "egoRevealById" | "focusRampById">;

function input(ramps: Ramps, over: Partial<PhysicsStepInput>): PhysicsStepInput {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const world = {
    nodes: [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, kind: "capability", slug: "a" },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0, kind: "capability", slug: "b" },
    ],
    nodeById: new Map(),
    neighborMap: new Map([["a", new Set(["b"])], ["b", new Set(["a"])]]),
    edges: [{ sourceId: "a", targetId: "b", kind: "depends", t: 0 }],
    edgeIndexByNode: new Map([["a", [0]], ["b", [0]]]),
    bounds,
    spineBounds: bounds,
  } as unknown as PhysicsStepInput["world"];
  return {
    world,
    camera: { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } },
    target: { tx: 0, ty: 0, tscale: 1 },
    damping: 1,
    overviewScale: 1,
    tokens,
    cameraAngularFrequency: 10,
    dt: 0.05,
    now: 1000,
    focusedNodeId: null,
    pairFocusActive: false,
    hoveredNodeId: null,
    panelEmphasisNodeId: null,
    isDragging: false,
    reducedMotion: false,
    freezeCamera: false,
    rippleStartById: new Map(),
    appearById: new Map(),
    ...ramps,
    ...over,
  } as PhysicsStepInput;
}

describe("stepTopologyPhysics — the focus ramps' clock", () => {
  it("draws a selection's first frame at the ramps' start, then advances them by each frame's time", () => {
    const ramps: Ramps = { emphasisById: new Map(), egoRevealById: new Map(), focusRampById: new Map() };
    stepTopologyPhysics(input(ramps, { focusedNodeId: "a", dt: 0.05, rampDt: 0 }));
    for (const id of ["a", "b"]) {
      expect(ramps.egoRevealById.get(id)).toBe(0);
      expect(ramps.focusRampById.get(id)).toBe(0);
    }
    stepTopologyPhysics(input(ramps, { focusedNodeId: "a", dt: 0.016, now: 1016 }));
    expect(ramps.egoRevealById.get("b")).toBeCloseTo(1 - Math.exp(-0.016 / 0.22), 6);
    expect(ramps.focusRampById.get("b")).toBeCloseTo(1 - Math.exp(-0.016 / 0.16), 6);
  });
});
