import { describe, expect, it } from "vitest";

import {
  clusterBadgeLabel,
  clusterBadgeRect,
  clusterChipLabel,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterChipScale,
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
} from "./cluster-chips";

/**
 * 히트테스트(`topology-pointer-handlers.ts`)와 드로우(`topology-frame-draw.ts`)가
 * 같은 `clusterChipRect`/`clusterChipLabel` 을 써야 클릭 좌표가 어긋나지 않는다
 * — 이 공유 지오메트리가 이 슬라이스의 load-bearing 계약이라 단위 테스트한다.
 * (실제 캔버스 픽셀 드로우는 :3107 실화면에서 메인 세션이 검증한다.)
 */
describe("clusterChipLabel", () => {
  it("접힘=`+N`, 펼침=`− N`(숫자 유지)", () => {
    expect(clusterChipLabel(108, false)).toBe("+108");
    expect(clusterChipLabel(108, true)).toBe("− 108");
    expect(clusterChipLabel(5, false)).toBe("+5");
  });
});

describe("clusterChipScale", () => {
  it("카메라 스케일을 따르되 0.85~1.5 밴드로 clamp (판독 유지)", () => {
    expect(clusterChipScale(1)).toBe(1);
    expect(clusterChipScale(0.4)).toBe(0.85);
    expect(clusterChipScale(3)).toBe(1.5);
    expect(clusterChipScale(1.2)).toBeCloseTo(1.2, 6);
  });
  it("비유한 스케일은 1 로 폴백", () => {
    expect(clusterChipScale(Number.NaN)).toBe(1);
  });
});

describe("clusterChipRect scale", () => {
  it("scale 을 주면 폭·높이가 비례한다(히트/드로우 공용)", () => {
    const base = clusterChipRect(0, 0, "+12", 1);
    const big = clusterChipRect(0, 0, "+12", 1.5);
    expect(big.w).toBeCloseTo(base.w * 1.5, 6);
    expect(big.h).toBeCloseTo(base.h * 1.5, 6);
    // 중심은 anchor 유지.
    expect(big.x + big.w / 2).toBeCloseTo(0, 6);
  });
});

describe("clusterChipRect", () => {
  it("anchor 를 중심으로 사각형을 놓는다(중심 = anchor)", () => {
    const rect = clusterChipRect(200, 150, "+12");
    expect(rect.x + rect.w / 2).toBeCloseTo(200, 6);
    expect(rect.y + rect.h / 2).toBeCloseTo(150, 6);
    expect(rect.h).toBe(CLUSTER_CHIP_HEIGHT);
  });

  it("결정론 — 같은 입력 → 같은 사각형(히트/드로우 일치의 근거)", () => {
    expect(clusterChipRect(10, 20, "+7")).toEqual(clusterChipRect(10, 20, "+7"));
  });

  it("라벨이 길수록 폭이 넓다(카운트 자릿수 반영)", () => {
    const narrow = clusterChipRect(0, 0, "+9");
    const wide = clusterChipRect(0, 0, "+108");
    expect(wide.w).toBeGreaterThan(narrow.w);
  });

  it("point-in-rect: anchor 지점은 반드시 사각형 안이다", () => {
    const cx = 300;
    const cy = 220;
    const rect = clusterChipRect(cx, cy, clusterChipLabel(40, false));
    expect(cx >= rect.x && cx <= rect.x + rect.w).toBe(true);
    expect(cy >= rect.y && cy <= rect.y + rect.h).toBe(true);
  });
});

/**
 * S10 결함 2 — 펼침 배지(부모 노드 우상단 부착). 떠다니는 알약을 폐기하고 부모
 * 노드 스크린 좌표 + base 반지름 기준으로 배지 사각형을 유도한다. 드로우와
 * 히트가 같은 `clusterBadgeRect` 를 써야 클릭 좌표가 어긋나지 않는다.
 */
describe("clusterBadgeLabel", () => {
  it("펼침 배지는 컴팩트 `−N`(공백 없음, +N 과 대칭)", () => {
    expect(clusterBadgeLabel(63)).toBe("−63");
    expect(clusterBadgeLabel(5)).toBe("−5");
  });
});

