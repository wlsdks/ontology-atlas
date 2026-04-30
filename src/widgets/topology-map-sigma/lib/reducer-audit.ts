import type { SigmaNodeAttrs } from './graph-build';

/**
 * Audit overlay 색·border 토큰. SigmaTopology 전체에서 단일 진실원으로
 * 쓰여 reducer 와 legend / overlay UI 가 같은 톤 공유.
 */
export const AUDIT_STALE_COLOR = 'rgba(232, 196, 162, 0.96)';
export const AUDIT_STALE_BORDER = 'rgba(232, 196, 162, 0.55)';
export const AUDIT_ORPHAN_COLOR = 'rgba(204, 150, 120, 0.92)';
export const AUDIT_ORPHAN_BORDER = 'rgba(204, 150, 120, 0.5)';
export const AUDIT_PROMOTION_COLOR = 'rgba(139, 151, 255, 0.96)';
export const AUDIT_PROMOTION_BORDER = 'rgba(139, 151, 255, 0.65)';

/**
 * audit overlay 가 켜졌을 때 노드 분류. 한 노드가 여러 set 에 속해도
 * applyAuditOverlay 가 stale > orphan > promotion 순으로 평가해 첫
 * 매칭만 적용.
 */
export interface AuditNodeSets {
  stale: ReadonlySet<string>;
  orphan: ReadonlySet<string>;
  promotion: ReadonlySet<string>;
}

/**
 * audit overlay 가 켜진 상태에서 한 노드의 reducer attrs 를 결정.
 *
 * 우선순위 stale > orphan > promotion. 어느 set 에도 안 속하면 deep dim
 * 으로 떨어뜨려 "문제 노드만 떠오르고 나머지는 배경" 시각 패턴.
 *
 * 호출자는 `overlayState.auditHighlight` true 일 때만 진입 시켜야 함 —
 * 이 함수 자체는 overlay flag 검사 안 함.
 */
export function applyAuditOverlay(
  node: string,
  attrs: SigmaNodeAttrs,
  sets: AuditNodeSets,
) {
  if (sets.stale.has(node)) {
    return {
      ...attrs,
      color: AUDIT_STALE_COLOR,
      borderColor: AUDIT_STALE_BORDER,
      size: attrs.size * 1.2,
      zIndex: 10,
      label: attrs.label,
      forceLabel: true,
    };
  }
  if (sets.orphan.has(node)) {
    return {
      ...attrs,
      color: AUDIT_ORPHAN_COLOR,
      borderColor: AUDIT_ORPHAN_BORDER,
      size: attrs.size * 1.15,
      zIndex: 9,
      label: attrs.label,
      forceLabel: true,
    };
  }
  if (sets.promotion.has(node)) {
    return {
      ...attrs,
      color: AUDIT_PROMOTION_COLOR,
      borderColor: AUDIT_PROMOTION_BORDER,
      size: attrs.size * 1.25,
      zIndex: 9,
      label: attrs.label,
      forceLabel: true,
    };
  }
  // 어느 set 에도 안 속하면 맥락만 남기고 deep dim.
  return {
    ...attrs,
    color: 'rgba(90, 95, 110, 0.08)',
    borderColor: 'rgba(90, 95, 110, 0.04)',
    label: undefined,
  };
}
