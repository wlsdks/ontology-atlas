import { describe, expect, it } from "vitest";

import {
  clusterChipLabel,
  clusterChipRect,
  CLUSTER_CHIP_HEIGHT,
} from "./cluster-chips";

/**
 * 히트테스트(`topology-pointer-handlers.ts`)와 드로우(`topology-frame-draw.ts`)가
 * 같은 `clusterChipRect`/`clusterChipLabel` 을 써야 클릭 좌표가 어긋나지 않는다
 * — 이 공유 지오메트리가 이 슬라이스의 load-bearing 계약이라 단위 테스트한다.
 * (실제 캔버스 픽셀 드로우는 :3107 실화면에서 메인 세션이 검증한다.)
 */
describe("clusterChipLabel", () => {
  it("접힘=`+N`, 펼침=`−`", () => {
    expect(clusterChipLabel(108, false)).toBe("+108");
    expect(clusterChipLabel(108, true)).toBe("−");
    expect(clusterChipLabel(5, false)).toBe("+5");
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
