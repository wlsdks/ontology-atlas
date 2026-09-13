import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

import {
  captureTaskBaseline,
  type AcpTurnStart,
  type TaskBaselineCaptureResult,
  type TaskBaselineSourceInspection,
} from '@/features/acp-session';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { createVaultFileProjectSourceStore, type ProjectSourceStore } from '@/shared/lib/project-source-store';
import { inspectTauriProjectSource, type ProjectSourceInspection } from '@/shared/lib/tauri-vault-fs';

const TASK_REVIEW_ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

interface TaskReviewBaselineState {
  handle: FileSystemDirectoryHandle | null;
  vaultRoot: string | null;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  nodes: readonly KnowledgeGraphNode[];
  projectSlug: string | null;
}

interface TaskReviewBaselineRuntime {
  capture?: typeof captureTaskBaseline;
  createSourceStore?: (handle: FileSystemDirectoryHandle) => ProjectSourceStore;
  inspectSource?: (rootPath: string) => Promise<ProjectSourceInspection | null>;
}

function baselineSlugs(nodes: readonly KnowledgeGraphNode[]): string[] {
  return [...new Set(nodes.flatMap((node) => {
    if (!TASK_REVIEW_ONTOLOGY_KINDS.has(node.kind) || node.hasOwnDocument === false) return [];
    const slug = node.agentSlug?.trim();
    return slug ? [slug] : [];
  }))].sort();
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((slug, index) => slug === right[index]);
}

/** Capture one immutable pre-turn basis while rejecting any vault, graph, or source drift. */
export async function captureTaskReviewBaseline(
  captured: TaskReviewBaselineState,
  current: () => TaskReviewBaselineState,
  runtime: TaskReviewBaselineRuntime = {},
): Promise<TaskBaselineCaptureResult> {
  const capture = runtime.capture ?? captureTaskBaseline;
  const slugs = baselineSlugs(captured.nodes);
  const capturedHandles = new Map(slugs.flatMap((slug) => {
    const handle = captured.fileHandles.get(slug);
    return handle ? [[slug, handle] as const] : [];
  }));
  let sourceContextChanged = false;

  const isCurrent = () => {
    const live = current();
    if (sourceContextChanged || live.handle !== captured.handle || live.vaultRoot !== captured.vaultRoot) return false;
    if (live.fileHandles !== captured.fileHandles || live.projectSlug !== captured.projectSlug) return false;
    if (!sameScope(slugs, baselineSlugs(live.nodes))) return false;
    return slugs.every((slug) => live.fileHandles.get(slug) === capturedHandles.get(slug));
  };

  let inspectSource: (() => Promise<TaskBaselineSourceInspection | null>) | undefined;
  if (captured.handle && captured.projectSlug) {
    const store = (runtime.createSourceStore ?? createVaultFileProjectSourceStore)(captured.handle);
    const inspect = runtime.inspectSource ?? inspectTauriProjectSource;
    inspectSource = async () => {
      const before = await store.list(captured.projectSlug!);
      if (!isCurrent() || before.status !== 'ok' || before.bindings.length !== 1) return null;
      const binding = before.bindings[0]!;
      const observation = await inspect(binding.rootPath);
      if (!isCurrent()) return null;
      const after = await store.list(captured.projectSlug!);
      if (!isCurrent() || after.status !== 'ok' || after.bindings.length !== 1) return null;
      const rebound = after.bindings[0]!;
      if (rebound.rootPath !== binding.rootPath || rebound.sourceId !== binding.sourceId ||
          rebound.kind !== binding.kind || rebound.boundAt !== binding.boundAt) {
        sourceContextChanged = true;
        return null;
      }
      if (!observation || observation.truncated || observation.rootPath !== binding.rootPath ||
          observation.sourceId !== binding.sourceId || observation.kind !== binding.kind) return null;
      return observation;
    };
  }

  return capture({
    vaultId: captured.vaultRoot ?? captured.handle?.name ?? 'unknown-vault',
    slugs,
    fileHandles: capturedHandles,
    isCurrent,
    inspectSource,
  });
}

export function useTaskReviewBaseline(state: TaskReviewBaselineState) {
  const currentRef = useRef(state);
  useLayoutEffect(() => { currentRef.current = state; }, [state]);
  const capturedState = useMemo(() => ({
    handle: state.handle,
    vaultRoot: state.vaultRoot,
    fileHandles: state.fileHandles,
    nodes: state.nodes,
    projectSlug: state.projectSlug,
  }),
    [state.fileHandles, state.handle, state.nodes, state.projectSlug, state.vaultRoot]);
  return useCallback(
    async (_turn: AcpTurnStart) => captureTaskReviewBaseline(capturedState, () => currentRef.current),
    [capturedState],
  );
}
