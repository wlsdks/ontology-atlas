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

/**
 * 열어 달라고 지목할 수 있는 자리 — **오늘은 하나다.**
 *
 * ⚠️ `'agent'`(2026-07-29 추가) 와 `'runtimes'`(2026-08-16 추가) 는
 * **2026-08-21 에 빠졌다.** 그 둘이 시트를 떠나 「에이전트」 목적지(`/agents/`)
 * 가 됐기 때문이다(원장 90). 부르던 두 곳은 이제 **라우터로 간다** — 시트를
 * 열어 달라고 신호를 보내 놓고 그 자리가 시트에 없으면, 사용자는 아무 일도
 * 안 일어나는 버튼을 누르게 된다.
 *
 * 이 타입이 좁아진 것이 그 사고를 **컴파일 시점에** 막는다. 넓게 두면
 * 「없는 방으로 가는 문」이 조용히 남는다.
 */
export type SettingsViewIntent = 'ai';

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
