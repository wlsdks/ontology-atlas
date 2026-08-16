'use client';

/**
 * "설정의 그 자리를 열어라" 는 요청 — 표면 사이의 단방향 신호 하나.
 *
 * 왜 이벤트인가: 설정 시트는 앱 셸(내비 레일 슬롯 · <lg 유틸 레인)이 소유하고,
 * 그것을 필요로 하는 쪽(지도 오른쪽 도크 등)은 셸의 자손이 아니다. 두 표면을
 * prop 으로 잇자면 지도 화면 전체가 설정 상태를 들고 다녀야 하는데, 설정을
 * 여는 일은 지도의 상태가 아니다. `app:urlchange` · 외양 설정 · 관객 설정이
 * 이미 쓰는 window 이벤트 관례를 그대로 따른다.
 *
 * **말로 길을 알려주는 대신 문을 준다.** "왼쪽 아래 톱니의 「AI 연결」에서…"
 * 같은 문구는 화면이 할 수 있는 일을 사람에게 시키는 것이다.
 */

const SETTINGS_VIEW_INTENT_EVENT = 'ontology-atlas:settings-view-intent';

/** 열어 달라고 지목할 수 있는 자리. 설정 시트의 드릴인 뷰 이름과 같다. */
/**
 * 열어 달라고 지목할 수 있는 자리. 설정 시트의 드릴인 뷰 이름과 같다.
 *
 * `'agent'` 는 2026-07-29 에 더했다 — 실습 마무리의 문장이 "Claude Code ·
 * Codex · Cursor 를 **연결**하거나 API 키를 넣으면" 이라고 **두 가지**를
 * 약속하는데, 열리는 방은 BYOK(`ai`) 하나뿐이었다. 시트에는 `agent` 뷰가
 * 실재하는데 이 타입이 그것을 부를 수 없어서, 약속한 방 중 하나로 가는 문이
 * 아예 없었다(카운슬 「핸드오프」).
 *
 * `'runtimes'` 는 2026-08-16 에 더했다 — 시작 체크리스트의 1단이 「AI 도구
 * 연결」인데, 앱 안에서 바로 대화할 도구를 고르는 자리는 `agent`(밖의 도구에
 * 이 폴더를 알려 주는 설정)가 아니라 **실행기 목록**이다. 그 둘은 하는 일이
 * 달라서 한쪽으로 보내면 사용자가 엉뚱한 화면에서 찾게 된다(소유자 실보고:
 * *"바로 설정이 나와서 ACP 연결하게 해야 하는 거 아님?"*).
 */
export type SettingsViewIntent = 'ai' | 'agent' | 'runtimes';

interface SettingsViewIntentDetail {
  view: SettingsViewIntent;
}

/** 설정 시트를 지정한 서브뷰로 열어 달라고 요청한다. 브라우저에서만 의미가 있다. */
export function requestSettingsView(view: SettingsViewIntent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SettingsViewIntentDetail>(SETTINGS_VIEW_INTENT_EVENT, {
      detail: { view },
    }),
  );
}

/** 요청을 받는다. 반환값은 해지 함수 — effect cleanup 에 그대로 쓴다. */
export function subscribeSettingsViewIntent(
  handler: (view: SettingsViewIntent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<SettingsViewIntentDetail>).detail;
    if (!detail?.view) return;
    handler(detail.view);
  };
  window.addEventListener(SETTINGS_VIEW_INTENT_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_VIEW_INTENT_EVENT, listener);
}
