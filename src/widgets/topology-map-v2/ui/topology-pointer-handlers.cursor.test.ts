import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * The cursor affordance contract — **each surface shows its own primary action**
 * (design council 「상호작용」 (interaction) prescription plus a measured correction,
 * 2026-07-28).
 *
 * ## Why this contract was needed
 *
 * Measured (1512×950, grid hit test): the background hover cursor was `auto`. This
 * canvas's primary action is **panning**, and the screen never once said "you can
 * push this". Meanwhile `grab` appeared only over nodes, where the primary action is
 * a click — Norman's signifier, with each surface carrying a signal that was not its
 * own.
 *
 * (The council called this an "inversion", which is only half right. A node's `grab`
 * was not a lie — a node really does pin-drag. The defect was **the background's
 * silence**, so the prescription is not "take grab away from nodes" but "give each
 * surface its primary action". Node dragging still works and still answers with
 * `grabbing`.)
 *
 * ## The layer jsdom can measure
 *
 * This file looks only at **what the handler writes the cursor to**. The real cascade
 * (whether the class restores `grab` where the inline style was cleared) needs layout
 * and was measured in a browser — background `grab` · node `pointer` · `grabbing`
 * while pushing · `grab` after release, 4/4.
 *
 * One trap caught by that measurement survives here as a regression: the restore on
 * release ran **only in the node-drag branch**, so pushing the background and letting
 * go left the cursor as `grabbing` (released, while the screen still said it was held).
 */
// Wrapped **only to count** the function called once per edge while building
// candidates — the behaviour is left as the real implementation (feeding it fake
// values would make the hit test a lie).
vi.mock("./topology-camera-math", async () => {
  const actual = await vi.importActual<typeof import("./topology-camera-math")>(
    "./topology-camera-math",
  );
  return { ...actual, worldToScreen: vi.fn(actual.worldToScreen) };
});

vi.mock("./topology-read-tokens", () => ({
  readTopologyV2TokensOrNull: vi.fn(() => ({
    hysteresisPx: 7,
    overviewEntryRatio: 0.95,
    cameraMaxZoomRatio: 2,
    cameraScaleMax: 2.6,
    cameraMinZoomRatio: 0.5,
    cameraScaleMin: 0.24,
    cameraDampingDefault: 1,
    cameraDampingFlick: 0.82,
    cameraSpringAngFreqInteractive: 10,
    cameraReleaseVelocityWindowMs: 80,
    cameraFlickMinSpeed: 40,
    cameraMomentumDecay: 0.95,
    nodeReleaseSettleMs: 900,
  })),
}));

import { worldToScreen } from "./topology-camera-math";
import { createTopologyPointerHandlers, type PointerHandlerRefs } from "./topology-pointer-handlers";

function ref<T>(current: T): { current: T } {
  return { current };
}

function buildRefs(overrides: Partial<PointerHandlerRefs> = {}): PointerHandlerRefs {
  return {
    worldRef: ref({
      nodes: [],
      neighborMap: new Map(),
      nodeById: new Map(),
      bounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
      spineBounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
    } as unknown as PointerHandlerRefs["worldRef"]["current"]),
    cameraRef: ref({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } }),
    cameraTargetRef: ref({ tx: 0, ty: 0, tscale: 1 }),
    dampingRef: ref(1),
    cameraAngularFreqRef: ref(null),
    viewportRef: ref({ width: 800, height: 600, dpr: 1 }),
    pointerMachineRef: ref({ phase: "idle" } as unknown as PointerHandlerRefs["pointerMachineRef"]["current"]),
    dragHistoryRef: ref([]),
    camStartAtDownRef: ref({ x: 0, y: 0 }),
    canvasRectRef: ref({ left: 0, top: 0 }),
    focusedSlugRef: ref(null),
    hoveredNodeIdRef: ref(null),
    rippleStartRef: ref(new Map()),
    reducedMotionRef: ref(false),
    simRef: ref(null),
    heatRef: ref(0),
    nodeDragRef: ref(null),
    dragAffectedSetRef: ref(null),
    dragStartPosRef: ref(null),
    overviewScaleRef: ref(1),
    ...overrides,
  };
}

/** The restore on release happens through `canvasRef`, so the test supplies the same canvas. */
function refsWithCanvas(canvas: ReturnType<typeof fakeCanvas>): PointerHandlerRefs {
  return buildRefs({
    canvasRef: ref(canvas) as unknown as PointerHandlerRefs["canvasRef"],
  });
}

