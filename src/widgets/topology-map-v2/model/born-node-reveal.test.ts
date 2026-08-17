import { describe, expect, it } from "vitest";

import { stepEmphasis } from "./focus-state";
import { effectiveNodeAlpha, nodeTierAlpha, DEFAULT_TIER_REVEAL } from "./tier-visibility";

/**
 * **에이전트가 만든 노드가 지도에 떠오른다** (2026-08-17 소유자 지시).
 *
 * ## 왜 필요했나
 *
 * 등장 램프(`appearRef` — 0.6배에서 부풀며 알파 0→1)는 원래 있었다. 그런데 새
 * 역량은 개요 배율에서 **티어 알파가 0** 이라 그 연출이 0 에 곱해졌다. 실측:
 * 에이전트가 역량을 하나 만들어도 화면에는 도메인의 자식 수만 2→3 으로 바뀌고
 * 새 동그라미는 나타나지 않았다.
 *
 * 그래서 방금 생긴 노드는 ego 클릭·칩 펼침과 **같은 급의 티어 면제**를 받는다.
 * 새 개념이 아니라 이미 있던 램프가 닿지 못하던 자리에 닿게 한 것이다.
 *
 * ## 화면 녹화 실측 (30fps, 설치된 앱)
 *
 * 첫 프레임 지분 **29.7%** — `design.md` 의 하드컷 기준(70%) 아래. 300~400ms 에
 * 걸쳐 단조롭게 올라 ~95%, 되떨어지는 구간 없음.
 *
 * 여기서는 그 곡선을 **모델 수준**으로 잠근다(CI 는 화면을 녹화하지 않는다):
 * 티어가 0 이어도 보이는가 · 한 프레임에 튀지 않는가 · 올라간 뒤 되떨어지지
 * 않는가.
 */

/** 개요 배율(zoomRatio 1)의 역량 — 원래는 안 보이는 자리. */
const HIDDEN_CAPABILITY = nodeTierAlpha("capability", false, 1, DEFAULT_TIER_REVEAL);

/** 등장 램프가 쓰는 tau 와 같은 자리의 값(`--topology-v2-cluster-reveal-tau` 계열). */
const REVEAL_TAU = 0.12;
const FRAME_DT = 1 / 60;

function revealSeries(frames: number): number[] {
  const out: number[] = [];
  let ramp = 0;
  for (let i = 0; i < frames; i += 1) {
    ramp = stepEmphasis(ramp, true, true, FRAME_DT, REVEAL_TAU, REVEAL_TAU);
    out.push(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, ramp));
  }
  return out;
}

describe("방금 생긴 노드가 지도에 떠오른다", () => {
  it("개요 배율의 역량은 원래 안 보인다 — 아니면 이 검사가 헛돈다", () => {
    expect(HIDDEN_CAPABILITY).toBe(0);
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, false, 0)).toBe(0);
  });

  it("티어가 0 이어도 방금 생긴 노드는 보인다", () => {
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
  });

  it("**한 프레임에 튀지 않는다** — 하드컷이면 결함이다", () => {
    const first = revealSeries(1)[0];
    // 녹화 실측 29.7%. 모델은 그보다 낮게 시작한다(프레임 하나 = 13%).
    expect(first).toBeLessThan(0.7);
    expect(first).toBeGreaterThan(0);
  });

  it("단조롭게 오른다 — 오르내리면 그게 깜빡임이다", () => {
    const series = revealSeries(40);
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i], `프레임 ${i} 에서 되떨어졌다`).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it("반 초 안에 다 떠오른다 — 기다리게 하지 않는다", () => {
    const series = revealSeries(30); // 0.5초 @60fps
    expect(series.at(-1)).toBeGreaterThan(0.95);
  });

  it("다 떠오른 뒤에는 티어가 다시 숨기지 못한다 — 사라지면 그게 깜빡임이다", () => {
    // 램프가 1 에 머무는 한 alpha 는 1 이다. 세션 동안 유지되는 이유가 이것이다.
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
    expect(effectiveNodeAlpha(0, true, 1)).toBe(1);
  });
});
