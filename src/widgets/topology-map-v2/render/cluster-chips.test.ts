import { describe, expect, it } from "vitest";

import {
  clusterBadgeCenter,
  clusterBadgeLabel,
  clusterBadgeRect,
  clusterChipLabel,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterChipScale,
  clusterChipTravelPoint,
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
} from "./cluster-chips";

/**
 * Hit-testing (`topology-pointer-handlers.ts`) and drawing
 * (`topology-frame-draw.ts`) must use the same `clusterChipRect` /
 * `clusterChipLabel` or click coordinates drift. That shared geometry is this
 * slice's load-bearing contract, so it is unit-tested here; the actual canvas
 * pixels are verified on the running screen.
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
    // The centre stays on the anchor.
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
 * The expanded badge, docked to the parent node. The floating pill was dropped;
 * the badge rectangle is derived from the parent's screen position and base
 * radius. Draw and hit must use the same `clusterBadgeRect` or click
 * coordinates drift.
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

  /**
   * The **upper-left** — the upper-right is the orbit button's bearing
   * (2026-08-02). Sharing a shoulder put 80% of the badge under the button and
   * every click went to the button instead. The bearing split and its
   * exhaustive zero-overlap sweep:
   * `tests/contract/expand-settings.contract.test.ts`.
   */
  it("배지는 부모의 좌상단(스크린 x- 왼쪽, y- 위)에 앉는다", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    expect(cx).toBeLessThan(PARENT_X); // Left
    expect(cy).toBeLessThan(PARENT_Y); // Top
  });

  it("배지는 부모 노드 반지름 바깥에 완전히 벗어난다(오라·노드 겹침 차단)", () => {
    const rect = clusterBadgeRect(PARENT_X, PARENT_Y, NODE_R, clusterBadgeLabel(63));
    // Distance to the badge corner nearest the parent (**lower-right**) > node radius.
    const nearX = rect.x + rect.w; // The right edge is closer to the parent
    const nearY = rect.y + rect.h; // The bottom edge is closer to the parent
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
 * `clusterChipOccupancyRect` must take the **same branches** as
 * `drawClusterChip`. Diverge and labels either overlap the chip again (a missed
 * reservation) or dodge empty space (a ghost reservation). The two functions are
 * always edited together.
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
    // Collapsed pill alpha = 1 − revealT, so at revealT=1 the pill is invisible.
    expect(clusterChipOccupancyRect({ ...base, expanded: false, revealT: 1 })).toBeNull();
    // Expanded badge alpha = revealT, so at revealT=0 the badge is invisible.
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

/**
 * **The chip walks the gap rather than jumping it.**
 *
 * The collapsed pill sits at its anchor and the expanded badge on the parent's
 * shoulder, a measured 51–147px apart. That gap used to be crossed by an alpha
 * crossfade alone, which reads as one mark **vanishing here and another
 * appearing there** — without a line for the eye to follow the user does not
 * take them for the same thing.
 *
 * What is measured here is not whether it looks nice but whether it **arrives**:
 * at the end of the transition the pill's position must equal the badge's, so
 * the crossfade happens at one point instead of over the gap. Frame-level
 * measurement is design-motion's `/motion-verify`; this locks the **geometric
 * precondition** that verdict rests on.
 */
describe("clusterChipTravelPoint — 칩이 배지 자리로 걸어간다", () => {
  const base = {
    screenX: 100,
    screenY: 400,
    parentScreenX: 220,
    parentScreenY: 300,
    nodeScreenRadius: 14,
    scale: 1,
  };

  it("정착 상태에서는 anchor 에서 한 픽셀도 안 움직인다 — 회귀 0", () => {
    // Both revealT omitted (backward compatible) and 0 (collapsed, at rest) must keep the earlier coordinates.
    for (const revealT of [undefined, 0]) {
      const p = clusterChipTravelPoint({ ...base, revealT });
      expect(p, `revealT=${String(revealT)}`).toEqual({ x: base.screenX, y: base.screenY });
    }
  });

  it("전이가 끝나면 배지 자리에 **도착한다** — 크로스페이드가 한 점에서 일어난다", () => {
    const arrived = clusterChipTravelPoint({ ...base, revealT: 1 });
    const badge = clusterBadgeCenter(
      base.parentScreenX,
      base.parentScreenY,
      base.nodeScreenRadius,
      base.scale,
    );
    expect(arrived.x).toBeCloseTo(badge.x, 6);
    expect(arrived.y).toBeCloseTo(badge.y, 6);
  });

  it("중간에서는 두 점 사이에 있다 — 순간이동이 아니다", () => {
    const mid = clusterChipTravelPoint({ ...base, revealT: 0.5 });
    const badge = clusterBadgeCenter(
      base.parentScreenX,
      base.parentScreenY,
      base.nodeScreenRadius,
      base.scale,
    );
    expect(mid.x).toBeCloseTo((base.screenX + badge.x) / 2, 6);
    expect(mid.y).toBeCloseTo((base.screenY + badge.y) / 2, 6);
  });

  it("목적지를 모르면 움직이지 않는다 — 표류 금지", () => {
    // Without parent coordinates or radius (the degraded path) the badge is not
    // drawn either. A pill drifting off alone there is drift, not travel.
    for (const missing of [
      { parentScreenX: undefined },
      { parentScreenY: undefined },
      { nodeScreenRadius: undefined },
    ]) {
      const p = clusterChipTravelPoint({ ...base, ...missing, revealT: 1 });
      expect(p).toEqual({ x: base.screenX, y: base.screenY });
    }
  });

  it("점유 사각형이 이동을 따라간다 — 빈 자리를 피하지 않는다", () => {
    // If label avoidance keeps dodging the anchor, labels land on the ink of the
    // pill that walked away. Draw and occupancy must use the same travel point.
    //
    // ⚠️ Measured **mid-transition**. At `revealT: 1` the pill has fully faded, so
    // the earlier rule ("a form fading out occupies nothing") fires first and
    // returns null — correctly: an invisible chip pushing labels away is a ghost gap.
    const revealT = 0.5;
    const rect = clusterChipOccupancyRect({
      ...base,
      count: 7,
      hovered: false,
      expanded: false,
      revealT,
    });
    const travel = clusterChipTravelPoint({ ...base, revealT });
    expect(rect).not.toBeNull();
    expect(rect!.x + rect!.w / 2).toBeCloseTo(travel.x, 6);
    expect(rect!.y + rect!.h / 2).toBeCloseTo(travel.y, 6);
    // The point of this test is that it has not stayed on the anchor.
    expect(rect!.x + rect!.w / 2).not.toBeCloseTo(base.screenX, 1);
  });
});
