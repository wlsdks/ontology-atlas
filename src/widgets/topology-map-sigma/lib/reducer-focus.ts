import { indigoRgba } from '@/shared/config/indigo-tokens';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

/**
 * SigmaTopology nodeReducer 의 focus / neighbor / secondHop tint 분기.
 * A2-4 의 anim/audit 추출에 이은 다음 슬라이스 (A3-1).
 *
 * 호출자는 다음 4 가지 정보를 미리 계산해 전달:
 * - focus 노드 (선택된 ID, null = 비활성)
 * - 1-hop neighbors set
 * - 2-hop secondHop set
 * - backrefHighlight overlay 상태 + backrefNodes set (옵션)
 * - bounceFactor (선택 후 탄성 phase, 1.0 = 변화 없음)
 *
 * helper 자체는 React / Sigma 의존 0 — 순수 lookup + 색 토큰. 단위 테스트
 * 가능. focus 가 null 이면 caller 가 호출 안 해야 (또는 attrs 그대로 반환).
 */

export const FOCUS_DENSE_THRESHOLD = 8;

// 선택 신호의 인디고 ring 톤 — indigo-tokens 단일 진실원에서 파생(흩뿌린
// rgba 리터럴 제거). 모듈 로드 시 1회 계산이라 reducer hot-path (노드별·
// 프레임별 호출)에 per-call 문자열 할당을 더하지 않는다.
//
// 원칙(디자이너 패널 합의): fill = 데이터(kind 색), 인디고 = 선택 *상태*
// 이며 ring 채널로만. 이웃을 인디고로 재채색하면 "역량=amber·요소=green"
// 범례가 확장 중에 거짓이 된다.
const FOCUS_BORDER = indigoRgba('highlight', 0.95);
const FOCUS_OUTER_BORDER = indigoRgba('highlight', 0.35);
const NEIGHBOR_BORDER = 'rgba(255, 255, 255, 0.30)';
const BACKREF_BORDER = 'rgba(232, 196, 162, 0.9)';

export interface FocusContext {
  focusNode: string;
  /** 1-hop neighbor 집합. */
  neighbors: ReadonlySet<string>;
  /** 2-hop neighbor 집합. */
  secondHop: ReadonlySet<string>;
  /** backref overlay 가 켜져 있을 때 highlight 대상 (in-neighbor) 집합. */
  backrefNodes: ReadonlySet<string>;
  backrefHighlight: boolean;
  /** 선택 후 탄성 phase factor. computeBounceFactor 결과. */
  bounceFactor: number;
  /** focus 가 충분한 이웃을 가졌는지 (dense 분기). 미정 시 caller 가 계산. */
  isDenseFocus?: boolean;
}

/**
 * focus 컨텍스트를 적용해 노드의 attrs 를 변경. caller 는 overlay 상관
 * 없이 (audit / search / category / depth 모두 통과한) attrs 를 넘김.
 */
export function applyFocusOverlay(
  node: string,
  attrs: SigmaNodeAttrs,
  ctx: FocusContext,
) {
  const denseFocus =
    ctx.isDenseFocus ?? ctx.neighbors.size >= FOCUS_DENSE_THRESHOLD;

  // 1) focus 노드 자기 자신 — kind fill 유지, 인디고는 ring 으로만.
  if (node === ctx.focusNode) {
    const focusScale = attrs.isHub ? 1.25 : 1.6;
    return {
      ...attrs,
      borderColor: FOCUS_BORDER,
      outerBorderColor: FOCUS_OUTER_BORDER,
      size: attrs.size * focusScale * ctx.bounceFactor,
      zIndex: 10,
      label: undefined,
      forceLabel: false,
    };
  }

  // 2) 1-hop neighbor — kind fill 유지, ego 멤버십은 border 채널로만.
  if (ctx.neighbors.has(node)) {
    // backref overlay 매치 — amber 도 border-only (capability amber kind
    // fill 과의 hue 충돌 차단).
    if (ctx.backrefHighlight && ctx.backrefNodes.has(node)) {
      return {
        ...attrs,
        borderColor: BACKREF_BORDER,
        zIndex: 9,
        label: attrs.label,
        forceLabel: !denseFocus,
      };
    }

    // dense focus — 라벨만 솎아냄 (라벨 그리드 위임)
    if (denseFocus) {
      return {
        ...attrs,
        borderColor: NEIGHBOR_BORDER,
        zIndex: 9,
      };
    }

    return {
      ...attrs,
      borderColor: NEIGHBOR_BORDER,
      zIndex: 9,
      label: attrs.label,
      forceLabel: true,
    };
  }

  // 3) 2-hop — 약한 dim
  if (ctx.secondHop.has(node)) {
    return {
      ...attrs,
      color: 'rgba(70, 75, 90, 0.1)',
      borderColor: 'rgba(70, 75, 90, 0.05)',
      label: undefined,
      forceLabel: false,
    };
  }

  // 4) 그 외 — deep dim
  return {
    ...attrs,
    color: 'rgba(70, 75, 90, 0.06)',
    borderColor: 'rgba(70, 75, 90, 0.04)',
    label: undefined,
    forceLabel: false,
  };
}

export interface FocusEdgeContext {
  focusNode: string;
  source: string;
  target: string;
  neighbors: ReadonlySet<string>;
  wave: number;
  isDenseFocus?: boolean;
}

/**
 * Focus edge rendering must stay legible for hub-like nodes. A node such as
 * `Views` can have dozens of direct edges; highlighting all of them at high
 * alpha turns the map into a white mesh. Dense focus keeps direct evidence
 * visible but quiet, and suppresses neighbor-to-neighbor edges.
 */
export function applyFocusEdgeOverlay(
  attrs: SigmaEdgeAttrs,
  ctx: FocusEdgeContext,
) {
  const denseFocus =
    ctx.isDenseFocus ?? ctx.neighbors.size >= FOCUS_DENSE_THRESHOLD;
  const touchesFocus =
    ctx.source === ctx.focusNode || ctx.target === ctx.focusNode;

  if (touchesFocus) {
    const alpha = denseFocus
      ? 0.12 + 0.1 * ctx.wave
      : 0.48 + 0.22 * ctx.wave;
    return {
      ...attrs,
      color: indigoRgba('highlight', alpha),
      size: denseFocus ? 0.55 : 1.25,
      zIndex: denseFocus ? 1 : 2,
    };
  }

  if (ctx.neighbors.has(ctx.source) && ctx.neighbors.has(ctx.target)) {
    return denseFocus
      ? { ...attrs, color: 'rgba(255, 255, 255, 0.012)', size: 0.35 }
      : { ...attrs, color: indigoRgba('highlight', 0.06), size: attrs.size };
  }

  return { ...attrs, color: 'rgba(255, 255, 255, 0.006)', size: 0.3 };
}
