import { describe, expect, it } from "vitest";
import { FILL_ARRIVAL_DISTANCE_PX, fillArrivalOffset } from "./fill-arrival";
import type { StudioBearing } from "./build-studio-item";

/**
 * 방향이 **나침 계약에서 따라 나온다** — 취향으로 고른 값이 아니다.
 * 위 소켓에서 온 것은 위에서 내려오고, 왼쪽 소켓에서 온 것은 왼쪽에서 온다.
 * 그 대응이 이 모션이 나르는 정보의 전부다.
 */
describe("채움 도착 방향 — 소켓이 있던 쪽에서 걸어온다", () => {
  it("위 방위는 위에서 내려온다", () => {
    expect(fillArrivalOffset("up")).toEqual({
      "--studio-fill-from-x": "0px",
      "--studio-fill-from-y": `${-FILL_ARRIVAL_DISTANCE_PX}px`,
    });
  });

  it("아래 방위는 아래에서 올라온다", () => {
    expect(fillArrivalOffset("down")["--studio-fill-from-y"]).toBe(
      `${FILL_ARRIVAL_DISTANCE_PX}px`,
    );
  });

  it("좌우 방위는 가로축으로만 움직인다", () => {
    for (const bearing of ["left", "right"] as const) {
      expect(fillArrivalOffset(bearing)["--studio-fill-from-y"]).toBe("0px");
    }
    expect(fillArrivalOffset("left")["--studio-fill-from-x"]).toBe(
      `${-FILL_ARRIVAL_DISTANCE_PX}px`,
    );
    expect(fillArrivalOffset("right")["--studio-fill-from-x"]).toBe(
      `${FILL_ARRIVAL_DISTANCE_PX}px`,
    );
  });

  // 네 방위가 **서로 다른 축/부호**를 써야 대응이 읽힌다. 둘이 같아지면
  // 그 순간 이 모션은 정보를 잃고 장식이 된다.
  it("네 방위가 모두 서로 다른 출발점을 갖는다", () => {
    const bearings: StudioBearing[] = ["up", "down", "left", "right"];
    const seen = bearings.map((b) => JSON.stringify(fillArrivalOffset(b)));
    expect(new Set(seen).size).toBe(4);
  });

  // 12px 이내 — 확정의 서명이지 등장 연출이 아니다. 커지면 "재료가 날아온다"
  // 가 되어 절제가 정체성인 이 표면의 결을 깬다.
  it("이동 거리는 12px 이내다", () => {
    expect(FILL_ARRIVAL_DISTANCE_PX).toBeLessThanOrEqual(12);
  });
});
