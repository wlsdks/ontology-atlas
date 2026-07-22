/**
 * H3 P0 — INDEX 트리 로빙 tabindex 계약(WAI-ARIA `tree` 패턴).
 *
 * `role="tree"` 는 "한 번의 Tab 으로 트리에 진입, 그 안은 Arrow 키로 이동"을
 * 약속한다. 종전 구현은 모든 `role="treeitem"` 행에 `tabIndex=0` 을 박아,
 * 도메인 하나만 펼쳐도 Tab 스톱이 +14 개씩 늘어나 키보드 사용자가 트리를
 * 통째로 밟고 지나가야 했다(접근성 감사 P0). 로빙 tabindex 는 "활성 행 하나만
 * tabIndex=0, 나머지는 -1" 로 두고 ArrowUp/Down 이 형제 이동을 담당한다.
 *
 * 이 모듈은 그 이동 규칙을 순수 함수로 분리해 DOM/React 없이 단위 테스트한다
 * (`roving-tabindex.test.ts`). 패널은 이 함수들 + `ref.focus()` 만 조립한다.
 */

import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";

/**
 * 현재 화면에 실제로 보이는 행들의 nodeId 를 위→아래 DOM 순서로 편다.
 * `isOpen` 는 패널의 것과 같은 술어(검색/렌즈 시 자동 펼침 포함) — 접힌
 * 부모의 자식은 건너뛴다. Arrow 이동 대상 = 이 배열이다.
 */
export function flattenVisibleRowIds(
  roots: readonly OntologyTreeNode[],
  isOpen: (nodeId: string) => boolean,
): string[] {
  const out: string[] = [];
  const visit = (entry: OntologyTreeNode) => {
    out.push(entry.node.id);
    if (entry.children.length > 0 && isOpen(entry.node.id)) {
      for (const child of entry.children) visit(child);
    }
  };
  for (const root of roots) visit(root);
  return out;
}

export type RovingNavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * 방향키 하나가 로빙 포커스를 어느 nodeId 로 옮겨야 하는지 결정한다.
 * - ArrowDown/Up: 다음/이전 형제(경계에서 clamp — 순환 안 함, tree 관례).
 * - Home/End: 처음/끝.
 * currentId 가 목록 밖(필터로 사라짐 등)이면 첫 행으로 착지시킨다.
 * 빈 목록이면 null.
 */
export function nextRovingId(
  orderedIds: readonly string[],
  currentId: string | null,
  key: RovingNavKey,
): string | null {
  if (orderedIds.length === 0) return null;
  const last = orderedIds.length - 1;
  if (key === "Home") return orderedIds[0];
  if (key === "End") return orderedIds[last];
  const index = currentId ? orderedIds.indexOf(currentId) : -1;
  if (index < 0) return orderedIds[0];
  if (key === "ArrowDown") return orderedIds[Math.min(index + 1, last)];
  return orderedIds[Math.max(index - 1, 0)]; // ArrowUp
}

/**
 * 어떤 행이 tabIndex=0(트리의 단일 Tab 진입점)이어야 하는지 해석한다.
 * 우선순위: 유효한 활성 행 → 선택된 노드(둘 다 보이는 경우) → 첫 행.
 * 활성/선택 id 가 현재 안 보이면(필터·접힘) 첫 행으로 강등해, 로빙 진입점이
 * 항상 실재하는 행 하나를 가리키도록 보장한다.
 */
export function resolveActiveRowId(
  orderedIds: readonly string[],
  activeRowId: string | null,
  selectedId: string | null,
): string | null {
  if (orderedIds.length === 0) return null;
  if (activeRowId && orderedIds.includes(activeRowId)) return activeRowId;
  if (selectedId && orderedIds.includes(selectedId)) return selectedId;
  return orderedIds[0];
}
