import { useCallback, useEffect, useState } from 'react';
import { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './vault-create-flow';

/**
 * Minimal shape this hook needs from `useLocalVault()` — kept narrow so any
 * caller (real hook or a test double) can supply it without importing the
 * full `LocalVaultValue` type.
 */
export interface VaultCreateFlowVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  open: () => Promise<void>;
  scaffoldOntology: () => Promise<{ created: number; skipped: number }>;
}

/**
 * "새 vault 만들기" 액션 — 폴더 선택(open) 뒤 빈 폴더면 starter 를 시드
 * (scaffoldOntology) 한다. `FirstRunPage`(데스크톱 first-run) 와
 * `FirstRunChooser`(웹 root-first-open) 가 동일하게 재사용 — 새 파이프라인
 * 0, 결정 로직은 `vault-create-flow.ts` 의 순수 함수.
 */
export function useVaultCreateFlow(vault: VaultCreateFlowVault) {
  const [createArmed, setCreateArmed] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setActionError(null);
    await vault.open();
    // open() resolves after the picker + manifest build settled (or the
    // user cancelled) — arming here avoids racing the status flip.
    setCreateArmed(true);
  }, [vault]);

  useEffect(() => {
    if (!createArmed) return;
    const status = vault.status;
    const docCount = vault.manifest ? vault.manifest.docs.length : null;
    // 렌더 직후 동기 setState 를 피하려고 microtask 로 미룬다 — 판정 입력은
    // 이 effect 실행 시점 값으로 고정.
    queueMicrotask(() => {
      if (shouldScaffoldAfterOpen({ createIntent: true, status, docCount })) {
        setCreateArmed(false);
        setScaffolding(true);
        vault
          .scaffoldOntology()
          .catch((err: unknown) => {
            // '' (게 아니라 null) 로 "에러는 났지만 메시지가 없음" 을
            // 표시 — 호출자(FirstRunPage 등)가 로케일별 fallback 문구를
            // 채울 수 있게. null 은 "에러 없음".
            setActionError(err instanceof Error && err.message ? err.message : '');
          })
          .finally(() => setScaffolding(false));
        return;
      }
      if (shouldClearCreateIntent(status)) {
        setCreateArmed(false);
      }
    });
  }, [createArmed, vault, vault.manifest, vault.status]);

  return { handleCreate, scaffolding, actionError, setActionError };
}
