/**
 * 첫 방문 자동 투어의 stacked-transient 가드 (Design Guardian 2026-07-24).
 *
 * 자동 투어 타이머(900ms)가 발화하는 순간, 사용자가 이미 모달
 * (`role="dialog"` + `aria-modal="true"` — VaultOpenGuideSheet ·
 * AgentConnectSheet 등)을 열어 두었거나 OS 폴더 선택창으로 문서 포커스가
 * 나가 있으면 투어 오버레이(z-70/75)를 그 위에 겹쳐 쏘면 안 된다 —
 * 헌장의 "popover 위 popover/modal 스택 금지" 계약. 이 판정만 순수
 * 함수로 분리해 jsdom 회귀 테스트를 건다.
 *
 * `data-interactive-overlay` 마커는 GestureHint(비차단 힌트 칩)도 쓰므로
 * 여기 기준으로 쓰지 않는다 — 차단 대상은 모달 등급 표면뿐이다.
 */
export function canAutoStartGuidedTour(doc: Document = document): boolean {
  // 사용자가 타이머보다 먼저 수동으로 투어를 열었으면 재시작(=welcome 리셋)
  // 하지 않는다 — e2e 실측 회귀(수동 진행 중 자동 발화가 1단계로 되돌림).
  if (doc.querySelector('[data-testid="guided-tour-overlay"]') !== null) {
    return false;
  }
  // 안내가 **가리키려는** 모달이라 해도 예외는 없다. 공방(`studio-entry-choice`)
  // 에 그런 예외를 뒀더니 실측 1512px 에서 안내 카드가 소개하려던 진입 선택 두
  // 카드를 그대로 덮었고, `aria-modal` 두 개가 동시에 서서 스크린리더에는 카드
  // 자체가 존재하지 않게 됐다. 안내는 결정 화면을 가리는 게 아니라 결정이 끝난
  // 뒤 작업 표면에서 뜬다.
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) {
    return false;
  }
  // #96 — blocking edit composer (개념 추가 · 부트스트랩 등)는 `role=dialog`
  // 대신 `data-surface-role="blocking-edit-surface"` (dimmed map 위 solid
  // panel) 로 modality 를 선언한다. 이 마커도 모달 등급이므로 그 위에 투어
  // 오버레이를 겹쳐 쏘면 안 된다 — 실측: "개념 추가" 열린 상태에서 900ms 자동
  // 투어가 1단계 카드로 그 위에 떴다(stacked-transient 위반).
  if (doc.querySelector('[data-surface-role="blocking-edit-surface"]') !== null) {
    return false;
  }
  // 2026-07-29 — 설정이 **우측 도크(비모달)** 가 되면서 `aria-modal` 을 잃었다.
  // 그런데 "지금 다른 표면과 대화 중"이라는 사실은 그대로다 — 모달이 아니게
  // 됐다고 그 위에 안내를 쏘아도 되는 것은 아니다. 이 가드의 판정 기준은
  // modality 가 아니라 **사용자의 주의가 어디 있는가** 이므로 마커로 잇는다.
  if (doc.querySelector('[data-surface-role="settings-dock"]') !== null) {
    return false;
  }
  // 2026-07-28 ② — 정직 강등 카드가 서 있는 화면(예: <lg 의 공방)에는 소개할
  // 표면 자체가 없다. "여기가 공방이에요" 를 "공방은 여기서 못 열려요" 위에
  // 띄우면 안내가 아니라 거짓말이 된다. 기록을 남기지 않으므로 조건이 맞는
  // 화면(창을 넓히거나 앱)에서 같은 안내가 그대로 기다린다.
  if (doc.querySelector('[data-surface-role="degraded-surface"]') !== null) {
    return false;
  }
  // 2026-07-29 설치 앱 실측 — **하고 있는 사람에게 설명하지 않는다.**
  // 공방 실습(`?practice=1`)을 시작하자 900ms 뒤 첫 방문 투어가 그 위에 떴고,
  // 실습의 1단계("이름을 지어 보세요")를 물리적으로 막았다. 실습 띠는 모달이
  // 아니라 비차단 띠라 위의 어떤 조건에도 안 걸렸다.
  //
  // 두 안내가 같은 순간에 서로 다른 "지금 이걸 하세요" 를 말하면, 사용자는
  // 둘 다 못 한다. 손이 이미 움직이고 있는 실습이 소개보다 우선한다 — 소개는
  // 실습을 그만두면 다음 방문에 그대로 기다린다(기록을 남기지 않으므로).
  if (doc.querySelector('[data-surface-role="hands-on-guide"]') !== null) {
    return false;
  }
  return doc.hasFocus();
}
