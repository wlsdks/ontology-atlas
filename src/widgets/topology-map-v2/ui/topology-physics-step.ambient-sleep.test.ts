import { describe, expect, it, vi } from "vitest";

/**
 * The **wiring** contract for ambient sleep (council 「작업대」 (workbench) P0,
 * 2026-07-28).
 *
 * `ambient-sleep.ts`'s unit test only checks that the factor curve is right. What
 * this file holds is whether that factor **actually multiplies the comet speed** —
 * however correct the pure function is, if the physics step does not use it the idle
 * burn is unchanged.
 *
 * Why here rather than in a browser: real sleep is a 30s delay plus a 2s ramp, so
 * waiting for it in e2e costs CI 35 seconds every run. The multiplication contract
 * can be measured without time, and "do the repaints really stop" was already
 * confirmed by browser measurement (awake distinct 4 → asleep distinct 1 → after
 * input distinct 4).
 *
 * `updateParticles` is mocked so only **what speed it was called with** is observed —
 * the correctness of the phase advance itself belongs to
 * `render/edge-fireflies.test.ts` and is not duplicated here.
 */
vi.mock("../render/edge-fireflies", async () => {
  const actual = await vi.importActual<typeof import("../render/edge-fireflies")>(
    "../render/edge-fireflies",
  );
  return { ...actual, updateParticles: vi.fn() };
});

import { updateParticles } from "../render/edge-fireflies";
import { stepTopologyPhysics, type PhysicsStepInput } from "./topology-physics-step";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

// All this test looks at is the comet speed, so it stands up only the values it needs
// rather than running the real resolver (the drift guard that demands every token
// exists) — the house pattern `topology-camera-math.test.ts` already uses.
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
} as unknown as TopologyV2Tokens;

function baseInput(overrides: Partial<PhysicsStepInput> = {}): PhysicsStepInput {
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
    camera: { x: { value: 0 }, y: { value: 0 }, scale: { value: 1 } },
    target: { tx: 0, ty: 0, tscale: 1 },
    damping: 1,
    overviewScale: 1,
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
    freezeCamera: false,
    emphasisById: new Map(),
    rippleStartById: new Map(),
    egoRevealById: new Map(),
    focusRampById: new Map(),
    appearById: new Map(),
    ...overrides,
  } as PhysicsStepInput;
}

/** Applies the speedOf the mocked `updateParticles` received to a real edge to extract the speed. */
function capturedSpeed(): number {
  const mock = vi.mocked(updateParticles);
  expect(mock).toHaveBeenCalled();
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  const edges = call[0] as ReadonlyArray<{ sourceId: string; targetId: string; kind: string }>;
  const speedOf = call[3] as (edge: (typeof edges)[number]) => number;
  return speedOf(edges[0]);
}

describe("stepTopologyPhysics — 앰비언트 휴면 배선", () => {
  it("각성(계수 1)이면 종전 속도 그대로 — 보고 있는 사람의 화면은 1픽셀도 안 바뀐다", () => {
    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput({ ambientFactor: 1 }));
    const awake = capturedSpeed();

    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput()); // Parameter omitted = an existing call site.
    const legacy = capturedSpeed();

    expect(awake).toBeGreaterThan(0);
    expect(legacy).toBe(awake);
  });

  it("잠듦(계수 0)이면 혜성 속도가 0 — 위상이 전진하지 않는다", () => {
    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput({ ambientFactor: 0 }));
    expect(capturedSpeed()).toBe(0);
  });

  // Without the ramp the comets **stop dead** mid-orbit, and a frozen particle reads
  // as "is it broken?". The factor has to multiply linearly for them to flow and then
  // gradually come to rest.
  it("램프 중(계수 0<f<1)이면 속도가 비례해 줄어든다", () => {
    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput({ ambientFactor: 1 }));
    const full = capturedSpeed();

    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput({ ambientFactor: 0.5 }));
    const half = capturedSpeed();

    expect(half).toBeCloseTo(full * 0.5, 6);
  });
});
