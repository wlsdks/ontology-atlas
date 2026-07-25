import { describe, expect, it } from "vitest";

import { buildInsightsVerdict, type InsightsSignalCounts } from "./insights-verdict";

const NONE: InsightsSignalCounts = {
  islands: 0,
  missingContainment: 0,
  cycles: 0,
  neglectedHubs: 0,
  orphans: 0,
  promotions: 0,
};

describe("buildInsightsVerdict", () => {
  it("신호가 하나도 없을 때만 '건강함' — CLI 판정도 healthy", () => {
    expect(buildInsightsVerdict(NONE)).toEqual({
      blocking: 0,
      advisory: 0,
      total: 0,
      healthy: true,
      status: "healthy",
    });
  });

  // opus5 검수 실측 모순: 스타터 볼트에서 신호가 '누락된 연결 1건' 뿐이었는데
  // `할 일 0` + "그래프가 건강합니다" + `누락된 연결 1` 이 동시에 떴다.
  // 같은 데이터에 MCP health 는 needs_attention 을 반환했다.
  it("누락된 연결 1건이면 할 일도 1 · 건강하지 않음 · CLI 와 같은 needs_attention", () => {
    const verdict = buildInsightsVerdict({ ...NONE, missingContainment: 1 });

    expect(verdict.total).toBe(1);
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("needs_attention");
  });

  it("분리된 섬도 차단 신호다", () => {
    const verdict = buildInsightsVerdict({ ...NONE, islands: 3 });

    expect(verdict.blocking).toBe(3);
    expect(verdict.status).toBe("needs_attention");
  });

  it("의존 순환도 차단 신호다 — 구조적 결함", () => {
    expect(buildInsightsVerdict({ ...NONE, cycles: 2 }).status).toBe("needs_attention");
  });

  it("권장 사항만 있으면 CLI 판정은 healthy 지만 화면은 '건강합니다' 라고 말하지 않는다", () => {
    const verdict = buildInsightsVerdict({ ...NONE, neglectedHubs: 2, orphans: 1, promotions: 4 });

    expect(verdict.blocking).toBe(0);
    expect(verdict.advisory).toBe(7);
    expect(verdict.status).toBe("healthy");
    // 바로 아래 큐가 7건을 보여주는데 "손볼 것이 없어요" 라고 하면 자기모순.
    expect(verdict.healthy).toBe(false);
  });

  it("배지 총합은 차단 + 권장 — 숫자를 숨겨 모순을 피하지 않는다", () => {
    const verdict = buildInsightsVerdict({
      islands: 1,
      missingContainment: 2,
      cycles: 1,
      neglectedHubs: 3,
      orphans: 0,
      promotions: 5,
    });

    expect(verdict.blocking).toBe(4);
    expect(verdict.advisory).toBe(8);
    expect(verdict.total).toBe(12);
  });
});
