import { describe, expect, it } from "vitest";
import {
  measureCanvasInsets,
  computeFreeArea,
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

describe("measureCanvasInsets", () => {
  /**
   * DOM 을 흉내 내는 최소 대역 — `collectCanvasObstacles` 가 쓰는 것만 갖춘다.
   * jsdom 에는 레이아웃이 없어 `getBoundingClientRect` 가 전부 0이므로, 그것을
   * 심어 주지 않으면 이 시험이 **환경을 재게 된다**(이 파일이 이미 한 번 밟은 함정).
   */
  const fakeCanvas = (panels: (Rect & { hidden?: boolean })[]) => {
    const make = (r: Rect, hidden?: boolean) => {
      const el = document.createElement("div");
      el.getBoundingClientRect = (() => ({
        x: r.x, y: r.y, width: r.width, height: r.height,
        left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height,
        toJSON: () => ({}),
      })) as typeof el.getBoundingClientRect;
      if (hidden) el.style.display = "none";
      return el;
    };
    document.body.innerHTML = "";
    const canvas = make({ x: 64, y: 0, width: 1448, height: 982 });
    document.body.append(canvas);
    for (const p of panels) document.body.append(make(p, p.hidden));
    return canvas;
  };

  it("오른쪽 팝오버를 오른쪽 인셋으로 잰다 — 실측 기하", () => {
    const canvas = fakeCanvas([RIGHT_POPOVER]);
    const insets = measureCanvasInsets(canvas, CANVAS);
    // 캔버스 오른쪽 끝(1512) − 팝오버 왼쪽(1128) = 384 (실측값과 같다)
    expect(insets).toEqual({ left: 0, right: 384 });
  });

  it("왼쪽 패널을 왼쪽 인셋으로 잰다", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 324, height: 900 }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 324, right: 0 });
  });

  it("숨은 패널은 세지 않는다", () => {
    const canvas = fakeCanvas([{ ...RIGHT_POPOVER, hidden: true }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });

  it("위·아래 바는 좌·우 인셋에 섞이지 않는다", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 1448, height: 96 }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });
});
