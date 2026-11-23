'use client';

import { useEffect } from 'react';

import { useLocalVault, useVaultSessionIdentityScope } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

import { workRuns } from '../model/work-run-store';
import { WorkRunCard } from './WorkRunCard';

/** Mounted once above every route: it ends a run whose folder was switched away, and draws the card. */
export function WorkRunSeat() {
  const folder = useVaultSessionIdentityScope();
  const handle = useLocalVault().handle;
  // The root path the map's conversation keys a mapping run by.
  const root = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  useEffect(() => {
    workRuns.leaveFolder(folder, Date.now());
  }, [folder]);
  useEffect(() => {
    workRuns.enterFolderRoot(root);
  }, [root]);
  return <WorkRunCard />;
}
