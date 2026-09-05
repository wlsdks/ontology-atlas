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

  it("60%보다 짧아도 명시한 데스크톱 인스펙터는 자유 영역에서 뺀다", () => {
    const shortInspector: Rect = {
      x: 1128,
      y: 32,
      width: 352,
      height: 456,
      cameraObstacle: "side-panel",
    };

    expect(computeFreeArea(CANVAS, [shortInspector])).toEqual({
      x: 64,
      y: 0,
      width: 1128 - 64,
      height: 982,
    });
  });

  it("명시한 모바일 전폭 시트는 자유 영역의 좌우 패널로 빼지 않는다", () => {
    const mobileSheet: Rect = {
      x: 76,
      y: 72,
      width: 1400,
      height: 456,
      cameraObstacle: "side-panel",
    };

    const free = computeFreeArea(CANVAS, [mobileSheet]);
    // The horizontal half is what this case has always guarded: a full-width sheet
    // is never a left or right inset.
    expect(free.x).toBe(CANVAS.x);
    expect(free.width).toBe(CANVAS.width);
  });

  /**
   * The `side-panel` declaration says «edge-attached, short content» — it does not
   * say **which** edge. Below `lg` the same node inspector is a bottom sheet
   * spanning the whole column, and while the declaration also forced `tallEnough`
   * the rectangle landed in the «both» branch and was subtracted from nothing: the
   * camera made no room and the sheet covered 93 of 125 nodes at 390×844
   * (2026-09-05). Width is measured evidence and settles the edge.
   */
  it("전폭 시트는 명시가 있어도 붙어 있는 가장자리 쪽으로 뺀다", () => {
    const bottomSheet: Rect = {
      x: 76,
      y: 526,
      width: 1400,
      height: 456,
      cameraObstacle: "side-panel",
    };

    const free = computeFreeArea(CANVAS, [bottomSheet]);
    expect(free.y).toBe(CANVAS.y);
    expect(free.height).toBe(526 - CANVAS.y);
    expect(free.width).toBe(CANVAS.width);
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
  const fakeCanvas = (
    panels: (Omit<Rect, "cameraObstacle"> & { hidden?: boolean; cameraObstacle?: "side-panel" | "none"; modal?: boolean })[],
  ) => {
    const make = (
      r: Omit<Rect, "cameraObstacle">,
      hidden?: boolean,
      cameraObstacle?: "side-panel" | "none",
      modal?: boolean,
    ) => {
      const el = document.createElement("div");
      el.getBoundingClientRect = (() => ({
        x: r.x, y: r.y, width: r.width, height: r.height,
        left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height,
        toJSON: () => ({}),
      })) as typeof el.getBoundingClientRect;
      if (hidden) el.style.display = "none";
      if (cameraObstacle) el.dataset.topologyCameraObstacle = cameraObstacle;
      if (modal) el.setAttribute("aria-modal", "true");
      return el;
    };
    document.body.innerHTML = "";
    const canvas = make({ x: 64, y: 0, width: 1448, height: 982 });
    document.body.append(canvas);
    for (const p of panels) {
      document.body.append(make(p, p.hidden, p.cameraObstacle, p.modal));
    }
    return canvas;
  };

  it("오른쪽 팝오버를 오른쪽 인셋으로 잰다 — 실측 기하", () => {
    const canvas = fakeCanvas([RIGHT_POPOVER]);
    const insets = measureCanvasInsets(canvas, CANVAS);
    // canvas right edge (1512) − popover left (1128) = 384 (matching the measurement)
    expect(insets).toEqual({ left: 0, right: 384 });
  });

  it("명시한 짧은 인스펙터도 오른쪽 카메라 장애물로 잰다", () => {
    const canvas = fakeCanvas([
      {
        x: 1128,
        y: 32,
        width: 352,
        height: 456,
        cameraObstacle: "side-panel",
      },
    ]);

    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 384 });
  });

  it("명시했어도 화면을 가로지르는 모바일 시트는 좌우 패널로 오인하지 않는다", () => {
    const canvas = fakeCanvas([
      {
        x: 76,
        y: 72,
        width: 1400,
        height: 456,
        cameraObstacle: "side-panel",
      },
    ]);

    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });

  it("왼쪽 패널을 왼쪽 인셋으로 잰다", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 324, height: 900 }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 324, right: 0 });
  });

  /**
   * Measured 2026-09-03: the search palette (an `aria-modal` sheet) was still
   * fading out on the frame the focus camera measured the DOM, and it was
   * subtracted as a 915 px *left* panel, so the picked node was aimed under the
   * detail panel. A modal blocks the map; it never shares the screen with it.
   */
  it("모달 시트는 좌우 인셋으로 세지 않는다 — 검색 팔레트가 사라지는 프레임", () => {
    const canvas = fakeCanvas([{ x: 400, y: 64, width: 576, height: 640, modal: true }, RIGHT_POPOVER]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 384 });
  });

  it("장애물 아님을 명시한 일시 표면도 세지 않는다", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 324, height: 900, cameraObstacle: "none" }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
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
