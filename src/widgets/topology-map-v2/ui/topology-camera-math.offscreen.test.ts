import { describe, expect, it } from "vitest";

import { hasAnyNodeOnScreen } from "./topology-camera-math";
import type { CameraAxes } from "../engine/camera";

const cam = (x: number, y: number, scale: number): CameraAxes => ({
  x: { value: x, velocity: 0 },
  y: { value: y, velocity: 0 },
  scale: { value: scale, velocity: 0 },
});

describe("hasAnyNodeOnScreen (#71)", () => {
  const NODES = [
    { x: 0, y: 0 },
    { x: 100, y: 40 },
  ];

  it("카메라가 노드 위에 있으면 보인다", () => {
    expect(hasAnyNodeOnScreen(cam(0, 0, 1), 1512, 900, NODES)).toBe(true);
  });

  it("카메라가 아주 멀리 가면 전부 화면 밖 — 빈 지도로 보이는 상태", () => {
    expect(hasAnyNodeOnScreen(cam(100000, 100000, 1), 1512, 900, NODES)).toBe(false);
  });

  it("하나라도 걸쳐 있으면 보정하지 않는다 — 사용자의 줌·위치 의도를 지우지 않는다", () => {
    // 두 번째 노드만 화면 안쪽에 남게 카메라를 옮긴다.
    expect(hasAnyNodeOnScreen(cam(100, 40, 1), 200, 200, NODES)).toBe(true);
  });

  it("가장자리 여유 안쪽이면 '보인다' — 경계에서 카메라가 튀지 않게", () => {
    // 노드를 오른쪽 경계 바로 바깥(+10px)에 두고 margin 24 를 준다.
    const width = 200;
    const justOutside = [{ x: width / 2 + 10, y: 0 }];
    expect(hasAnyNodeOnScreen(cam(0, 0, 1), width, 200, justOutside, 24)).toBe(true);
  });

  it("노드가 없으면 사라진 것도 아니다", () => {
    expect(hasAnyNodeOnScreen(cam(9999, 9999, 1), 1512, 900, [])).toBe(true);
  });

  it("레이아웃 전(뷰포트 0)에는 판단하지 않는다", () => {
    expect(hasAnyNodeOnScreen(cam(9999, 9999, 1), 0, 0, NODES)).toBe(true);
  });
});
