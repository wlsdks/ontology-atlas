export type TopologyFocusReturnTarget = "row" | "search" | "tab";

function focusIfPossible(element: HTMLElement | null): boolean {
  if (!element) return false;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}

/**
 * 노드 datasheet가 닫힌 뒤 키보드 탐색 맥락을 복원한다.
 *
 * 선택 행이 현재 INDEX 필터 안에 보이면 그 행이 최우선이다. 연결 노드로
 * 이동해 행이 필터 밖이 됐으면 검색창으로, canvas 선택 때문에 INDEX가
 * 접혀 있으면 다시 펼칠 수 있는 INDEX 탭으로 강등한다.
 */
export function restoreTopologyFocusAfterDatasheetClose(
  selectedNodeId: string | null,
  root: ParentNode = document,
): TopologyFocusReturnTarget | null {
  if (selectedNodeId) {
    const rows = root.querySelectorAll<HTMLElement>("[data-index-row]");
    for (const row of rows) {
      if (
        row.dataset.indexRow === selectedNodeId &&
        focusIfPossible(row)
      ) {
        return "row";
      }
    }
  }

  const search = root.querySelector<HTMLElement>(
    '[data-testid="topology-index-search"]',
  );
  if (focusIfPossible(search)) return "search";

  const tab = root.querySelector<HTMLElement>(
    '[data-testid="topology-index-tab"]',
  );
  if (focusIfPossible(tab)) return "tab";

  return null;
}
