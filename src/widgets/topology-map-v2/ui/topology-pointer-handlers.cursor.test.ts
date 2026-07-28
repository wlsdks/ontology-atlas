import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 커서 어포던스 계약 — **각 표면은 자기 1차 행동을 보여준다**
 * (2026-07-28 디자인 카운슬 「상호작용」 처방 + 실측 정정).
 *
 * ## 왜 이 계약이 필요했나
 *
 * 실측(1512×950, 격자 히트테스트): 배경 호버 커서가 `auto` 였다. 이 캔버스의
 * 1차 행동은 **팬**인데, "밀 수 있다" 를 화면이 한 번도 말하지 않았다. 정작
 * 클릭이 1차인 노드 위에서만 `grab`(집으라)이 떴다 — Norman 의 signifier 가
 * 표면마다 자기 것이 아닌 신호를 들고 있었다.
 *
 * (카운슬은 이걸 "역전" 이라 불렀지만 절반만 맞다. 노드의 `grab` 은 거짓이
 * 아니었다 — 노드는 진짜로 pin-drag 된다. 결함은 **배경이 침묵한 것**이고,
 * 그래서 처방은 "노드에서 grab 을 빼앗기" 가 아니라 "각 표면에 1차 행동을
 * 주기" 다. 노드 드래그는 계속 되고 `grabbing` 으로 응답한다.)
 *
 * ## jsdom 이 잴 수 있는 층
 *
 * 이 파일은 **핸들러가 커서를 무엇으로 쓰는가** 만 본다. 실제 캐스케이드
 * (인라인이 걷힌 자리에서 클래스가 `grab` 을 되돌려 주는지)는 레이아웃이
 * 필요해 브라우저에서 실측했다 — 배경 `grab` · 노드 `pointer` · 미는 중
 * `grabbing` · 놓은 뒤 `grab` 4/4.
 *
 * 그 실측에서 잡힌 함정 하나가 여기 회귀로 남는다: 놓은 뒤 복원이 **노드
 * 드래그 분기에서만** 돌아서, 배경을 밀고 놓으면 커서가 `grabbing` 인 채
 * 남았다(놓았는데 화면은 아직 쥐고 있다고 말한다).
 */
// 후보를 만들 때 엣지마다 불리는 함수를 **세기 위해서만** 감싼다 —
// 동작은 실제 구현 그대로 둔다(가짜 값을 넣으면 히트테스트가 거짓이 된다).
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

/** 놓을 때의 복원은 `canvasRef` 를 통해 일어난다 — 테스트도 같은 캔버스를 준다. */
function refsWithCanvas(canvas: ReturnType<typeof fakeCanvas>): PointerHandlerRefs {
  return buildRefs({
    canvasRef: ref(canvas) as unknown as PointerHandlerRefs["canvasRef"],
  });
}

/** 커서 쓰기를 관측할 수 있는 가짜 캔버스. */
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
  // 노드가 하나도 없는 월드라 모든 호버는 배경이다.
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
    // 히스테리시스(7px)를 넘겨 드래그로 전이시킨다.
    handlePointerMove(pointerEvent(canvas, 460, 340));

    expect(canvas.style.cursor).toBe("grabbing");
  });

  /**
   * 이 검사가 결함의 정확한 재현이다 — 종전 복원은 **노드 드래그 분기 안에만**
   * 있어서, 배경을 밀고 놓은 뒤 마우스를 그대로 두면 `grabbing` 이 남았다.
   * 인라인을 비우면 캔버스 클래스(`cursor-grab`)가 되돌려 준다.
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
 * 엣지 후보를 **같은 입력에 두 번 만들지 않는다** (2026-07-28 코드 리뷰 처방).
 *
 * `buildEdgeCandidates` 는 노드 전량 필터 + 엣지 전량 투영 + 배열 전량 할당을
 * 한다. 그런데 호출 지점이 **노드에 안 걸린 모든 `pointermove`** 라, 배경 위에서
 * 마우스를 움직이는 것만으로 프레임마다 그래프 전체를 훑었다. 97노드 도그푸드
 * 에선 안 보이지만 이 엔진의 설계 목표는 2~3k 노드다.
 *
 * 게이트는 **ms 가 아니라 횟수**로 잠근다 — 성능 예산은 기계마다 다르지만
 * "카메라가 안 움직이면 재계산 0회" 는 어느 기계에서나 참이다
 * (`architecture.md` 「게이트는 ms 가 아니라 횟수로 잠근다」).
 *
 * 세는 대상은 `worldToScreen` 이다 — 후보 한 벌을 만들 때 엣지마다 세 번
 * 불리므로, 이 호출이 0 이면 후보를 안 만든 것이다.
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

    // 같은 카메라로 여러 번 움직인다 — 좌표만 다르고 후보 목록은 동일하다.
    for (let i = 0; i < 5; i += 1) {
      handlePointerMove(pointerEvent(canvas, 400 + i, 300 + i));
    }

    const firstPass = vi.mocked(worldToScreen).mock.calls.length;
    // 이 경로가 아예 안 돌면 아래 비교가 공허하게 참이 된다.
    expect(firstPass, "후보를 한 번도 안 만들었다 — 이 테스트는 아무것도 안 지킨다").toBeGreaterThan(0);
    handlePointerMove(pointerEvent(canvas, 410, 310));
    expect(
      vi.mocked(worldToScreen).mock.calls.length,
      "카메라가 그대로인데 후보를 다시 만들었다",
    ).toBe(firstPass);
  });
});
