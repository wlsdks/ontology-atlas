'use client';

import { useEffect, useState } from 'react';

import { scanHarness, type HarnessReport, type HarnessScanProgress } from '@/entities/agent-files';
import { failureCodeOf, failureDetailOf } from '@/shared/lib/failures/failure-code';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source/project-source-store';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';

import { bridgePort } from './bridge-port';

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
  | { status: 'failed'; sourceRoot: string; code: string | null; message: string };

interface HarnessReportSnapshot {
  handle: FileSystemDirectoryHandle;
  slugKey: string;
  capabilityKey: string;
  reloadNonce: number;
  state: HarnessReportState;
}

interface SourceBinding {
  projectSlug: string;
  rootPath: string;
}

/** The one project source bound to this folder; several distinct roots return `null`, not a guess. */
async function resolveSourceBinding(
  handle: FileSystemDirectoryHandle,
  projectSlugs: readonly string[],
): Promise<SourceBinding | null> {
  const store = createVaultFileProjectSourceStore(handle);
  const bound: Array<{ projectSlug: string; roots: string[] }> = [];
  for (const projectSlug of projectSlugs) {
    const result = await store.list(projectSlug);
    if (result.status !== 'ok') continue;
    bound.push({ projectSlug, roots: result.bindings.map((binding) => binding.rootPath) });
  }
  const distinct = [...new Set(bound.flatMap((entry) => entry.roots))];
  if (distinct.length !== 1) return null;
  const rootPath = distinct[0]!;
  const single = bound.find((entry) => entry.roots.length === 1);
  return single ? { projectSlug: single.projectSlug, rootPath } : null;
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
        const binding = await resolveSourceBinding(handle, slugKey ? slugKey.split('\0') : []);
        sourceRoot = binding?.rootPath ?? '';
        if (cancelled) return;
        if (!binding) {
          commit({ status: 'no-source' });
          return;
        }
        commit({ status: 'loading', sourceRoot, progress: null });
        /* An in-checkout ontology folder is excluded from the document census. */
        const vaultRoot = getTauriVaultRootPath(handle) ?? '';
        const excludedFolders =
          vaultRoot.startsWith(`${sourceRoot}/`)
            ? [vaultRoot.slice(sourceRoot.length + 1)]
            : [];
        const report = await scanHarness(bridgePort({ vaultRoot, projectSlug: binding.projectSlug }), {
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
          code: failureCodeOf(error),
          message: failureDetailOf(error) ?? String(error),
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
