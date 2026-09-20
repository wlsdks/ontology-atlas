import { describe, expect, it, vi } from "vitest";

vi.mock("../render/edge-fireflies", async () => {
  const actual = await vi.importActual<typeof import("../render/edge-fireflies")>("../render/edge-fireflies");
  return { ...actual, updateParticles: vi.fn() };
});

import { stepTopologyPhysics, type PhysicsStepInput } from "./topology-physics-step";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";

/**
 * The focused camera's leash is a box the physics pulls the camera back into.
 * It used to be the token alone (180 world units): a wide ego graph could not
 * be centred beside an open panel, and the focus target and the physics
 * disagreed about where the camera may rest. The screen-sized leash from
 * `focusLeashPx` widens the box; the token stays its floor.
 */
const tokens = {
  edgePulseSpeed: 0,
  edgePulseSpeedEgo: 0,
  emphasisRiseTau: 0.1,
  emphasisDecayTau: 0.2,
  focusDimTau: 0.2,
  egoRevealRiseTau: 0.1,
  egoRevealDecayTau: 0.2,
  cameraDampingDefault: 1,
  cameraScaleMin: 0.2,
  cameraScaleMax: 4,
  cameraFocusPanMargin: 180,
  overviewEntryRatio: 0.95,
  breatheAmplitude: 0,
  breatheFreqRad: 1,
  rippleStaggerMs: 30,
  rippleStaggerMaxMs: 300,
  nodeHomeSpringAngFreq: 7.5,
  dragTug1Hop: 0.22,
  dragTug2Hop: 0.07,
  dragTugRadius: 400,
} as unknown as OntologyMapTokens;

function input(cameraX: number, overrides: Partial<PhysicsStepInput> = {}): PhysicsStepInput {
  const bounds = { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 };
  const nodeById = new Map([["f", { id: "f", x: 0, y: 0, vx: 0, vy: 0, kind: "capability", slug: "f" }]]);
  const world = {
    nodes: [...nodeById.values()],
    nodeById,
    edges: [],
    edgeIndexByNode: new Map(),
    neighborMap: new Map([["f", new Set<string>()]]),
    childrenByParent: new Map(),
    clusterMetaByParent: new Map(),
    brightStarIds: new Set(),
    bounds,
    spineBounds: bounds,
  } as unknown as PhysicsStepInput["world"];
  return {
    world,
    // Zoomed in past the overview scale, so the focus leash applies.
    camera: { x: { value: cameraX, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } },
    target: { tx: cameraX, ty: 0, tscale: 1 },
    damping: 1,
    overviewScale: 0.5,
    tokens,
    cameraAngularFrequency: 10,
    dt: 1 / 60,
    now: 1000,
    focusedNodeId: "f",
    pairFocusActive: false,
    hoveredNodeId: null,
    panelEmphasisNodeId: null,
    isDragging: false,
    reducedMotion: false,
    freezeCamera: false,
    ambientFactor: 1,
    emphasisById: new Map(),
    rippleStartById: new Map(),
    egoRevealById: new Map(),
    focusRampById: new Map(),
    appearById: new Map(),
    ...overrides,
  } as PhysicsStepInput;
}

describe("stepTopologyPhysics — the focus leash is sized to the screen", () => {
  it("without a screen leash the token alone holds: 400 units out is pulled back", () => {
    const { camera } = stepTopologyPhysics(input(400));
    expect(camera.x.value).toBeLessThan(400);
  });

  it("with a 412 px leash at scale 1, 400 units out is inside the box and stays", () => {
    const { camera } = stepTopologyPhysics(input(400, { focusLeashPx: { x: 412, y: 283 } }));
    expect(camera.x.value).toBeCloseTo(400, 6);
  });

  it("the same leash on the other axis is its own number: 400 units up is pulled back", () => {
    const base = input(0, { focusLeashPx: { x: 412, y: 283 } });
    const { camera } = stepTopologyPhysics({
      ...base,
      camera: { x: { value: 0, velocity: 0 }, y: { value: 400, velocity: 0 }, scale: { value: 1, velocity: 0 } },
      target: { tx: 0, ty: 400, tscale: 1 },
    });
    expect(camera.y.value).toBeLessThan(400);
  });

  it("the leash follows the live scale: at 2× the same 412 px is 206 units, so 400 out is pulled back", () => {
    const base = input(400, { focusLeashPx: { x: 412, y: 283 } });
    const { camera } = stepTopologyPhysics({
      ...base,
      camera: { x: { value: 400, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 2, velocity: 0 } },
      target: { tx: 400, ty: 0, tscale: 2 },
    });
    expect(camera.x.value).toBeLessThan(400);
  });
});
