'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildEvidenceConcepts, resolveEvidenceStates } from '@/shared/lib/evidence-states';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import { gitBoundEvidenceDates, isGitBridgeAvailable, type BoundEvidenceDates, type GitPathLastChange } from '@/shared/lib/tauri-git';
import { pickTauriSourceDirectory } from '@/shared/lib/tauri-vault-fs';

type Status = BoundEvidenceDates['status'] | 'reading' | 'app-only' | 'no-source' | 'no-anchors';
type ChangeMap = ReadonlyMap<string, GitPathLastChange>;

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
  const scope = useMemo(() => ({ nativeRootPath, reloadToken, handle, projectKey, concepts, enabled }), [nativeRootPath, reloadToken, handle, projectKey, concepts, enabled]);
  const [attempt, setAttempt] = useState<{ scope: object; selectedPath?: string } | null>(null);
  const key = useMemo(() => ({ scope, attempt }), [scope, attempt]);
  const [snapshot, setSnapshot] = useState<{ key: object; status: Status; changes: ChangeMap | null; sourceChanges: ChangeMap | null } | null>(null);
  const supported = enabled && handle !== null && nativeRootPath !== null && isGitBridgeAvailable();
  useEffect(() => {
    if (!supported || !handle || !nativeRootPath) return;
    let cancelled = false;
    const commit = (status: Status, changes: ChangeMap | null = null, sourceChanges: ChangeMap | null = null) => {
      if (!cancelled) setSnapshot({ key, status, changes, sourceChanges });
    };
    void (async () => {
      try {
        const projects = projectKey.split('\0').filter(Boolean);
        if (projects.length !== 1) return commit(projects.length ? 'ambiguous-source' : 'no-source');
        const store = createVaultFileProjectSourceStore(handle);
        const source = await store.read();
        if (cancelled) return;
        if (source.status === 'malformed' || source.status === 'unavailable') return commit('unreadable');
        const bindings = source.bindings.filter(binding => binding.projectSlug === projects[0]);
        if (!bindings.length) return commit('no-source');
        if (bindings.length !== 1) return commit('ambiguous-source');
        const sourcePaths = [...new Set(concepts.flatMap(concept => concept.evidencePaths))];
        if (!sourcePaths.length) return commit('no-anchors');
        const vaultPaths = concepts.flatMap(concept => concept.docPath ? [concept.docPath] : []);
        const result = await gitBoundEvidenceDates(nativeRootPath, projects[0], vaultPaths, sourcePaths, attempt?.scope === scope ? attempt.selectedPath : undefined);
        if (!result) return commit('unreadable');
        const latest = await store.read();
        if (cancelled) return;
        const latestBindings = latest.bindings.filter(binding => binding.projectSlug === projects[0]);
        if (latest.status !== 'ok' || latestBindings.length !== 1 || JSON.stringify(latestBindings[0]) !== JSON.stringify(bindings[0])) return commit('binding-changed');
        if (result.status !== 'measured' && result.status !== 'partial') return commit(result.status);
        commit(result.status, new Map(result.vaultChanges.map(row => [row.path, row])), new Map(result.sourceChanges.map(row => [row.path, row])));
      } catch {
        commit('unreadable');
      }
    })();
    return () => { cancelled = true; };
  }, [supported, handle, nativeRootPath, concepts, projectKey, key, scope, attempt]);
  const current = supported && snapshot?.key === key ? snapshot : null;
  const evidence = useMemo(() => current?.changes && current.sourceChanges ? resolveEvidenceStates(concepts, current.changes, current.sourceChanges) : null, [current, concepts]);
  const retry = useCallback(() => setAttempt({ scope }), [scope]);
  const chooseSourceFolder = useCallback(async (title: string) => {
    try {
      const selectedPath = await pickTauriSourceDirectory(title);
      if (selectedPath) setAttempt({ scope, selectedPath });
    } catch {
      setSnapshot({ key, status: 'unreadable', changes: null, sourceChanges: null });
    }
  }, [scope, key]);
  return {
    status: (!isGitBridgeAvailable() ? 'app-only' : !supported ? 'unreadable' : current?.status ?? 'reading') as Status,
    evidence,
    // Brief document dates use vault coordinates only.
    changes: current?.changes ?? null,
    retry,
    chooseSourceFolder,
  };
}
