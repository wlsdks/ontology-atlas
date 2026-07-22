import { useCallback, useEffect, useState } from 'react';
import { CURRENT_LOCAL_FS_HANDLE_ID, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  createTauriVaultHandle,
  ensureDefaultVaultParentDir,
  ensureTauriChildDirectory,
  listTauriDirectoryNames,
} from '@/shared/lib/tauri-vault-fs';
import { buildDefaultVaultDisplayPath, resolveUniqueVaultDirName } from '../lib/default-vault-naming';
import { shouldClearCreateIntent, shouldScaffoldAfterOpen } from './vault-create-flow';

/**
 * `useJustStartVault` 가 필요로 하는 `useLocalVault()` 의 최소 shape — 실제
 * 훅 또는 테스트 더블 모두 만족 가능하도록 좁게 유지 (`VaultCreateFlowVault`
 * 와 같은 패턴).
 */
export interface JustStartVaultVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  openRecent: (record: LocalFsHandleRecord) => Promise<void>;
  scaffoldOntology: () => Promise<{ created: number; skipped: number }>;
}

/**
 * "그냥 시작하기" — Tauri 데스크톱 전용. 폴더 픽커 없이
 * `~/Documents/Ontology Atlas/<name>` 아래 실제 디스크 폴더를 만들고 곧장
 * 연결한다 (OPFS 아님 — 에이전트/MCP/Claude Code 가 그대로 접근 가능한 게
 * 이 설계의 요점). 새 파이프라인 최소화 — 폴더 준비 뒤에는 기존
 * `vault.openRecent()` 와 `vault.scaffoldOntology()` 를 그대로 재사용한다
 * (`useVaultCreateFlow` 가 `open()` + `scaffoldOntology()` 를 잇는 것과 동일
 * 패턴, 픽커 대신 자동 경로 준비만 다르다).
 *
 * `shouldScaffoldAfterOpen`/`shouldClearCreateIntent` 를 그대로 재사용할 수
 * 있는 이유 — 이 폴더는 매번 새로 계산한 미사용 이름이라 도착 즉시 문서 수는
 * 항상 0. "새 vault 만들기" 처럼 사용자가 기존 폴더를 고를 위험이 없어도,
 * `openRecent()` 완료와 실제 `vault.manifest` 갱신 사이의 렌더 레이스는 동일하게
 * 존재하므로 같은 armed-effect 패턴을 그대로 쓴다 (`vault-create-flow.ts` 상단
 * 주석 참고).
 */
export function useJustStartVault(vault: JustStartVaultVault) {
  const [preparing, setPreparing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  const justStart = useCallback(async () => {
    setActionError(null);
    setCreatedPath(null);
    setPreparing(true);
    try {
      const parentDir = await ensureDefaultVaultParentDir();
      if (!parentDir) {
        throw new Error('Tauri vault runtime is not available.');
      }
      const existingNames = await listTauriDirectoryNames(parentDir);
      const dirName = resolveUniqueVaultDirName(existingNames);
      await ensureTauriChildDirectory(parentDir, dirName);
      const handle = createTauriVaultHandle(`${parentDir}/${dirName}`);
      const now = Date.now();
      await vault.openRecent({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle,
        name: handle.name,
        createdAt: now,
        lastAccessedAt: now,
      });
      setCreatedPath(buildDefaultVaultDisplayPath(dirName));
      // open() 뒤 바로 상태를 읽는 대신 armed 로 다음 렌더의 fresh vault 를
      // 기다린다 — `useVaultCreateFlow` 와 동일한 레이스 회피.
      setArmed(true);
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : '');
    } finally {
      setPreparing(false);
    }
  }, [vault]);

  useEffect(() => {
    if (!armed) return;
    const status = vault.status;
    const docCount = vault.manifest ? vault.manifest.docs.length : null;
    queueMicrotask(() => {
      if (shouldScaffoldAfterOpen({ createIntent: true, status, docCount })) {
        setArmed(false);
        setScaffolding(true);
        vault
          .scaffoldOntology()
          .catch((err: unknown) => {
            setActionError(err instanceof Error && err.message ? err.message : '');
          })
          .finally(() => setScaffolding(false));
        return;
      }
      if (shouldClearCreateIntent(status)) {
        setArmed(false);
      }
    });
  }, [armed, vault, vault.manifest, vault.status]);

  const clearCreatedPath = useCallback(() => setCreatedPath(null), []);

  return {
    justStart,
    busy: preparing || scaffolding,
    scaffolding,
    actionError,
    createdPath,
    clearCreatedPath,
  };
}
