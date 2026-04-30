import type { SigmaNodeAttrs } from './graph-build';
import {
  CONTAINER_HOVER_TARGET_SCALE,
  computeContainerHoverProgress,
  lerp,
} from './reducer-anim';

/**
 * SigmaTopology nodeReducer 의 container hover preview 분기 (A4-2).
 *
 * Layer 0 (워크스페이스 보기) 의 컨테이너 노드를 hover 했을 때 자식 hub
 * 들만 size·color·border alpha 를 부드럽게 부스트해 "이 안에 뭐가
 * 있나" 미리 훑게. focus 상태가 아닐 때만 적용.
 *
 * 250ms easeOutCubic 으로 1x → 2.6x size, alpha 0.32 → 0.92, border
 * 0.18 → 0.7. M-22: "뿅" 튀지 않고 sheet preview 감성.
 *
 * helper 자체는 React/Sigma 의존 0. caller 가 ctx 입력 추출해 호출.
 * 매칭 조건 (hoveredChildren.has + !selected + isHub) 는 caller 가 검사
 * 해 helper 진입.
 */

export interface ContainerHoverContext {
  /** hover start timestamp (performance.now()). null = 비활성. */
  hoverStart: number | null;
  /** 현재 시점. 매 프레임 변동. */
  now: number;
}

/**
 * caller 는 hoveredContainerChildren.has(node) + !selected + isHub 검사
 * 후 진입. helper 가 progress 계산 + size 변조 + color/border lerp
 * 결과 반환.
 */
export function applyContainerHoverPreview(
  attrs: SigmaNodeAttrs,
  ctx: ContainerHoverContext,
) {
  const progress = computeContainerHoverProgress(ctx.hoverStart, ctx.now);
  const scale = 1 + (CONTAINER_HOVER_TARGET_SCALE - 1) * progress;
  const colorAlpha = lerp(0.32, 0.92, progress);
  const borderAlpha = lerp(0.18, 0.7, progress);
  return {
    ...attrs,
    size: attrs.size * scale,
    color: `rgba(139, 151, 255, ${colorAlpha.toFixed(3)})`,
    borderColor: `rgba(180, 190, 255, ${borderAlpha.toFixed(3)})`,
    label: attrs.label,
    // 60% 지점에서 라벨 push — progress 가 작을 때는 hub 가 작아 라벨이
    // 겹쳐 보임 차단.
    forceLabel: progress > 0.6,
    zIndex: 8,
  };
}
