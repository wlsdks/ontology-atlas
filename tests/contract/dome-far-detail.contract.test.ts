import { describe, expect, it } from "vitest";
import {
  DOME_DETAIL_FADE_END,
  DOME_DETAIL_FADE_START,
  domeDetailFactor,
  domeHaloPx,
} from "@/widgets/topology-map-v2/model/dome-view";

/**
 * 먼 쪽 상세 생략 — «팝 없음» 계약 (2026-08-19, 소유자 결정).
 *
 * ## 무엇을 잠그나
 *
 * 3D 돔은 뒤쪽 반구에서 부가 획(깊이 헤일로 · 입체 음영 · 금속 시인 · 외곽선 ·
 * 도메인 핀 틱)을 `domeDetailFactor(u)` 로 접는다. 이 생략이 지켜야 하는 세
 * 가지가 전부 이 함수의 **모양**에 걸려 있다:
 *
 * 1. **앞쪽 무변** — 관찰자 쪽 반구(u ≤ 0.5)에서 인자가 정확히 1 이어야
 *    앞쪽 픽셀이 한 자리도 안 달라진다.
 * 2. **팝 금지** — 돔을 돌리면 노드가 깊이 축을 연속으로 지나간다. 인자에
 *    문턱(계단)이 있으면 그 순간 획이 «툭» 사라진다. 여기서는 립시츠 상한으로
 *    잠근다: smoothstep 의 최대 기울기는 1.5/(END-START) 이고, 그보다 가파른
 *    구간이 하나라도 생기면(=하드컷) 빨간불이 든다.
 * 3. **스킵 게이트는 시인 한계 아래에서만** — 드로우는 헤일로 폭이 0.05px
 *    미만일 때 획을 통째로 건너뛴다. 그 게이트가 문턱이 되지 않으려면
 *    `domeHaloPx(u) × domeDetailFactor(u)` 곱 자체가 깊이에 연속이어야 한다.
 *
 * ## 게이트 프로브 (빨간불 확인, 2026-08-19)
 *
 * `domeDetailFactor` 를 하드컷(`u > 0.65 ? 0 : 1`)으로 바꿔 돌리면:
 * - 립시츠 검사: 스텝당 최대 변화 1.0 (상한 0.008) → ❌
 * - 곱 연속성: 스텝당 최대 변화 0.827px (상한 0.02px) → ❌
 * - 앞쪽 무변·중점 검사는 초록(하드컷 위치에 따라) — 그래서 립시츠 검사가
 *   이 계약의 심장이다.
 * 정상 구현 실측값: 립시츠 스텝당 최대 0.00750 (상한 0.008025 아래),
 * 곱 스텝당 최대 0.00864px (상한 0.02px 아래) — 임계는 정상과 결함 사이에
 * 정상×1.07(립시츠) · 정상×2.3(곱) / 결함÷125(립시츠) · 결함÷41(곱)의
 * 여유를 두고 놓여 있다.
 */
describe("dome-far-detail — 먼 쪽 상세 생략은 깊이에 연속이다 (팝 금지)", () => {
  const H = 0.001;
  /** smoothstep 최대 기울기 1.5/(END-START) 에 7% 여유. */
  const MAX_STEP = (1.5 / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START)) * H * 1.07;

  it("앞쪽 반구(u ≤ 0.5)는 인자 1 — 관찰자 쪽 픽셀 불변의 근거", () => {
    expect(DOME_DETAIL_FADE_START).toBeGreaterThanOrEqual(0.5);
    expect(domeDetailFactor(0)).toBe(1);
    expect(domeDetailFactor(0.5)).toBe(1);
  });

  it("램프에 계단이 없다 — 립시츠 상한(smoothstep 최대 기울기)", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const step = Math.abs(domeDetailFactor(u + H) - domeDetailFactor(u));
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0); // 검출기가 빈 집합 위에서 놀고 있지 않다
    expect(maxStep).toBeLessThanOrEqual(MAX_STEP);
  });

  it("헤일로 폭 곱(domeHaloPx × detail)도 연속이다 — 0.05px 스킵 게이트가 문턱이 되지 않는다", () => {
    let maxStep = 0;
    for (let u = 0; u < 1; u += H) {
      const a = domeHaloPx(u) * domeDetailFactor(u);
      const b = domeHaloPx(u + H) * domeDetailFactor(u + H);
      const step = Math.abs(b - a);
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeGreaterThan(0);
    // 0.001u 당 0.02px — 스킵 게이트(0.05px)의 절반 아래라 어떤 프레임 쌍에서도
    // 획이 눈에 띄는 폭으로 «툭» 생기거나 사라질 수 없다.
    expect(maxStep).toBeLessThanOrEqual(0.02);
  });

  it("생략은 END(<1) 에서 완결된다 — 이미 안개가 깊은 구간", () => {
    expect(DOME_DETAIL_FADE_END).toBeLessThan(1);
    expect(DOME_DETAIL_FADE_END).toBeGreaterThan(DOME_DETAIL_FADE_START);
    expect(domeDetailFactor(DOME_DETAIL_FADE_END)).toBe(0);
  });
});
