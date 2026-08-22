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
 * The minimal shape of `useLocalVault()` that `useJustStartVault` requires — kept narrow so both the
 * real hook and a test double satisfy it (the same pattern as `VaultCreateFlowVault`).
 */
export interface JustStartVaultVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  openRecent: (record: LocalFsHandleRecord) => Promise<void>;
  scaffoldOntology: (starterLocale: string) => Promise<{ created: number; skipped: number }>;
}

/**
 * "Just start" — Tauri desktop only. With no folder picker, it creates a real disk folder under
 * `~/Documents/Ontology Atlas/<name>` and connects to it immediately. **Not OPFS** — the whole point
 * of the design is that an agent, MCP, or Claude Code can reach it directly. Once the folder is
 * prepared it reuses the existing `vault.openRecent()` and `vault.scaffoldOntology()` rather than
 * adding a pipeline (the same pattern by which `useVaultCreateFlow` chains `open()` and
 * `scaffoldOntology()`; only the automatic path preparation replaces the picker).
 *
 * `starterLocale` follows the same contract as `useVaultCreateFlow` — whichever creation path is
 * taken, the starter must come out in the screen's language (walkthrough 2026-07-26).
 *
 * `shouldScaffoldAfterOpen`/`shouldClearCreateIntent` can be reused as-is because this folder is a
 * freshly computed unused name every time, so the document count on arrival is always 0. Even without
 * the risk of the user picking an existing folder (as in "create a new vault"), the render race
 * between `openRecent()` completing and `vault.manifest` actually refreshing is identical, so the same
 * armed-effect pattern is used (see the comment at the top of `vault-create-flow.ts`).
 */
export function useJustStartVault(vault: JustStartVaultVault, starterLocale: string) {
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
      // Rather than reading state straight after open(), `armed` waits for the next render's fresh
      // vault — the same race avoidance as `useVaultCreateFlow`.
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
          .scaffoldOntology(starterLocale)
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
  }, [armed, starterLocale, vault, vault.manifest, vault.status]);

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