describe("clusterBadgeRect", () => {
  const PARENT_X = 400;
  const PARENT_Y = 300;
  const NODE_R = 20;

  it("배지는 부모의 우상단(스크린 x+ 오른쪽, y- 위)에 앉는다", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    expect(cx).toBeGreaterThan(PARENT_X); // 오른쪽
    expect(cy).toBeLessThan(PARENT_Y); // 위
  });

  it("배지는 부모 노드 반지름 바깥에 완전히 벗어난다(오라·노드 겹침 차단)", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    // 배지의 부모에 가장 가까운 모서리(좌하단)까지의 거리 > 노드 반지름.
    const nearX = rect.x; // 왼쪽 변이 부모에 더 가깝다
    const nearY = rect.y + rect.h; // 아래 변이 부모에 더 가깝다
    const dist = Math.hypot(nearX - PARENT_X, nearY - PARENT_Y);
    expect(dist).toBeGreaterThan(NODE_R);
  });

  it("노드 반지름이 클수록 배지는 더 바깥으로 밀린다(카메라 추종)", () => {
    const near = clusterBadgeRect(PARENT_X, PARENT_Y, 10, clusterBadgeLabel(9));
    const far = clusterBadgeRect(PARENT_X, PARENT_Y, 40, clusterBadgeLabel(9));
    const nearReach = Math.hypot(near.x + near.w / 2 - PARENT_X, near.y + near.h / 2 - PARENT_Y);
    const farReach = Math.hypot(far.x + far.w / 2 - PARENT_X, far.y + far.h / 2 - PARENT_Y);
    expect(farReach).toBeGreaterThan(nearReach);
  });

  it("scale 을 주면 폭·높이가 비례한다(히트/드로우 공용)", () => {
    const base = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−12", 1);
    const big = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−12", 1.5);
    expect(big.w).toBeCloseTo(base.w * 1.5, 6);
    expect(big.h).toBeCloseTo(base.h * 1.5, 6);
    expect(base.h).toBe(CLUSTER_BADGE_HEIGHT);
  });

  it("결정론 — 같은 입력 → 같은 사각형(히트/드로우 일치의 근거)", () => {
    expect(clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−7")).toEqual(
      clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, "−7"),
    );
  });

  it("배지 높이는 접힘 pill 보다 작다(미니 배지)", () => {
    expect(CLUSTER_BADGE_HEIGHT).toBeLessThan(CLUSTER_CHIP_HEIGHT);
  });
});

/**
 * S11 — `clusterChipOccupancyRect` 는 `drawClusterChip` 과 **같은 분기**를 타야
 * 한다는 계약. 갈라지면 라벨이 칩 위에 다시 겹치거나(예약 누락) 아무것도 없는
 * 곳을 피한다(유령 예약). 두 함수는 항상 함께 수정한다.
 */
describe("clusterChipOccupancyRect (S11 라벨 예약)", () => {
  const base = { screenX: 400, screenY: 300, count: 31, hovered: false };

  it("접힘 = pill 사각형과 정확히 일치한다", () => {
    const rect = clusterChipOccupancyRect({ ...base, expanded: false });
    expect(rect).toEqual(clusterChipRect(400, 300, clusterChipLabel(31, false)));
  });

  it("펼침 = 부모 우상단 배지 사각형과 정확히 일치한다", () => {
    const rect = clusterChipOccupancyRect({
      ...base,
      expanded: true,
      parentScreenX: 200,
      parentScreenY: 250,
      nodeScreenRadius: 18,
    });
    expect(rect).toEqual(clusterBadgeRect(200, 250, 18, clusterBadgeLabel(31)));
  });

  it("펼침인데 부모 지오메트리가 없으면 null — draw 도 그리지 않는다", () => {
    expect(clusterChipOccupancyRect({ ...base, expanded: true })).toBeNull();
  });

  it("reveal 램프로 사라지는 형태는 점유하지 않는다 — 안 보이는 칩이 라벨을 밀어내면 유령 여백", () => {
    // 접힘 pill 알파 = 1 − revealT → revealT=1 이면 pill 은 안 보인다.
    expect(clusterChipOccupancyRect({ ...base, expanded: false, revealT: 1 })).toBeNull();
    // 펼침 배지 알파 = revealT → revealT=0 이면 배지는 안 보인다.
    expect(
      clusterChipOccupancyRect({
        ...base,
        expanded: true,
        revealT: 0,
        parentScreenX: 200,
        parentScreenY: 250,
        nodeScreenRadius: 18,
      }),
    ).toBeNull();
  });

  it("줌 스케일이 예약 폭에도 그대로 반영된다", () => {
    const small = clusterChipOccupancyRect({ ...base, expanded: false, scale: 1 })!;
    const large = clusterChipOccupancyRect({ ...base, expanded: false, scale: 1.5 })!;
    expect(large.w).toBeCloseTo(small.w * 1.5);
    expect(large.h).toBeCloseTo(small.h * 1.5);
  });
});
