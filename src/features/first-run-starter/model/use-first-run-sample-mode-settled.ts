import { useLocalVault } from '@/features/docs-vault-local';
import { useDataSourceMode } from '@/features/data-source-mode';

/**
 * "정적(샘플) 모드이고, vault 복원 시도가 이미 끝났다" — 브랜드 pill 의
 * SAMPLE 배지, INDEX 의 시작하기 모듈, 우하단 계기 판독이 모두 이 하나의
 * 판정을 공유한다(단일 진실원 — 세 표면이 각자 계산하면 drift 위험).
 *
 * `restoreAttempted` 를 반드시 같이 확인하는 이유: `useDataSourceMode` 는
 * vault.status !== 'loaded' 이면 전부 'static' 으로 본다 — IndexedDB 에서
 * 이전 vault 핸들을 비동기로 복원하는 짧은 창(마운트 직후 한두 프레임)에도
 * 'static' 이 찍힌다. 이 게이트가 없으면 재방문 사용자에게 SAMPLE 배지/
 * 시작하기 모듈이 잠깐 번쩍였다가 사라지는 깜빡임이 생긴다(소유자 지적 —
 * "맨날 들어와서 누르게 하지 않기").
 */
export function useFirstRunSampleModeSettled(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  /*
   * **한 번이라도 폴더를 연 사람에게는 샘플 안내를 띄우지 않는다**
   * (2026-08-02, 소유자: *"이미 연결한거 아님? 한번이라도 연결했으면 이 샘플은
   * 안나와야하는데? 샘플은 정말 연결 한번도 안하고 그냥 써보는 사람이
   * 체험하기 위한거라서"*).
   *
   * 종전 판정은 **지금 볼트가 열려 있나**뿐이었다(`mode === 'static'`). 그래서
   * 예전에 폴더를 연결했던 사람도 볼트를 닫았거나 다른 이유로 static 이면
   * **첫 방문자와 똑같은 화면**을 봤다 — 「쇼핑몰 예시 / 이 앱의 코드」 탭까지.
   *
   * `recentVaults`(최근 연 폴더 목록)가 그 사실을 이미 안다. 비어 있지 않으면
   * 그 사람은 이 제품을 체험할 단계를 지났다.
   *
   * 위 `restoreAttempted` 주석이 고친 것은 **깜빡임**이었고, 이 줄이 고치는 것은
   * **대상**이다 — 같은 함수가 두 번 틀렸던 자리라 둘 다 남긴다.
   */
  const neverConnected = vault.recentVaults.length === 0;
  return vault.restoreAttempted && mode === 'static' && neverConnected;
}
