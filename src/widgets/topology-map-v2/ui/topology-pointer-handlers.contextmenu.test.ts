import { describe, expect, it, vi } from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";

// `handleContextMenu` only needs `hitTestWorld`'s RESULT (a node id or null) —
// stubbing it directly keeps this test independent of a real world/tokens
// fixture (tier-visibility, camera math, etc. are exercised by their own
// dedicated unit tests). Other named exports from the same module are kept
// real via `importActual` since the module import itself requires them to
// exist (other handlers in the same file call them).
vi.mock("./topology-camera-math", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./topology-camera-math")>();
  return { ...actual, hitTestWorld: vi.fn() };
});
vi.mock("./topology-read-tokens", () => ({
  readTopologyV2TokensOrNull: vi.fn(() => ({}) as unknown),
}));

import { hitTestWorld } from "./topology-camera-math";
import { createTopologyPointerHandlers, type PointerHandlerRefs } from "./topology-pointer-handlers";

function ref<T>(current: T): { current: T } {
  return { current };
}

function buildRefs(overrides: Partial<PointerHandlerRefs> = {}): PointerHandlerRefs {
  return {
    worldRef: ref({ nodes: [], neighborMap: new Map() } as unknown as PointerHandlerRefs["worldRef"]["current"]),
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

function fakeContextMenuEvent(clientX: number, clientY: number) {
  return {
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as unknown as ReactMouseEvent<HTMLCanvasElement>;
}

describe("createTopologyPointerHandlers — handleContextMenu (W2-B)", () => {
  it("prevents the default browser menu and reports the hit node + cursor position", () => {
    vi.mocked(hitTestWorld).mockReturnValue("capabilities/mcp-server");
    const onContextMenuNode = vi.fn();
    const { handleContextMenu } = createTopologyPointerHandlers(
      buildRefs({ onContextMenuNode }),
    );

    const event = fakeContextMenuEvent(120, 240);
    handleContextMenu(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onContextMenuNode).toHaveBeenCalledWith("capabilities/mcp-server", {
      x: 120,
      y: 240,
    });
  });

  it("leaves the browser default menu alone when the right-click misses every node", () => {
    vi.mocked(hitTestWorld).mockReturnValue(null);
    const onContextMenuNode = vi.fn();
    const { handleContextMenu } = createTopologyPointerHandlers(
      buildRefs({ onContextMenuNode }),
    );

    const event = fakeContextMenuEvent(10, 10);
    handleContextMenu(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onContextMenuNode).not.toHaveBeenCalled();
  });

  it("is a no-op when no onContextMenuNode callback is wired", () => {
    vi.mocked(hitTestWorld).mockReturnValue("capabilities/mcp-server");
    const { handleContextMenu } = createTopologyPointerHandlers(buildRefs());

    const event = fakeContextMenuEvent(120, 240);
    expect(() => handleContextMenu(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("createTopologyPointerHandlers — 빈 캔버스 우클릭 (2026-08-03)", () => {
  /*
   * Removing the top "+ Concept" chrome pill made this position **the only
   * door for creating a node on a populated map**, because the empty map's two entry
   * points (the start checklist and the empty state) disappear the moment the map
   * fills. If this wiring breaks, nothing can be created from the map in a vault that
   * already has nodes.
   */
  it("빈 자리에서는 만들기를 부르고 브라우저 기본 메뉴를 막는다", () => {
    vi.mocked(hitTestWorld).mockReturnValue(null);
    const onContextMenuPane = vi.fn();
    const { handleContextMenu } = createTopologyPointerHandlers(
      buildRefs({ onContextMenuPane }),
    );

    const event = fakeContextMenuEvent(300, 420);
    handleContextMenu(event);

    expect(onContextMenuPane).toHaveBeenCalledWith({ x: 300, y: 420 });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("노드를 맞히면 빈 자리 콜백은 안 부른다 — 두 자리가 섞이면 안 된다", () => {
    vi.mocked(hitTestWorld).mockReturnValue("capabilities/mcp-server");
    const onContextMenuNode = vi.fn();
    const onContextMenuPane = vi.fn();
    const { handleContextMenu } = createTopologyPointerHandlers(
      buildRefs({ onContextMenuNode, onContextMenuPane }),
    );

    handleContextMenu(fakeContextMenuEvent(10, 20));

    expect(onContextMenuNode).toHaveBeenCalledTimes(1);
    expect(onContextMenuPane).not.toHaveBeenCalled();
  });

  it("소비처가 없으면 종전대로 no-op — 브라우저 기본 메뉴가 살아 있다", () => {
    vi.mocked(hitTestWorld).mockReturnValue(null);
    const { handleContextMenu } = createTopologyPointerHandlers(buildRefs({}));
    const event = fakeContextMenuEvent(10, 20);
    handleContextMenu(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
