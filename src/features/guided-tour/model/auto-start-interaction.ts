import { canAutoStartGuidedTour } from "./auto-start-guard";

/**
 * 첫 방문 자동 투어의 **상호작용 취소** 가드.
 *
 * 자동 발화는 화면이 정착할 때까지 기다리므로(초기 900ms + 막힘이 풀릴 때까지
 * 재시도) 실제 발화 시점은 2~6초 뒤일 수 있다. 그 사이에 사용자가 이미 노드를
 * 클릭해 상세 패널을 열어 두면, 뒤늦게 뜬 1/7 카드가 사용자의 작업 위로
 * 끼어든다(2026-07-26 실측 스크린샷). 스스로 탐색을 시작한 사람에게 "여기가
 * 지도예요" 1단계는 안내가 아니라 방해다.
 *
 * 그래서 **가드를 하나 더 다는 대신 발화 자체를 취소**한다. 발화 조건에 예외를
 * 더하는 방향은 이미 역효과가 확인됐다 — 안내가 자기가 소개하려던 선택지를
 * 그대로 덮었다. 취소해도 길이 막히지 않는다: 투어는 설정 › 화면 안내 ›
 * 다시 보기와 지도 우상단 나침반 타일에서 언제든 다시 열 수 있다.
 *
 * 모달(폴더 안내 시트 등)이 떠 있는 동안의 입력은 상호작용으로 세지 않는다 —
 * 시트의 [다음에]를 누르는 것은 "탐색을 시작했다"가 아니라 "안내를 마쳤다"
 * 이고, 그 직후가 정확히 투어가 떠야 할 자리이기 때문이다. 판정은 발화
 * 가드(`canAutoStartGuidedTour`)를 그대로 재사용해 두 곳이 갈라지지 않게 한다.
 */
export interface WatchGuidedTourAutoStartCancelOptions {
  /** 이벤트를 붙일 대상. 기본 `window` (테스트 주입용). */
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** 모달 판정에 쓸 document. 기본 전역 `document` (테스트 주입용). */
  doc?: Document;
}

/** 값을 나르지 않는 순수 수정자 키 — 이것만 눌린 건 탐색 시작이 아니다. */
const MODIFIER_ONLY_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "OS",
]);

/**
 * 자동 투어가 발화를 기다리는 동안 사용자의 첫 실질 상호작용을 감시한다.
 * 감지되면 `onCancel` 을 **한 번만** 호출하고 스스로 떨어진다. 반환값은 수동
 * 해제 함수(발화 성공/언마운트 시 호출).
 */
export function watchGuidedTourAutoStartCancel(
  onCancel: () => void,
  options: WatchGuidedTourAutoStartCancelOptions = {},
): () => void {
  const target = options.target ?? (typeof window === "undefined" ? null : window);
  if (!target) return () => undefined;
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  if (!doc) return () => undefined;

  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    target.removeEventListener("pointerdown", handlePointerDown, true);
    target.removeEventListener("keydown", handleKeyDown, true);
  };

  const fire = () => {
    // 지금 이 순간 발화가 막혀 있다면(모달이 떠 있다 · 문서가 포커스를 잃었다)
    // 그 입력은 지도 탐색이 아니라 그 표면과의 대화다 — 세지 않는다.
    if (!canAutoStartGuidedTour(doc)) return;
    detach();
    onCancel();
  };

  function handlePointerDown() {
    fire();
  }
  function handleKeyDown(event: Event) {
    const key = (event as KeyboardEvent).key;
    if (typeof key === "string" && MODIFIER_ONLY_KEYS.has(key)) return;
    fire();
  }

  // capture — 지도 캔버스가 이벤트를 자기 선에서 멈추더라도 감지한다.
  target.addEventListener("pointerdown", handlePointerDown, true);
  target.addEventListener("keydown", handleKeyDown, true);
  return detach;
}
