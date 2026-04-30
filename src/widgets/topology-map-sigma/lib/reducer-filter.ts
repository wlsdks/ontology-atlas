import type { SigmaNodeAttrs } from './graph-build';

/**
 * SigmaTopology nodeReducer 의 검색 / 카테고리 / depth 필터 분기.
 * A2-4 (anim/audit) + A3-1 (focus tint) 추출에 이은 A3-2 슬라이스.
 *
 * 모두 순수 함수 — React / Sigma 의존 0. caller 가 ref / state 에서
 * 입력 값을 추출해 넘겨주면 boolean 반환.
 */

/**
 * 검색 쿼리 매칭 — projectSlug 또는 label (소문자) 포함이면 true.
 * query null/undefined/공백이면 항상 true (필터 비활성).
 */
export function matchesSearch(
  attrs: SigmaNodeAttrs,
  rawQuery: string | undefined,
): boolean {
  const q = rawQuery?.trim().toLowerCase();
  if (!q) return true;
  return (
    attrs.projectSlug.toLowerCase().includes(q) ||
    attrs.label.toLowerCase().includes(q)
  );
}

/**
 * 카테고리 필터 — activeCategory null 이면 항상 true. 일치할 때만 true.
 */
export function matchesCategory(
  attrs: SigmaNodeAttrs,
  activeCategory: string | null | undefined,
): boolean {
  if (!activeCategory) return true;
  return attrs.categoryId === activeCategory;
}

/**
 * depth 필터 — focus 노드로부터 limit hop 이내인지. focus null 이거나
 * limit null/undefined 면 항상 true (필터 비활성). depthMap 에 노드가
 * 없으면 false (focus 와 연결되지 않음 — 깊게 dim).
 */
export function passesDepth(
  node: string,
  focus: string | null | undefined,
  limit: number | null | undefined,
  depthMap: ReadonlyMap<string, number>,
): boolean {
  if (!focus || limit == null) return true;
  const d = depthMap.get(node);
  if (d === undefined) return false;
  return d <= limit;
}
