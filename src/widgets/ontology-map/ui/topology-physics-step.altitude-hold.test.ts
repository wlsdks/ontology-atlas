import { describe, expect, it } from "vitest";

import { stepTopologyPhysics, type PhysicsStepInput } from "./topology-physics-step";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";

const tokens = {
  edgePulseSpeed: 0.075,
  edgePulseSpeedEgo: 0.16,
  emphasisRiseTau: 0.1,
  emphasisDecayTau: 0.2,
  focusDimTau: 0.2,
  egoRevealRiseTau: 0.1,
  egoRevealDecayTau: 0.2,
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
  altitudeFarHighRatio: 0.92,
  altitudeFarLowRatio: 0.62,
  overviewEntryRatio: 1,
} as unknown as OntologyMapTokens;

const FLAT_OVERVIEW = 1.25;
const HELD_SCALE = 0.7;

function flatReturnFrame(overrides: Partial<PhysicsStepInput> = {}): PhysicsStepInput {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const world = {
    nodes: [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, kind: "domain", slug: "a" },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0, kind: "domain", slug: "b" },
    ],
    edges: [{ sourceId: "a", targetId: "b", kind: "depends", t: 0 }],
    bounds,
    spineBounds: bounds,
  } as unknown as PhysicsStepInput["world"];
  return {
    world,
    camera: { x: { value: 0 }, y: { value: 0 }, scale: { value: HELD_SCALE } },
    target: { tx: 0, ty: 0, tscale: FLAT_OVERVIEW },
    damping: 1,
    overviewScale: FLAT_OVERVIEW,
    tokens,
    cameraAngularFrequency: 10,
    dt: 1 / 60,
    now: 1000,
    focusedNodeId: null,
    pairFocusActive: false,
    hoveredNodeId: null,
    panelEmphasisNodeId: null,
    isDragging: false,
    reducedMotion: false,
    freezeCamera: true,
    emphasisById: new Map(),
    rippleStartById: new Map(),
    egoRevealById: new Map(),
    focusRampById: new Map(),
    appearById: new Map(),
    ...overrides,
  } as PhysicsStepInput;
}

describe("stepTopologyPhysics altitude during a view-return tween", () => {
  it("reads the altitude from the camera when nothing holds it", () => {
    expect(stepTopologyPhysics(flatReturnFrame()).farT).toBeCloseTo(1, 5);
  });

  it("keeps the destination's altitude while the camera travels from another view's frame", () => {
    const held = stepTopologyPhysics(flatReturnFrame({ altitudeScale: FLAT_OVERVIEW }));
    expect(held.farT).toBe(0);
    expect(held.camera.scale.value).toBeCloseTo(HELD_SCALE, 5);
  });
});

describe("stepTopologyPhysics with a frozen camera under reduced motion", () => {
  it("keeps a hand-driven zoom step's eased camera", () => {
    const frame = stepTopologyPhysics(flatReturnFrame({ reducedMotion: true, userDrivenCamera: true }));
    expect(frame.camera.scale.value).toBeCloseTo(HELD_SCALE, 9);
  });

  it("lands app-initiated travel at its target", () => {
    const frame = stepTopologyPhysics(
      flatReturnFrame({
        reducedMotion: true,
        userDrivenCamera: false,
        tokens: { ...tokens, cameraMaxZoomRatio: 8, cameraMinZoomRatio: 0.1 },
      }),
    );
    expect(frame.camera.scale.value).toBeCloseTo(FLAT_OVERVIEW, 9);
    expect(frame.camera.scale.velocity).toBe(0);
  });
});
