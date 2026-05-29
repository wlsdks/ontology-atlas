import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * 빌더 캔버스 키보드 단축키 결정 — 순수 함수로 추출해 단위 테스트 가능하게.
 * OntologyEditPage 의 window keydown 핸들러가 이 결과를 받아 실행만 한다.
 *
 * 결정 규칙 (기존 인라인 핸들러와 동일 + repeat 가드 추가):
 *   - 텍스트 입력 요소(input/textarea/contentEditable)에 focus → 모든 단축키 비활성
 *   - 키 반복(누르고 있기, event.repeat) → 무시. 키를 누르고 있을 때 노드가
 *     캔버스 중앙에 무더기로 쌓이거나 fullscreen 이 깜빡이는 회귀 방지.
 *   - Esc: 선택 있으면 해제, 없고 fullscreen 이면 종료
 *   - F: fullscreen 토글 (기존과 동일하게 modifier 무관)
 *   - P/N/D/C/E: kind 노드 추가 (modifier 없을 때만 — Cmd+P 인쇄 등 비간섭)
 *   - Delete/Backspace: 선택된 제거 가능 노드 삭제
 */

export type BuilderShortcutAction =
  | { type: "deselect" }
  | { type: "exitFullscreen" }
  | { type: "toggleFullscreen" }
  | { type: "addNode"; kind: ManualNodeKind }
  | { type: "removeSelected" }
  | null;

export interface BuilderKeyEvent {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** focus 가 input/textarea/contentEditable 같은 텍스트 입력 요소인지. */
  isTextEntryTarget: boolean;
}

export interface BuilderShortcutState {
  hasSelection: boolean;
  fullscreen: boolean;
  /** 선택된 노드가 ephemeral(삭제 가능) 인지. */
  selectionRemovable: boolean;
}

// N 은 P(project) 의 legacy alias — 기존 사용자 호환.
const ADD_NODE_KEY: Record<string, ManualNodeKind> = {
  p: "project",
  n: "project",
  d: "domain",
  c: "capability",
  e: "element",
};

export function resolveBuilderShortcut(
  event: BuilderKeyEvent,
  state: BuilderShortcutState,
): BuilderShortcutAction {
  // 텍스트 입력 중엔 단축키를 가로채지 않는다.
  if (event.isTextEntryTarget) return null;
  // 키를 누르고 있는 동안의 반복 keydown 은 무시 (discrete action 전용).
  if (event.repeat) return null;

  if (event.key === "Escape") {
    if (state.hasSelection) return { type: "deselect" };
    if (state.fullscreen) return { type: "exitFullscreen" };
    return null;
  }

  if (event.key === "f" || event.key === "F") {
    return { type: "toggleFullscreen" };
  }

  const lower = event.key.toLowerCase();
  if (
    lower in ADD_NODE_KEY &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    return { type: "addNode", kind: ADD_NODE_KEY[lower] };
  }

  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    state.hasSelection &&
    state.selectionRemovable
  ) {
    return { type: "removeSelected" };
  }

  return null;
}
