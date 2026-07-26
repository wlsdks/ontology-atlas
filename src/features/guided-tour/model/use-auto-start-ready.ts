'use client';

import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';

/**
 * 첫 방문 자동 투어를 **띄워도 되는 시점인가**.
 *
 * 소유자 확인(2026-07-26): *"7단계 투어는 폴더 지정하거나 일단 접속한 다음에
 * 나와야하지"* — 즉 폴더 안내가 끝난 **뒤**가 맞는 순서다. 그런데 실측해 보니
 * 두 경로 중 한쪽이 아예 막혀 있었다.
 *
 * 예전 조건은 `restoreAttempted && mode === 'static'` 하나였다. 이건 "샘플
 * 지도로 정착했다" 는 뜻이라, **폴더를 고른 사용자는 투어를 영영 못 받았다** —
 * 폴더를 고르는 순간 local 모드가 되어 조건이 거짓이 되기 때문이다. 정작
 * 투어가 설명하는 지도·INDEX·데이터시트는 두 모드에서 같은 화면인데도.
 *
 * 그래서 판정을 "어느 쪽이든 **정착했는가**" 로 바꾼다:
 *
 * - 샘플: 볼트 복원을 시도해 봤고 결과가 static 이다.
 * - 내 폴더: 볼트가 실제로 로드됐다.
 *
 * 둘 다 아니면 아직 모드가 안 정해진 과도기라 띄우지 않는다 — 그 사이에 쏘면
 * 지도가 그려지기 전 빈 화면 위에 카드가 뜬다.
 *
 * 샘플 전용 단계(`first-run-starter` 앵커)는 `computeVisibleSteps` 가 앵커
 * 해석 실패로 알아서 건너뛴다 — 내 폴더 모드에서 없는 것을 가리키지 않는다.
 */
export function useGuidedTourAutoStartReady(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  if (mode === 'local') return vault.status === 'loaded';
  return vault.restoreAttempted;
}
