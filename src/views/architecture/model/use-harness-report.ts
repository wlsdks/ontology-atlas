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
 * **Why this reads through the installed app's bridge and nowhere else.**
 *
 * Almost the whole harness lives in dot directories — `.claude/rules`, `.claude/skills`,
 * `.agents/`, `.codex/`. The browser's File System Access API cannot see a dot entry at all, which
 * is why the docs sidebar's agent-file list, reading through that API, shows the handful of visible
 * root files and nothing else. A screen that claims to inventory the harness while silently missing
 * `.claude/` would be worse than no screen. So the browser gets a degradation card naming what it
 * cannot reach, and the reading happens through `list_vault_directory` / `read_vault_text_file`,
 * which can.
 *
 * The repository read is the **connected project source**, not the ontology folder. Those are
 * routinely different — Atlas's own vault is `docs/ontology` inside the checkout — and the harness
 * belongs to the repository the agents edit.
 */

export type HarnessReportState =
  | { status: 'unsupported' }
  | { status: 'no-source' }
  | { status: 'loading'; sourceRoot: string; progress: HarnessScanProgress | null }
  | { status: 'ready'; sourceRoot: string; report: HarnessReport }
  | { status: 'failed'; sourceRoot: string; message: string };

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

/**
 * The one project source bound to this folder, or `null`.
 *
 * More than one distinct root is deliberately not a guess: a folder describing two repositories has
 * two harnesses, and picking one would put the wrong repository's files under a title that names
 * neither. The screen says a source is not connected instead.
 */
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
  /**
   * Implementation paths the ontology records. The scan probes a declared scope against the disk
   * only when it reaches one of these, so an empty list means the coverage pass costs nothing.
   */
  capabilityPaths: readonly string[],
  /** Bumped by the failed state's retry, so a transient bridge error is not a dead end. */
  reloadNonce = 0,
): HarnessReportState {
  const [state, setState] = useState<HarnessReportState>({ status: 'unsupported' });
  const slugKey = projectSlugs.join('\0');
  const capabilityKey = capabilityPaths.join('\0');
  /*
   * The gate is computed in render, not written from the effect. When it closes the return value is
   * demoted rather than the state being cleared — the same shape `useAgentFilesModel` uses, and the
   * reason is the same: a synchronous setState inside an effect body cascades renders.
   */
  const supported = enabled && !!handle && !!getTauriVaultRootPath(handle);

  useEffect(() => {
    if (!supported || !handle) return;
    let cancelled = false;
    void (async () => {
      const sourceRoot = await resolveSourceRoot(handle, slugKey ? slugKey.split('\0') : []);
      if (cancelled) return;
      if (!sourceRoot) {
        setState({ status: 'no-source' });
        return;
      }
      setState({ status: 'loading', sourceRoot, progress: null });
      try {
        /*
         * The ontology folder is excluded from the document census when it lives inside the
         * checkout, as Atlas's own does: those files are the graph an agent reads over MCP, not
         * documentation somebody forgot to link, and counting them would put hundreds of nodes in
         * the "nothing names this" row and drown the documents that belong there.
         */
        const vaultRoot = getTauriVaultRootPath(handle);
        const excludedFolders =
          vaultRoot && vaultRoot.startsWith(`${sourceRoot}/`)
            ? [vaultRoot.slice(sourceRoot.length + 1)]
            : [];
        const report = await scanHarness(bridgePort(sourceRoot), {
          capabilityPaths: capabilityKey ? capabilityKey.split('\0') : [],
          excludedFolders,
          /*
           * Straight through to state. The scan awaits a bridge call between every report, so each
           * one lands on its own task and React paints it — no throttling is needed, and adding one
           * would make the screen claim a pass had lasted longer than it did.
           */
          onProgress: (progress) => {
            if (!cancelled) setState({ status: 'loading', sourceRoot, progress });
          },
        });
        if (!cancelled) setState({ status: 'ready', sourceRoot, report });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'failed',
            sourceRoot,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, handle, slugKey, capabilityKey, reloadNonce]);

  return supported ? state : { status: 'unsupported' };
}
