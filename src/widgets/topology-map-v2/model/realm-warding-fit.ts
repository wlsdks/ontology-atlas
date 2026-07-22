/**
 * S9 결함 2 — 결계 반경 "재적합" 이징 상태기계.
 *
 * WHAT: 영역 안에서 칩 확장/접힘으로 **가시 멤버 집합**이 바뀌면 결계 원이
 * 새 반경으로 부드럽게 옮겨 앉아야 한다("숨쉬듯" — 순간 점프 금지). 이 모듈은
 * 그 전이의 순수 상태다: 매 프레임 측정된 목표 반경을 받아 240ms 이징으로
 * 현재값을 밀고, 목표가 안 바뀌면 값을 **홀드**한다(지속 애니메이션 없음 —
 * 상태 변화 시에만 1회 이징). reduced-motion 은 즉시 스냅.
 *
 * 왜 순수 모듈인가: 프레임 루프(`ui/use-topology-loop.ts`)가 ref 로 상태를
 * 소유하고 매 프레임 `stepWardingFit` 을 굴린다 — 수렴/스냅/홀드 계약은 여기
 * 단위 테스트로 고정한다.
 */

import { easeInOutCubic } from "./camera-easing";

/** 재적합 이징 길이(ms) — Design 헌장 "≤240ms" 상한. */
export const WARDING_REFIT_MS = 240;
/** 목표 변화 감지 데드밴드(월드 유닛) — 미세 흔들림으로 트윈이 재시작하지 않게. */
const REFIT_EPSILON = 0.5;

export interface WardingFitState {
  /** 이번 프레임에 그릴 현재 반경. */
  value: number;
  /** 진행 중 트윈의 시작 반경. */
  from: number;
  /** 진행 중 트윈의 목표 반경. */
  to: number;
  /** 트윈 시작 시각(performance.now 호환). 음수 = 정착(홀드). */
  startMs: number;
}

/** 초기 상태 — 주어진 반경에 정착(트윈 없음). */
export function initWardingFit(radius: number): WardingFitState {
  return { value: radius, from: radius, to: radius, startMs: -1 };
}

/**
 * 한 프레임 전진. 규칙:
 * - 측정 목표가 현재 트윈 목표와 다르면(데드밴드 초과) **현재 렌더값에서** 새
 *   240ms 트윈 시작. reduced-motion 이면 즉시 스냅.
 * - 트윈 중이면 이징으로 전진, 끝나면 목표에 스냅하고 정착.
 * - 정착 상태에서 목표가 그대로면 값을 그대로 홀드(지속 애니메이션 금지).
 */
export function stepWardingFit(
  state: WardingFitState,
  measuredTarget: number,
  now: number,
  reducedMotion: boolean,
): WardingFitState {
  if (Math.abs(measuredTarget - state.to) > REFIT_EPSILON) {
    if (reducedMotion) {
      return { value: measuredTarget, from: measuredTarget, to: measuredTarget, startMs: -1 };
    }
    return { value: state.value, from: state.value, to: measuredTarget, startMs: now };
  }
  if (state.startMs < 0) return state; // 정착 — 홀드
  const p = (now - state.startMs) / WARDING_REFIT_MS;
  if (p >= 1) return { value: state.to, from: state.to, to: state.to, startMs: -1 };
  return { ...state, value: state.from + (state.to - state.from) * easeInOutCubic(p) };
}
