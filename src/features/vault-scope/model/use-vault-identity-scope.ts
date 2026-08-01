'use client';

import { vaultIdentityScope, type VaultIdentityScope } from '@/entities/docs-vault';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useSampleSource } from '@/features/vault-sample-source';

/**
 * **지금 화면이 보고 있는 볼트가 무엇인가** — 한 문자열.
 *
 * 이 값이 바뀌면 *그 볼트 안에서만 뜻이 있던 상태*(주소의 노드 슬러그, 볼트별
 * 저장 상태)는 의미를 잃는다. 「범위를 넘긴 상태」 부류의 결함은 전부 그
 * 순간에 아무도 걷어내지 않아 생긴다 — 낡은 값이 살아남아 **거짓 판정의
 * 입력**이 된다.
 *
 * 산출식의 단일 출처는 `vaultIdentityScope`(entities). 이 훅은 그 함수에 앱의
 * 세 신호를 모아 넣을 뿐이다:
 *
 * - `useDataSourceMode()` — 사용자 볼트를 보고 있나, 번들 샘플을 보고 있나
 * - `useLocalVault().handle?.name` — 로컬이면 어느 폴더인가
 * - `useSampleSource()` — 샘플이면 어느 샘플인가 (**이 축이 빠지면 샘플↔샘플
 *   전환이 변화로 안 잡힌다**)
 *
 * ⚠️ 핀·최근·열린 탭이 쓰는 `vaultScopeKey` 와 **다른 값**이다. 그쪽은 이미
 * 배포된 저장 자리의 이름이라 샘플 둘을 하나로 본다 — 이유는
 * `entities/docs-vault/lib/vault-scope-key.ts` 의 표에 있다.
 */
export function useVaultIdentityScope(): VaultIdentityScope {
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const [sampleSource] = useSampleSource();

  return vaultIdentityScope({
    isLocalLoaded: mode === 'local' && localVault.status === 'loaded',
    handleName: localVault.handle?.name ?? null,
    sampleSource,
  });
}
