'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { gitRecheckMarksHold } from '@/shared/lib/git/tauri-recheck';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { selectOpenVaultHandle } from '@/shared/lib/vault-folder/select-open-vault-handle';

const MARK = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const NONE: ReadonlySet<string> = new Set();

/**
 * The map nodes that read current and whose document carries a recheck mark that still stands:
 * it names a commit this repository has, and the document differs from that commit's text only
 * by the mark. A mark naming an unknown commit, or one on a document a person edited after the
 * recheck, counts as none (`git_recheck_marks_hold`).
 */
export function useRecheckedConcepts({
  nodes,
  current,
}: {
  nodes: readonly KnowledgeGraphNode[] | null | undefined;
  /** Node ids the evidence walk measured as current. */
  current: (id: string) => boolean;
}): Set<string> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const handle = mode === 'local' ? selectOpenVaultHandle(vault.status, vault.handle) : null;
  const rootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const docs = mode === 'local' ? vault.manifest?.docs : null;
  const marks = useMemo(() => readRecheckMarks(nodes ?? [], docs ?? []), [docs, nodes]);
  const asked = useMemo(() => [...marks.values()].sort((a, b) => (a.path < b.path ? -1 : 1)), [marks]);
  const key = rootPath && asked.length > 0 ? `${rootPath}\0${asked.map((mark) => `${mark.path}@${mark.mark}`).join(',')}` : '';
  const [standing, setStanding] = useState<{ key: string; set: ReadonlySet<string> }>({ key: '', set: NONE });
  useEffect(() => {
    if (!key || !rootPath) return;
    let live = true;
    void gitRecheckMarksHold(rootPath, asked)
      .then((answer) => {
        if (live) setStanding({ key, set: new Set(answer ?? []) });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [asked, key, rootPath]);
  const standingSet = standing.key === key ? standing.set : NONE;
  return useMemo(() => recheckedIds(marks, standingSet, current), [current, standingSet, marks]);
}

/** Node id to its document and the commit the document's recheck mark names, for marks shaped like a commit name. */
export function readRecheckMarks(
  nodes: readonly Pick<KnowledgeGraphNode, 'id' | 'evidenceIds'>[],
  docs: readonly { slug: string; frontmatter: Record<string, unknown> }[],
): Map<string, { path: string; mark: string }> {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const found = new Map<string, { path: string; mark: string }>();
  for (const node of nodes) {
    const doc = bySlug.get(node.evidenceIds[0] ?? '');
    const mark = doc?.frontmatter.evidence_checked;
    if (doc && typeof mark === 'string' && MARK.test(mark)) found.set(node.id, { path: `${doc.slug}.md`, mark });
  }
  return found;
}

/** Of the marked nodes, those whose document's mark stands and which read current. */
export function recheckedIds(
  marks: ReadonlyMap<string, { path: string; mark: string }>,
  standing: ReadonlySet<string>,
  current: (id: string) => boolean,
): Set<string> {
  return new Set([...marks].filter(([id, mark]) => standing.has(mark.path) && current(id)).map(([id]) => id));
}
