import { describe, expect, it, vi } from "vitest";

/**
 * 앰비언트 휴면의 **배선** 계약 (2026-07-28 카운슬 「작업대」 P0).
 *
 * `ambient-sleep.ts` 단위 테스트는 계수 곡선이 맞는지만 본다. 이 파일이 지키는
 * 것은 그 계수가 **실제로 혜성 속도에 곱해지는가** 다 — 순수 함수가 아무리
 * 옳아도 물리 스텝이 그걸 안 쓰면 유휴 연소는 그대로다.
 *
 * 왜 브라우저가 아니라 여기인가: 실제 수면은 30초 지연 + 2초 램프라, e2e 로
 * 잠들기를 기다리면 CI 가 매번 35초를 낸다. 곱셈 계약은 시간 없이 잴 수 있고,
 * "정말로 리페인트가 멎는가" 는 이미 브라우저 실측으로 확인했다(각성 distinct 4
 * → 잠듦 distinct 1 → 입력 후 distinct 4).
 *
 * `updateParticles` 를 모의해 **어떤 속도로 불렸는지**만 본다 — 위상 전진 자체의
 * 정확성은 `render/edge-fireflies.test.ts` 의 몫이라 여기서 겹치지 않는다.
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

// 이 테스트가 보는 것은 혜성 속도 하나뿐이라, 실 리졸버(전 토큰 존재를 요구하는
// 드리프트 가드)를 태우지 않고 필요한 값만 세운다 — `topology-camera-math.test.ts`
// 가 이미 쓰는 하우스 패턴.
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

/** 모의된 `updateParticles` 가 받은 speedOf 를 실제 엣지에 적용해 속도를 뽑는다. */
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
    stepTopologyPhysics(baseInput()); // 파라미터 생략 = 기존 호출부
    const legacy = capturedSpeed();

    expect(awake).toBeGreaterThan(0);
    expect(legacy).toBe(awake);
  });

  it("잠듦(계수 0)이면 혜성 속도가 0 — 위상이 전진하지 않는다", () => {
    vi.mocked(updateParticles).mockClear();
    stepTopologyPhysics(baseInput({ ambientFactor: 0 }));
    expect(capturedSpeed()).toBe(0);
  });

  // 램프가 없으면 혜성이 궤도 중간에서 **멎는다** — 정지한 입자는 "고장났나"로
  // 읽힌다. 계수가 선형으로 곱해져야 흐르다 서서히 서는 것으로 보인다.
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
