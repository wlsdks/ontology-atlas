'use client';

import { useEffect, useState } from 'react';

import {
  scanHarness,
  type HarnessReport,
  type HarnessScanPort,
  type HarnessScanProgress,
} from '@/entities/agent-files';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import {
  getTauriVaultRootPath,
  listTauriVaultEntries,
  readTauriVaultTextFile,
} from '@/shared/lib/tauri-vault-fs';

/**
 * Reads only through the installed app's bridge: the browser's File System Access API cannot
 * see dot directories, where the harness lives. Reads the connected project source, not the
 * ontology folder.
 */

export type HarnessReportState =
  | { status: 'unsupported' }
  | { status: 'no-source' }
  | { status: 'loading'; sourceRoot: string; progress: HarnessScanProgress | null }
  | { status: 'ready'; sourceRoot: string; report: HarnessReport }
  | { status: 'failed'; sourceRoot: string; message: string };

interface HarnessReportSnapshot {
  handle: FileSystemDirectoryHandle;
  slugKey: string;
  capabilityKey: string;
  reloadNonce: number;
  state: HarnessReportState;
}

function bridgePort(sourceRoot: string): HarnessScanPort {
  return {
    async listDir(relativePath) {
      try {
        const entries = await listTauriVaultEntries(sourceRoot, relativePath);
        return entries;
      } catch {
        /* A missing path makes the bridge throw, and most repositories have no `.cursor/rules`.
           That is an ordinary absence, not a failure, so it reads as "nothing here". */
        return null;
      }
    },
    async readText(relativePath) {
      try {
        return await readTauriVaultTextFile(sourceRoot, relativePath);
      } catch {
        return null;
      }
    },
  };
}

/** The one project source bound to this folder; several distinct roots return `null`, not a guess. */
async function resolveSourceRoot(
  handle: FileSystemDirectoryHandle,
  projectSlugs: readonly string[],
): Promise<string | null> {
  const store = createVaultFileProjectSourceStore(handle);
  const roots = new Set<string>();
  for (const slug of projectSlugs) {
    const result = await store.list(slug);
    if (result.status !== 'ok') continue;
    for (const binding of result.bindings) roots.add(binding.rootPath);
  }
  const distinct = [...roots];
  return distinct.length === 1 ? distinct[0]! : null;
}

export function useHarnessReport(
  handle: FileSystemDirectoryHandle | null,
  projectSlugs: readonly string[],
  enabled: boolean,
  /** Paths the ontology records; the scan probes a declared scope only when it reaches one. */
  capabilityPaths: readonly string[],
  /** Bumped by the failed state's retry, so a transient bridge error is not a dead end. */
  reloadNonce = 0,
): HarnessReportState {
  const [snapshot, setSnapshot] = useState<HarnessReportSnapshot | null>(null);
  const slugKey = projectSlugs.join('\0');
  const capabilityKey = capabilityPaths.join('\0');
  /* The gate is computed in render and demotes the return value, avoiding a setState cascade. */
  const supported = enabled && !!handle && !!getTauriVaultRootPath(handle);

  useEffect(() => {
    if (!supported || !handle) return;
    let cancelled = false;
    const commit = (state: HarnessReportState) => {
      if (!cancelled) setSnapshot({ handle, slugKey, capabilityKey, reloadNonce, state });
    };
    void (async () => {
      let sourceRoot = '';
      try {
        sourceRoot = (await resolveSourceRoot(handle, slugKey ? slugKey.split('\0') : [])) ?? '';
        if (cancelled) return;
        if (!sourceRoot) {
          commit({ status: 'no-source' });
          return;
        }
        commit({ status: 'loading', sourceRoot, progress: null });
        /* An in-checkout ontology folder is excluded from the document census. */
        const vaultRoot = getTauriVaultRootPath(handle);
        const excludedFolders =
          vaultRoot && vaultRoot.startsWith(`${sourceRoot}/`)
            ? [vaultRoot.slice(sourceRoot.length + 1)]
            : [];
        const report = await scanHarness(bridgePort(sourceRoot), {
          capabilityPaths: capabilityKey ? capabilityKey.split('\0') : [],
          excludedFolders,
          /* Straight through to state; each report already lands on its own task. */
          onProgress: (progress) => {
            commit({ status: 'loading', sourceRoot, progress });
          },
        });
        commit({ status: 'ready', sourceRoot, report });
      } catch (error) {
        commit({
          status: 'failed',
          sourceRoot,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, handle, slugKey, capabilityKey, reloadNonce]);

  if (!supported || !handle) return { status: 'unsupported' };
  const matchesCurrentRequest =
    snapshot?.handle === handle &&
    snapshot.slugKey === slugKey &&
    snapshot.capabilityKey === capabilityKey &&
    snapshot.reloadNonce === reloadNonce;
  return matchesCurrentRequest
    ? snapshot.state
    : { status: 'loading', sourceRoot: '', progress: null };
}
