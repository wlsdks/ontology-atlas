'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildEvidenceConcepts, resolveEvidenceStates } from '@/shared/lib/evidence-states';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import { gitPathsLastChange, gitStatus, isGitBridgeAvailable, type GitPathLastChange } from '@/shared/lib/tauri-git';

type Status = 'reading' | 'measured' | 'app-only' | 'no-source' | 'ambiguous-source' | 'different-source' | 'no-anchors' | 'unreadable';

/** Shared ontology-only read; it never starts Wiki hashing, harness scanning, or source writes. */
export function useOntologyEvidence({ docs, nodes, handle, projectSlugs, nativeRootPath, reloadToken, enabled }: {
  docs: readonly VaultDoc[];
  nodes: readonly { id: string; docSlug?: string | null }[];
  handle: FileSystemDirectoryHandle | null;
  projectSlugs: readonly string[];
  nativeRootPath: string | null;
  reloadToken: unknown;
  enabled: boolean;
}) {
  const concepts = useMemo(() => buildEvidenceConcepts(docs, nodes), [docs, nodes]);
  const projectKey = projectSlugs.join('\0');
  const key = useMemo(() => ({ nativeRootPath, reloadToken, handle, projectKey, concepts, enabled }), [nativeRootPath, reloadToken, handle, projectKey, concepts, enabled]);
  const [snapshot, setSnapshot] = useState<{ key: object; status: Status; changes: ReadonlyMap<string, GitPathLastChange> | null } | null>(null);
  const supported = enabled && handle !== null && nativeRootPath !== null && isGitBridgeAvailable();
  useEffect(() => {
    if (!supported || !handle || !nativeRootPath) return;
    let cancelled = false;
    const commit = (status: Status, changes: ReadonlyMap<string, GitPathLastChange> | null = null) => {
      if (!cancelled) setSnapshot({ key, status, changes });
    };
    void (async () => {
      try {
        const source = await createVaultFileProjectSourceStore(handle).read();
        if (cancelled) return;
        if (source.status === 'malformed' || source.status === 'unavailable') return commit('unreadable');
        const projects = new Set(projectKey.split('\0').filter(Boolean));
        const roots = new Set(source.bindings.filter(binding => projects.has(binding.projectSlug)).map(binding => binding.rootPath));
        if (roots.size === 0) return commit('no-source');
        if (roots.size !== 1) return commit('ambiguous-source');
        const git = await gitStatus(nativeRootPath);
        if (cancelled) return;
        if (!git?.repoRoot) return commit('unreadable');
        // The existing Git walk resolves implementation paths against the vault's repository.
        // A separately bound source cannot be judged by that repository's dates.
        const normalize = (path: string) => path.replace(/\/+$/, '');
        if (normalize(git.repoRoot) !== normalize([...roots][0])) return commit('different-source');
        const repoPaths = [...new Set(concepts.flatMap(concept => concept.evidencePaths))];
        if (repoPaths.length === 0) return commit('no-anchors');
        const vaultPaths = concepts.flatMap(concept => concept.docPath ? [concept.docPath] : []);
        const rows = await gitPathsLastChange(nativeRootPath, repoPaths, vaultPaths);
        if (rows === null) return commit('unreadable');
        commit('measured', new Map(rows.map(row => [row.path, row])));
      } catch {
        commit('unreadable');
      }
    })();
    return () => { cancelled = true; };
  }, [supported, handle, nativeRootPath, concepts, projectKey, key]);
  const current = supported && snapshot?.key === key ? snapshot : null;
  const evidence = useMemo(() => current?.changes ? resolveEvidenceStates(concepts, current.changes) : null, [current, concepts]);
  return {
    status: (!isGitBridgeAvailable() ? 'app-only' : !supported ? 'unreadable' : current?.status ?? 'reading') as Status,
    evidence,
    changes: current?.changes ?? null,
  };
}