/** A fake canvas whose cursor writes can be observed. */
function fakeCanvas() {
  return {
    style: { cursor: "" },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

function pointerEvent(
  canvas: ReturnType<typeof fakeCanvas>,
  x: number,
  y: number,
): ReactPointerEvent<HTMLCanvasElement> {
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: canvas,
  } as unknown as ReactPointerEvent<HTMLCanvasElement>;
}

describe("커서 어포던스 — 각 표면이 자기 1차 행동을 보여준다", () => {
  // A world with no nodes at all, so every hover is background.
  it("빈 배경 호버는 `grab` — 이 캔버스의 1차 행동은 팬이다", () => {
    const refs = buildRefs();
    const canvas = fakeCanvas();
    const { handlePointerMove } = createTopologyPointerHandlers(refs);

    handlePointerMove(pointerEvent(canvas, 400, 300));

    expect(canvas.style.cursor).toBe("grab");
  });

  it("배경을 미는 동안은 `grabbing`", () => {
    const refs = buildRefs();
    const canvas = fakeCanvas();
    const { handlePointerDown, handlePointerMove } = createTopologyPointerHandlers(refs);

    handlePointerDown(pointerEvent(canvas, 400, 300));
    // Cross the hysteresis (7px) to transition into a drag.
    handlePointerMove(pointerEvent(canvas, 460, 340));

    expect(canvas.style.cursor).toBe("grabbing");
  });

  /**
   * This check is the exact reproduction of the defect — the old restore lived **only
   * inside the node-drag branch**, so pushing the background and then letting go left
   * `grabbing` behind while the mouse sat still. Clearing the inline style lets the
   * canvas class (`cursor-grab`) restore it.
   */
  it("놓으면 쥔 모양을 놓는다 — 인라인 커서가 비워진다", () => {
    const canvas = fakeCanvas();
    const refs = refsWithCanvas(canvas);
    const { handlePointerDown, handlePointerMove, handlePointerUp } =
      createTopologyPointerHandlers(refs);

    handlePointerDown(pointerEvent(canvas, 400, 300));
    handlePointerMove(pointerEvent(canvas, 460, 340));
    expect(canvas.style.cursor).toBe("grabbing");

    handlePointerUp(pointerEvent(canvas, 460, 340));

    expect(canvas.style.cursor).toBe("");
  });
});

/**
 * **Edge candidates are not built twice for the same input** (code review
 * prescription, 2026-07-28).
 *
 * `buildEdgeCandidates` filters every node, projects every edge and allocates whole
 * arrays. And its call site is **every `pointermove` that missed a node**, so simply
 * moving the mouse over the background walked the entire graph every frame. The
 * 97-node dogfood does not show it, but this engine is designed for 2–3k nodes.
 *
 * The gate is pinned on **a count, not milliseconds** — a performance budget differs
 * per machine, but "zero recomputations while the camera is still" is true on any
 * machine (`architecture.md` 「게이트는 ms 가 아니라 횟수로 잠근다」 — a gate is
 * locked on counts, not milliseconds).
 *
 * What is counted is `worldToScreen`: it is called three times per edge while
 * building one set of candidates, so zero calls means no candidates were built.
 */
describe("엣지 후보 캐시 — 정지한 카메라에서 재계산 0회", () => {
  function worldWithEdges(): PointerHandlerRefs["worldRef"]["current"] {
    const nodes = [
      { id: "a", slug: "a", kind: "domain", x: 0, y: 0, magnitudeScale: 1 },
      { id: "b", slug: "b", kind: "domain", x: 100, y: 0, magnitudeScale: 1 },
    ];
    return {
      nodes,
      nodeById: new Map(nodes.map((n) => [n.id, n])),
      neighborMap: new Map(),
      edges: [{ sourceId: "a", targetId: "b", ax: 0, ay: 0, bx: 100, by: 0, relationType: "depends_on" }],
      bounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
      spineBounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
    } as unknown as PointerHandlerRefs["worldRef"]["current"];
  }

  it("배경 위 반복 이동은 첫 프레임만 후보를 만든다", () => {
    const canvas = fakeCanvas();
    const refs = buildRefs({
      worldRef: ref(worldWithEdges()),
      canvasRef: ref(canvas) as unknown as PointerHandlerRefs["canvasRef"],
      hoveredEdgeRef: ref(null),
    });
    const { handlePointerMove } = createTopologyPointerHandlers({
      ...refs,
      onHoverEdge: () => {},
    } as unknown as Parameters<typeof createTopologyPointerHandlers>[0]);

    // Move several times with the same camera — only the coordinates differ, the candidate list is identical.
    for (let i = 0; i < 5; i += 1) {
      handlePointerMove(pointerEvent(canvas, 400 + i, 300 + i));
    }

    const firstPass = vi.mocked(worldToScreen).mock.calls.length;
    // If this path never runs at all, the comparison below is vacuously true.
    expect(firstPass, "후보를 한 번도 안 만들었다 — 이 테스트는 아무것도 안 지킨다").toBeGreaterThan(0);
    handlePointerMove(pointerEvent(canvas, 410, 310));
    expect(
      vi.mocked(worldToScreen).mock.calls.length,
      "카메라가 그대로인데 후보를 다시 만들었다",
    ).toBe(firstPass);
  });
});
