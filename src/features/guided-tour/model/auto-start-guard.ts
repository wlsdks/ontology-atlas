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
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) {
    return false;
  }
  return doc.hasFocus();
}
