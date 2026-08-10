import { describe, expect, it } from "vitest";
import {
  cameraCenteringNode,
  computeFreeArea,
  freeAreaOffset,
  SIDE_PANEL_HEIGHT_RATIO,
  type Rect,
} from "./free-area";

/** 실측 기하 (1512×982, 2026-08-10) — 이 숫자가 이 모듈이 생긴 이유다. */
const CANVAS: Rect = { x: 64, y: 0, width: 1448, height: 982 };
const RIGHT_POPOVER: Rect = { x: 1128, y: 32, width: 352, height: 813 };

describe("computeFreeArea", () => {
  it("덮는 것이 없으면 캔버스 그대로다", () => {
    expect(computeFreeArea(CANVAS, [])).toEqual(CANVAS);
  });

  it("오른쪽 팝오버를 뺀다 — 실측 기하", () => {
    const free = computeFreeArea(CANVAS, [RIGHT_POPOVER]);
    expect(free.x).toBe(64);
    expect(free.width).toBe(1128 - 64);
    // 세로 패널은 높이를 건드리지 않는다.
    expect(free.height).toBe(982);
  });

  it("왼쪽 패널은 왼쪽에서 뺀다", () => {
    const left: Rect = { x: 64, y: 0, width: 320, height: 900 };
    const free = computeFreeArea(CANVAS, [left]);
    expect(free.x).toBe(384);
    expect(free.width).toBe(1512 - 384);
  });

  it("양쪽 패널을 둘 다 뺀다", () => {
    const left: Rect = { x: 64, y: 0, width: 320, height: 900 };
    const free = computeFreeArea(CANVAS, [left, RIGHT_POPOVER]);
    expect(free.x).toBe(384);
    expect(free.width).toBe(1128 - 384);
  });

  it("상단 바는 위에서 뺀다", () => {
    const bar: Rect = { x: 64, y: 0, width: 1448, height: 96 };
    const free = computeFreeArea(CANVAS, [bar]);
    expect(free.y).toBe(96);
    expect(free.height).toBe(982 - 96);
    expect(free.width).toBe(1448);
  });

  /**
   * 화면을 통째로 덮는 것(막·스크림)은 빼지 않는다. 빼면 남는 영역이 없어지고,
   * 그때 「가운데」는 정의되지 않는다 — 막이 떠 있으면 카메라를 옮길 상황도 아니다.
   */
  it("전체를 덮는 막은 빼지 않는다", () => {
    const scrim: Rect = { x: 64, y: 0, width: 1448, height: 982 };
    expect(computeFreeArea(CANVAS, [scrim])).toEqual(CANVAS);
  });

  it("작은 섬(칩·툴팁)은 빼지 않는다", () => {
    const chip: Rect = { x: 600, y: 400, width: 120, height: 40 };
    expect(computeFreeArea(CANVAS, [chip])).toEqual(CANVAS);
  });

  it("캔버스와 안 겹치는 것은 세지 않는다", () => {
    const elsewhere: Rect = { x: 2000, y: 0, width: 300, height: 900 };
    expect(computeFreeArea(CANVAS, [elsewhere])).toEqual(CANVAS);
  });

  /**
   * 두 세로 패널이 서로를 넘어 영역이 뒤집히는 경우.
   *
   * ⚠️ 폭을 넉넉히 잡으면 안 된다 — 캔버스 폭의 60% 를 넘는 순간 그 사각형은
   * 「세로 패널이면서 가로 바」가 되어 **아예 빼지 않는다**(모듈의 규칙). 처음 이
   * 케이스를 w900(=0.62)으로 썼다가 그 규칙에 걸렸고, 코드가 아니라 케이스가
   * 틀린 것이었다.
   */
  it("두 세로 패널이 겹쳐 영역이 뒤집히면 캔버스로 물러난다", () => {
    const left: Rect = { x: 64, y: 0, width: 700, height: 900 };
    const rightPanel: Rect = { x: 600, y: 0, width: 500, height: 900 };
    expect(computeFreeArea(CANVAS, [left, rightPanel])).toEqual(CANVAS);
  });

  it("세로 패널 판정 비율이 실측 두 무리를 가른다", () => {
    // 팝오버 813/982 = 0.83 → 세로 패널 · 상단 도구 ~96/982 = 0.10 → 아니다
    expect(RIGHT_POPOVER.height / CANVAS.height).toBeGreaterThan(SIDE_PANEL_HEIGHT_RATIO);
    expect(96 / CANVAS.height).toBeLessThan(SIDE_PANEL_HEIGHT_RATIO);
  });
});

describe("freeAreaOffset", () => {
  it("덮는 것이 없으면 0이다 — 지금 동작을 바꾸지 않는다", () => {
    expect(freeAreaOffset(CANVAS, [])).toEqual({ dx: 0, dy: 0 });
  });

  it("오른쪽 팝오버가 있으면 왼쪽으로 밀린다 (실측 −192)", () => {
    const { dx, dy } = freeAreaOffset(CANVAS, [RIGHT_POPOVER]);
    expect(Math.round(dx)).toBe(-192);
    expect(dy).toBe(0);
  });
});

describe("cameraCenteringNode", () => {
  it("오프셋이 0이면 노드를 그대로 가운데 둔다", () => {
    expect(cameraCenteringNode({ x: 500, y: 300 }, { dx: 0, dy: 0 }, 1)).toEqual({ tx: 500, ty: 300 });
  });

  /**
   * **배율로 나눈다** — 같은 화면 오프셋이 배율이 클수록 더 짧은 월드 거리다.
   * 이걸 빼먹으면 확대했을 때 노드가 패널 쪽으로 다시 밀려 들어간다.
   */
  it("같은 화면 오프셋이 배율에 따라 다른 월드 거리다", () => {
    const at1 = cameraCenteringNode({ x: 0, y: 0 }, { dx: -192, dy: 0 }, 1);
    const at2 = cameraCenteringNode({ x: 0, y: 0 }, { dx: -192, dy: 0 }, 2);
    expect(at1.tx).toBe(192);
    expect(at2.tx).toBe(96);
  });

  it("배율이 0에 가까워도 터지지 않는다", () => {
    const out = cameraCenteringNode({ x: 10, y: 10 }, { dx: -100, dy: 0 }, 0);
    expect(Number.isFinite(out.tx)).toBe(true);
    expect(Number.isFinite(out.ty)).toBe(true);
  });

  /**
   * 왕복 검사 — 이 카메라를 쓰면 노드가 정말 자유 영역 가운데에 오나.
   * 화면 좌표 식은 그리는 쪽과 `nodes()` 창구가 함께 쓰는 그것이다.
   */
  it("이 카메라로 그리면 노드가 자유 영역 가운데에 온다", () => {
    const node = { x: 4321, y: -876 };
    const scale = 1.37;
    const offset = freeAreaOffset(CANVAS, [RIGHT_POPOVER]);
    const cam = cameraCenteringNode(node, offset, scale);
    // 캔버스 지역 좌표: (world - cam) * scale + size/2
    const screenX = (node.x - cam.tx) * scale + CANVAS.width / 2;
    const screenY = (node.y - cam.ty) * scale + CANVAS.height / 2;
    const free = computeFreeArea(CANVAS, [RIGHT_POPOVER]);
    // `free` 는 문서 좌표, `screenX` 는 캔버스 지역 좌표 — 캔버스 원점을 뺀다.
    expect(screenX + CANVAS.x).toBeCloseTo(free.x + free.width / 2, 6);
    expect(screenY + CANVAS.y).toBeCloseTo(free.y + free.height / 2, 6);
  });
});
