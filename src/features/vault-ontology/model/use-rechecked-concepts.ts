'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode, useLocalVault } from '@/entities/vault-session';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { gitKnownCommits } from '@/shared/lib/git/tauri-recheck';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { selectOpenVaultHandle } from '@/shared/lib/vault-folder/select-open-vault-handle';

const MARK = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const NO_KNOWN: ReadonlySet<string> = new Set();

/**
 * The map nodes that read current and whose document carries a recheck mark naming a commit this
 * repository has. A mark naming an unknown commit counts as none: it says nothing Git can back.
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
  const hashes = useMemo(() => [...new Set(marks.values())].sort(), [marks]);
  const key = rootPath && hashes.length > 0 ? `${rootPath}\0${hashes.join(',')}` : '';
  const [known, setKnown] = useState<{ key: string; set: ReadonlySet<string> }>({ key: '', set: NO_KNOWN });
  useEffect(() => {
    if (!key || !rootPath) return;
    let live = true;
    void gitKnownCommits(rootPath, hashes)
      .then((answer) => {
        if (live) setKnown({ key, set: new Set(answer ?? []) });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hashes, key, rootPath]);
  const knownSet = known.key === key ? known.set : NO_KNOWN;
  return useMemo(() => recheckedIds(marks, knownSet, current), [current, knownSet, marks]);
}

/** Node id to the commit its document's recheck mark names, for marks shaped like a commit name. */
export function readRecheckMarks(
  nodes: readonly Pick<KnowledgeGraphNode, 'id' | 'evidenceIds'>[],
  docs: readonly { slug: string; frontmatter: Record<string, unknown> }[],
): Map<string, string> {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc.frontmatter.evidence_checked]));
  const found = new Map<string, string>();
  for (const node of nodes) {
    const mark = bySlug.get(node.evidenceIds[0] ?? '');
    if (typeof mark === 'string' && MARK.test(mark)) found.set(node.id, mark);
  }
  return found;
}

export function recheckedIds(
  marks: ReadonlyMap<string, string>,
  known: ReadonlySet<string>,
  current: (id: string) => boolean,
): Set<string> {
  return new Set([...marks].filter(([id, mark]) => known.has(mark) && current(id)).map(([id]) => id));
}
