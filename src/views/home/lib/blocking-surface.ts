/**
 * 지도 화면의 "블로킹 표면이 키보드를 소유한다" 계약 (#62).
 *
 * 왜 필요한가: 전역 단축키(⌘K 팔레트 · `?` 단축키 · `D` 문서함 드로어 · ⌘O
 * 폴더 열기)는 각자 `if (createNodeOpen) return;` 이라는 임시 가드를 달고
 * 있었다. 개념 추가 컴포저만 막고 **가이드 투어는 빠져 있어서**, 투어가 열린
 * 상태에서 `?` 를 누르면 단축키 모달이 투어 카드 위에 겹쳐 떴다 —
 * `role="dialog"` 두 개가 동시에 살아 있고, 어느 쪽이 포커스를 소유하는지
 * 아무도 모르는 상태 (opus5 검수 2026-07-25 실측).
 *
 * 디자인 규칙(`.claude/rules/design.md`)은 "transient surface 는 unrelated
 * surface 를 닫거나 demote 해야 한다" 이므로, 상충하는 오버레이 2개가 동시에
 * 서 있으면 결함이다. 가드를 표면마다 손으로 나열하는 대신 **하나의 술어**로
 * 모은다 — 새 블로킹 표면이 생기면 여기 한 곳만 고치면 되고, 빠뜨리면 이
 * 파일의 테스트가 잡는다.
 *
 * `openX 가 나머지를 닫는다` 는 반대 방향 계약(`openCreateNode` ·
 * `openGuidedTour`)과 짝을 이룬다: 열 때는 나머지를 닫고, 열려 있는 동안은
 * 키보드를 독점한다.
 */

export interface BlockingSurfaceState {
  /** 개념 추가 컴포저 — 지도를 dim 하고 상호작용을 막는 모달. */
  createNodeOpen: boolean;
  /** 가이드 투어 — 자체 scrim/blocker + 포커스 트랩을 가진 순차 안내. */
  tourOpen: boolean;
}

/**
 * 지금 전역 단축키를 무시해야 하는가.
 *
 * true 면 ⌘K / `?` / `D` / ⌘O 는 아무 것도 하지 않는다. 사용자는 열려 있는
 * 표면을 Esc 로 먼저 닫고 나서 쓴다 — 모달이 키보드를 소유한다는 흔한 계약.
 */
export function shouldSuppressGlobalShortcuts(state: BlockingSurfaceState): boolean {
  return state.createNodeOpen || state.tourOpen;
}
