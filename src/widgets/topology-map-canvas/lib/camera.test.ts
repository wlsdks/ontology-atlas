import { describe, expect, it } from "vitest";

import {
  clampFitScale,
  clampScale,
  fitBounds,
  MAP_SCALE_MAX,
  MAP_SCALE_MIN,
  panBy,
  zoomAt,
  type MapCamera,
} from "./camera";

/**
 * 지도 카메라 계약 (docs/TOPOLOGY-MAP-REBUILD.md §3):
 * 카메라 = 컨테이너 하나의 transform(tx, ty, k). 모든 연산은 순수 함수 —
 * 팬/줌 중 DOM 쓰기는 transform 1건뿐이라는 계약의 수학적 기반.
 */
const base: MapCamera = { tx: 0, ty: 0, k: 1 };

describe("zoomAt", () => {
  it("keeps the cursor-anchored world point fixed while zooming", () => {
    // world point p 가 viewport (cx, cy) 에 보일 때: cx = p.x * k + tx.
    const cam: MapCamera = { tx: 100, ty: 50, k: 1 };
    const cursor = { x: 400, y: 300 };
    const worldX = (cursor.x - cam.tx) / cam.k;
    const worldY = (cursor.y - cam.ty) / cam.k;

    const next = zoomAt(cam, cursor, 2);

    expect(worldX * next.k + next.tx).toBeCloseTo(cursor.x, 6);
    expect(worldY * next.k + next.ty).toBeCloseTo(cursor.y, 6);
    expect(next.k).toBeCloseTo(2, 6);
  });

  it("clamps scale to the allowed range", () => {
    expect(zoomAt(base, { x: 0, y: 0 }, 100).k).toBe(MAP_SCALE_MAX);
    expect(zoomAt(base, { x: 0, y: 0 }, 0.0001).k).toBe(MAP_SCALE_MIN);
  });
});

describe("panBy", () => {
  it("translates without touching scale", () => {
    const next = panBy({ tx: 10, ty: 20, k: 1.5 }, 5, -7);
    expect(next).toEqual({ tx: 15, ty: 13, k: 1.5 });
  });
});

describe("fitBounds", () => {
  it("fits the whole bounds inside the viewport with padding", () => {
    const cam = fitBounds(
      { minX: -500, minY: -300, maxX: 500, maxY: 300 },
      { width: 1200, height: 800 },
      { top: 80, right: 40, bottom: 40, left: 360 },
    );
    // 모든 코너가 safe rect 안에 들어와야 한다.
    const corners = [
      { x: -500, y: -300 },
      { x: 500, y: 300 },
    ];
    for (const c of corners) {
      const vx = c.x * cam.k + cam.tx;
      const vy = c.y * cam.k + cam.ty;
      expect(vx).toBeGreaterThanOrEqual(360 - 1);
      expect(vx).toBeLessThanOrEqual(1200 - 40 + 1);
      expect(vy).toBeGreaterThanOrEqual(80 - 1);
      expect(vy).toBeLessThanOrEqual(800 - 40 + 1);
    }
  });

  it("centers a degenerate (single-point) bounds without blowing up scale", () => {
    const cam = fitBounds(
      { minX: 10, minY: 10, maxX: 10, maxY: 10 },
      { width: 1000, height: 800 },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    expect(cam.k).toBeLessThanOrEqual(MAP_SCALE_MAX);
    expect(cam.k).toBeGreaterThanOrEqual(MAP_SCALE_MIN);
    expect(10 * cam.k + cam.tx).toBeCloseTo(500, 3);
    expect(10 * cam.k + cam.ty).toBeCloseTo(400, 3);
  });

  /**
   * 기획자 감사 ③ 회귀 재발 방지 (design-guardian verdict a2+a3):
   * 카드가 px-고정 크기(scale(1/k) 역보정)라 fit 수학은 world bounds 만으로는
   * 부족하다 — 카드의 화면-px overhang 을 safe rect 에서 미리 빼야 코너가
   * 실제로 안 잘린다. 이 케이스는 옛 aspectX=8 layout 처럼 world 폭이 넓어
   * 요구 k 가 MAP_SCALE_MIN(0.25) 미만으로 떨어지는 상황을 재현한다.
   */
  it("reserves px-fixed card overhang so no card clips even when the required scale falls below the legacy user-zoom floor", () => {
    const bounds = { minX: -3680, minY: -460, maxX: 3680, maxY: 460 };
    const viewport = { width: 1512, height: 982 };
    const insets = { top: 120, right: 120, bottom: 110, left: 344 };
    const overhang = { left: 148, right: 148, top: 22, bottom: 22 };

    const cam = fitBounds(bounds, viewport, insets, { overhang });

    // fit 은 사용자 줌 하한(MAP_SCALE_MIN)에 clamp 되지 않는다 — a3 계약.
    expect(cam.k).toBeLessThan(MAP_SCALE_MIN);

    // 카드 전체 화면 extent(월드 코너 × k + overhang)가 safe rect 안에 있어야
    // "0 clipped cards" 가 성립한다.
    const screenLeft = bounds.minX * cam.k + cam.tx - overhang.left;
    const screenRight = bounds.maxX * cam.k + cam.tx + overhang.right;
    const screenTop = bounds.minY * cam.k + cam.ty - overhang.top;
    const screenBottom = bounds.maxY * cam.k + cam.ty + overhang.bottom;

    expect(screenLeft).toBeGreaterThanOrEqual(insets.left - 1);
    expect(screenRight).toBeLessThanOrEqual(viewport.width - insets.right + 1);
    expect(screenTop).toBeGreaterThanOrEqual(insets.top - 1);
    expect(screenBottom).toBeLessThanOrEqual(viewport.height - insets.bottom + 1);
  });

  it("falls back to zero overhang when the caller doesn't measure cards (backward compatible)", () => {
    const cam = fitBounds(
      { minX: -500, minY: -300, maxX: 500, maxY: 300 },
      { width: 1200, height: 800 },
      { top: 80, right: 40, bottom: 40, left: 360 },
    );
    expect(cam.k).toBeGreaterThan(0);
  });
});

describe("clampFitScale (a3 — fit clamp domain is separate from user-zoom clamp)", () => {
  it("has no MAP_SCALE_MIN floor — fit may legitimately need a scale below the user-zoom minimum", () => {
    expect(clampFitScale(0.05)).toBeCloseTo(0.05, 6);
    expect(clampFitScale(0.001)).toBeGreaterThan(0); // 여전히 0/음수는 방지
  });

  it("still enforces the shared MAP_SCALE_MAX ceiling", () => {
    expect(clampFitScale(999)).toBe(MAP_SCALE_MAX);
  });

  it("user-zoom clampScale keeps its MAP_SCALE_MIN floor unchanged", () => {
    expect(clampScale(0.05)).toBe(MAP_SCALE_MIN);
  });
});

describe("clampScale", () => {
  it("is deterministic and bounded", () => {
    expect(clampScale(0)).toBe(MAP_SCALE_MIN);
    expect(clampScale(999)).toBe(MAP_SCALE_MAX);
    expect(clampScale(1)).toBe(1);
  });
});
