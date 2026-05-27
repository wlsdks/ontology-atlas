/**
 * Source Vault 의 전역 명령 단위. 통합 팔레트 (DocsVaultUnifiedPalette) 가
 * 이 배열을 받아 `> ` prefix 모드에서 퍼지 매칭으로 실행.
 *
 * icon 은 string (이모지) 이나 React 엘리먼트 모두 받을 수 있다 —
 * 팔레트 UI 는 단순 렌더만 하기에.
 */
export interface VaultCommand {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** 표시할 단축키 — 있으면 행의 오른쪽에 kbd 로. */
  shortcut?: string;
  /** true 일 때만 리스트에 보임. false 면 숨김. */
  visible?: boolean;
  /** 실행 콜백. 팔레트는 onRun 호출 후 자동 close 한다. */
  onRun: () => void | Promise<void>;
}
