import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';

/**
 * Ordering contract for the docs sidebar tree: `group` (folders or documents first) and `sort`
 * (order within a group) are separate axes so combinations stay expressible. Kept in the URL for
 * shareable handoff; defaults are omitted and unknown values fall back to the default.
 */

export const DOCS_TREE_SORTS = ['name', 'recent'] as const;

export type DocsTreeSort = (typeof DOCS_TREE_SORTS)[number];

export const DEFAULT_DOCS_TREE_SORT: DocsTreeSort = 'name';

export const DOCS_TREE_GROUPS = ['folders', 'docs'] as const;

export type DocsTreeGroup = (typeof DOCS_TREE_GROUPS)[number];

/** Folders first by default; "mixed" is not offered. */
export const DEFAULT_DOCS_TREE_GROUP: DocsTreeGroup = 'folders';

export function parseDocsTreeSort(raw: string | null | undefined): DocsTreeSort {
  if (!raw) return DEFAULT_DOCS_TREE_SORT;
  return DOCS_TREE_SORTS.find((sort) => sort === raw) ?? DEFAULT_DOCS_TREE_SORT;
}

export function serializeDocsTreeSort(sort: DocsTreeSort): string | null {
  return sort === DEFAULT_DOCS_TREE_SORT ? null : sort;
}

export function parseDocsTreeGroup(raw: string | null | undefined): DocsTreeGroup {
  if (!raw) return DEFAULT_DOCS_TREE_GROUP;
  return DOCS_TREE_GROUPS.find((group) => group === raw) ?? DEFAULT_DOCS_TREE_GROUP;
}

export function serializeDocsTreeGroup(group: DocsTreeGroup): string | null {
  return group === DEFAULT_DOCS_TREE_GROUP ? null : group;
}

/** Tree node path → last modified time (ms). A folder takes the newest of the documents it holds. */
type DocsTreeRecencyIndex = ReadonlyMap<string, number>;

function parseUpdatedAt(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * One pass over the tree for modification times from the manifest, instead of lookups inside the
 * comparator. A folder uses its newest document's time.
 */
export function buildDocsTreeRecencyIndex(
  tree: VaultTreeNode,
  docsBySlug: ReadonlyMap<string, Pick<VaultDoc, 'updatedAt'>>,
): Map<string, number> {
  const recency = new Map<string, number>();

  const visit = (node: VaultTreeNode): number => {
    if (node.type === 'doc') {
      const updatedAt = node.slug ? docsBySlug.get(node.slug)?.updatedAt : undefined;
      const value = parseUpdatedAt(updatedAt);
      recency.set(node.path, value);
      return value;
    }
    let newest = 0;
    for (const child of node.children ?? []) {
      newest = Math.max(newest, visit(child));
    }
    recency.set(node.path, newest);
    return newest;
  };

  visit(tree);
  return recency;
}

function label(node: VaultTreeNode): string {
  return node.title ?? node.name;
}

export interface DocsTreeOrder {
  sort: DocsTreeSort;
  group: DocsTreeGroup;
  /** Without it, a request for recency order falls back to name order (better than an empty list). */
  recency?: DocsTreeRecencyIndex;
}

/**
 * Sorts one folder's children without touching `manifest.tree`, which several screens share. Group
 * always applies before sort.
 */
export function sortDocsTreeNodes(
  nodes: readonly VaultTreeNode[],
  { sort, group, recency }: DocsTreeOrder,
): VaultTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      const foldersFirst = group === 'folders';
      const aIsDir = a.type === 'dir';
      return aIsDir === foldersFirst ? -1 : 1;
    }
    if (sort === 'recent' && recency) {
      const delta = (recency.get(b.path) ?? 0) - (recency.get(a.path) ?? 0);
      if (delta !== 0) return delta;
    }
    return label(a).localeCompare(label(b), 'ko');
  });
}
