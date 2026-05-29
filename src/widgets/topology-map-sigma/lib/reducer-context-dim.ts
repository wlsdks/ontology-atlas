import { INDIGO_HIGHLIGHT, indigoRgba } from '@/shared/config/indigo-tokens';
import type { SigmaNodeAttrs } from './graph-build';

/**
 * SigmaTopology nodeReducer 의 검색 / 카테고리 / depth / hoveredEdge /
 * pathNodes 5 분기를 단일 helper 로 묶음. A3-3 1차 슬라이스 (A3-1 focus
 * tint, A3-2 filter pure 함수에 이은).
 *
 * 사용 패턴:
 *   const dimResult = applyContextDimOverlay(node, attrs, ctx);
 *   if (dimResult) return dimResult;
 *   // 그 외 — focus / 일반 attrs 분기로 진행
 *
 * 반환 null = "이 분기에 해당 안 함, 다음 단계 진행". 반환 attrs = "여기서
 * 결정된 dim/highlight 결과, 그대로 사용".
 */

export const CONTEXT_DIM_COLOR = 'rgba(120, 125, 140, 0.08)';
export const CONTEXT_HOVER_DIM_COLOR = 'rgba(120, 125, 140, 0.2)';
export const CONTEXT_HIGHLIGHT_COLOR = INDIGO_HIGHLIGHT;
export const CONTEXT_HIGHLIGHT_BORDER_STRONG = indigoRgba('highlight', 0.95);
export const CONTEXT_HIGHLIGHT_BORDER_HOVER = indigoRgba('highlight', 0.9);

export interface ContextDimContext {
  /** matchesSearch 결과 — false 면 dim. */
  searchPassed: boolean;
  /** matchesCategory 결과 — false 면 dim. */
  categoryPassed: boolean;
  /** passesDepth 결과 — false 면 dim. */
  depthPassed: boolean;
  /** edge hover 시 양 끝 노드. null 이면 비활성. */
  hoveredEdgePair: { source: string; target: string } | null;
  /** 경로 찾기 결과 set. 비어 있으면 비활성. */
  pathNodes: ReadonlySet<string>;
}

/**
 * 5 분기 우선순위 적용:
 *   1. search/category/depth 미통과 → deep dim
 *   2. hoveredEdge 활성 → 양 끝 인디고 / 그 외 약 dim
 *   3. pathNodes 활성 → 경로 인디고 + size 1.25x / 그 외 deep dim
 *
 * 셋 다 비활성이면 null 반환 (caller 가 focus/일반 attrs 처리).
 */
export function applyContextDimOverlay(
  node: string,
  attrs: SigmaNodeAttrs,
  ctx: ContextDimContext,
) {
  // 1) 필터 미통과 — deep dim
  if (!ctx.searchPassed || !ctx.categoryPassed || !ctx.depthPassed) {
    return { ...attrs, color: CONTEXT_DIM_COLOR, label: undefined };
  }

  // 2) edge hover
  if (ctx.hoveredEdgePair) {
    if (
      node === ctx.hoveredEdgePair.source ||
      node === ctx.hoveredEdgePair.target
    ) {
      return {
        ...attrs,
        color: CONTEXT_HIGHLIGHT_COLOR,
        borderColor: CONTEXT_HIGHLIGHT_BORDER_HOVER,
        zIndex: 10,
        label: attrs.label,
      };
    }
    return {
      ...attrs,
      color: CONTEXT_HOVER_DIM_COLOR,
      label: undefined,
    };
  }

  // 3) path 활성
  if (ctx.pathNodes.size > 0) {
    if (ctx.pathNodes.has(node)) {
      return {
        ...attrs,
        color: CONTEXT_HIGHLIGHT_COLOR,
        borderColor: CONTEXT_HIGHLIGHT_BORDER_STRONG,
        size: attrs.size * 1.25,
        zIndex: 10,
        label: attrs.label,
        forceLabel: true,
      };
    }
    return { ...attrs, color: CONTEXT_DIM_COLOR, label: undefined };
  }

  return null;
}
