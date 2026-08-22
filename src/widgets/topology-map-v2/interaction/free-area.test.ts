import { describe, expect, it } from "vitest";
import {
  measureCanvasInsets,
  computeFreeArea,
  SIDE_PANEL_HEIGHT_RATIO,
  type Rect,
} from "./free-area";

/** Measured geometry (1512×982, 2026-08-10) — these numbers are why this module exists. */
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
    // A side panel does not touch the height.
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
   * Something covering the whole screen (a sheet or scrim) is not subtracted.
   * Subtracting one leaves no area at all, and then «the centre» is undefined — and
   * with a sheet up it is not a moment to be moving the camera anyway.
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
   * Two side panels overshooting each other so the area inverts.
   *
   * ⚠️ The widths must not be generous — the moment a rectangle passes 60% of the
   * canvas width it counts as «a side panel and a top bar» and is **not subtracted
   * at all** (the module's rule). This case was first written with w900 (= 0.62) and
   * tripped that rule: the case was wrong, not the code.
   */
  it("두 세로 패널이 겹쳐 영역이 뒤집히면 캔버스로 물러난다", () => {
    const left: Rect = { x: 64, y: 0, width: 700, height: 900 };
    const rightPanel: Rect = { x: 600, y: 0, width: 500, height: 900 };
    expect(computeFreeArea(CANVAS, [left, rightPanel])).toEqual(CANVAS);
  });

  it("세로 패널 판정 비율이 실측 두 무리를 가른다", () => {
    // popover 813/982 = 0.83 → a side panel · top toolbar ~96/982 = 0.10 → not one
    expect(RIGHT_POPOVER.height / CANVAS.height).toBeGreaterThan(SIDE_PANEL_HEIGHT_RATIO);
    expect(96 / CANVAS.height).toBeLessThan(SIDE_PANEL_HEIGHT_RATIO);
  });
});

describe("measureCanvasInsets", () => {
  /**
   * A minimal DOM stand-in — only what `collectCanvasObstacles` uses. jsdom has no
   * layout, so every `getBoundingClientRect` returns 0; without planting those
   * values this test would **measure the environment** (a trap this file has already
   * fallen into once).
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
    // canvas right edge (1512) − popover left (1128) = 384 (matching the measurement)
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
