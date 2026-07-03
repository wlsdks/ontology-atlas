import { describe, expect, it } from "vitest";

import {
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
});

describe("clampScale", () => {
  it("is deterministic and bounded", () => {
    expect(clampScale(0)).toBe(MAP_SCALE_MIN);
    expect(clampScale(999)).toBe(MAP_SCALE_MAX);
    expect(clampScale(1)).toBe(1);
  });
});
