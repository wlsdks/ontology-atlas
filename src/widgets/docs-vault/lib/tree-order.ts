import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';

/**
 * The ordering contract for the document list (the docs-vault sidebar tree).
 *
 * ## Why two axes
 *
 * Owner observation: *"It would be good to have sort conditions like folders-separated
 * or documents-first."* (it would be good to have sort conditions like folders-separated
 * or documents-first).
 *
 * Measuring the dogfood vault (158 documents) shows why. The top-level `docs`
 * folder draws its 6 folders and 30 documents **mixed into one alphabetical run**,
 * so the `ontology` folder holding 96 nodes sits 23rd of 36 rows, buried between
 * "npm publish" and "Product Plan v9". Finding a folder means filtering 30 documents by
 * eye.
 *
 * So the axes are split. They answer different questions:
 *
 * - **group** — *which* to show first, folders or documents
 * - **sort** — in *what order* within the same group
 *
 * Mixed into one dropdown, a combination like "folders first + recently modified"
 * cannot be expressed, the value count grows to 4, and the user has to make two
 * decisions at once.
 *
 * ## Why the URL
 *
 * This app keeps session state in the URL (`?slug=` · `?view=` · `?tab=`), because
 * it is shareable and an agent can read and reproduce it. If sort were hidden
 * state, "what order was I looking at" would drop out of the handoff.
 *
 * Defaults **omit** the parameter — a short link is easier to paste. An unknown
 * value is not an error but the default (a shared link gets edited in other hands).
 */

export const DOCS_TREE_SORTS = ['name', 'recent'] as const;

export type DocsTreeSort = (typeof DOCS_TREE_SORTS)[number];

export const DEFAULT_DOCS_TREE_SORT: DocsTreeSort = 'name';

export const DOCS_TREE_GROUPS = ['folders', 'docs'] as const;

export type DocsTreeGroup = (typeof DOCS_TREE_GROUPS)[number];

/**
 * Folders first by default — Finder, VS Code and Obsidian all do that, and the
 * mixed drawing up to now is closer to a defect. "Mixed" is not offered as a value.
 */
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
 * Compute the whole tree's modification times in one pass.
 *
 * `VaultTreeNode` does not carry a modification time, so the manifest (`docsBySlug`)
 * has to be consulted. Looking it up inside the comparator would repeat O(n log n)
 * map lookups and date parses per sort, so the tree is walked once and folded per
 * path.
 *
 * A folder uses **the newest of the documents it holds**. The folder's own mtime is
 * not in the manifest, and even if it were, the documents say more accurately "what
 * happened in here".
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
 * Sort one folder's children. The source array is not touched — `manifest.tree` is
 * read-only data shared by several screens.
 *
 * Group always comes before sort. If choosing "recently modified + folders first"
 * dropped an old folder below a recent document, the two axes would collapse into one.
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
