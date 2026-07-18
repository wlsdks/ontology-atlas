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
  return vault.restoreAttempted && mode === 'static';
}
