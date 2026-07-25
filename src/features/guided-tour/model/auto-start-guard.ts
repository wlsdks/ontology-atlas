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
export function canAutoStartGuidedTour(
  doc: Document = document,
  /**
   * 이 안내가 **가리키는** 요소들의 testid. 그 요소이거나 그것을 품고 있는
   * 모달은 차단 사유에서 뺀다 (2026-07-26 실측 — 공방은 도착하자마자
   * `studio-entry-choice`(role=dialog aria-modal) 가 서 있는 화면이라, 이
   * 예외가 없으면 공방만 영원히 안내를 못 받는다). 금지하려던 것은 *사용자가
   * 열어 둔 다른 표면* 위에 겹쳐 쏘는 것이지, 안내가 설명하려는 바로 그
   * 표면을 감광하는 것이 아니다.
   */
  ownAnchorTestIds: readonly string[] = [],
): boolean {
  // 사용자가 타이머보다 먼저 수동으로 투어를 열었으면 재시작(=welcome 리셋)
  // 하지 않는다 — e2e 실측 회귀(수동 진행 중 자동 발화가 1단계로 되돌림).
  if (doc.querySelector('[data-testid="guided-tour-overlay"]') !== null) {
    return false;
  }
  const blockingModal = Array.from(
    doc.querySelectorAll('[role="dialog"][aria-modal="true"]'),
  ).some(
    (modal) =>
      !ownAnchorTestIds.some(
        (id) =>
          modal.matches(`[data-testid="${id}"]`) ||
          modal.querySelector(`[data-testid="${id}"]`) !== null,
      ),
  );
  if (blockingModal) return false;
  // #96 — blocking edit composer (개념 추가 · 부트스트랩 등)는 `role=dialog`
  // 대신 `data-surface-role="blocking-edit-surface"` (dimmed map 위 solid
  // panel) 로 modality 를 선언한다. 이 마커도 모달 등급이므로 그 위에 투어
  // 오버레이를 겹쳐 쏘면 안 된다 — 실측: "개념 추가" 열린 상태에서 900ms 자동
  // 투어가 1단계 카드로 그 위에 떴다(stacked-transient 위반).
  if (doc.querySelector('[data-surface-role="blocking-edit-surface"]') !== null) {
    return false;
  }
  return doc.hasFocus();
}
