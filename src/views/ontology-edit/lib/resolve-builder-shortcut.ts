import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * 빌더 캔버스 키보드 단축키 결정 — 순수 함수로 추출해 단위 테스트 가능하게.
 * OntologyEditPage 의 window keydown 핸들러가 이 결과를 받아 실행만 한다.
 *
 * 결정 규칙 (기존 인라인 핸들러와 동일 + repeat 가드 추가):
 *   - 텍스트 입력 요소(input/textarea/contentEditable)에 focus → 모든 단축키 비활성
 *   - 키 반복(누르고 있기, event.repeat) → 무시. 키를 누르고 있을 때 노드가
 *     캔버스 중앙에 무더기로 쌓이거나 fullscreen 이 깜빡이는 회귀 방지.
 *   - 노드 추가 직후 이름 입력이 아직 포커스되기 전 공백 프레임(suppressTyping
 *     Shortcuts) → 타이핑과 헷갈리는 단축키(addNode/toggleFullscreen/
 *     removeSelected)를 정지. 자동포커스 레이스로 첫 글자가 전역 단축키로
 *     새어 엉뚱한 노드가 추가되거나 드래프트가 지워지던 회귀 방지(persona QA).
 *   - Esc: 선택 있으면 해제, 없고 fullscreen 이면 종료
 *   - F: fullscreen 토글 (기존과 동일하게 modifier 무관)
 *   - P/N/D/C/E: kind 노드 추가 (modifier 없을 때만 — Cmd+P 인쇄 등 비간섭)
 *   - Delete/Backspace: 선택된 제거 가능 노드 삭제
 */

export type BuilderShortcutAction =
  | { type: "closePopover" }
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
  /** 헤더 팝오버(오버플로 · 저장 상태 · 배치 보기) 중 하나라도 열려 있는지. */
  popoverOpen: boolean;
  /**
   * 노드 추가 직후 이름 입력이 포커스되기 전 공백 프레임인지. true 면
   * 타이핑과 헷갈리는 단축키(addNode/toggleFullscreen/removeSelected)를 정지해
   * 첫 글자가 전역 단축키로 새는 것을 막는다. Esc 사다리는 영향 없음.
   */
  suppressTypingShortcuts?: boolean;
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
    // 팝오버가 열려 있으면 그것부터 닫는다 — 선택 해제/풀스크린 종료보다
    // 우선. 열린 표면을 두고 배경 상태를 먼저 지우면 사용자가 "Esc 로 닫았다"
    // 는 기대를 어긴다(transient surface 를 먼저 demote).
    if (state.popoverOpen) return { type: "closePopover" };
    if (state.hasSelection) return { type: "deselect" };
    if (state.fullscreen) return { type: "exitFullscreen" };
    return null;
  }

  // 노드 추가 후 포커스 안착 전 공백 프레임 — 타이핑으로 오인될 단축키 정지.
  // (Esc 사다리는 위에서 이미 처리되어 영향받지 않는다.)
  if (state.suppressTypingShortcuts) return null;

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
