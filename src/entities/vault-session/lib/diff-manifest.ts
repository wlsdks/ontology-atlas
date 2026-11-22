import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';

/**
 * Classifies a polling result into added and modified slugs from (slug, mtime|null) maps: absent
 * from prev is added; a larger non-null mtime is modified. A null mtime on either side skips
 * modified. Removals are excluded: explicit deletes raise their own toast.
 */
export function diffVaultManifest(
  prev: Map<string, number | null>,
  current: Map<string, number | null>,
): { added: string[]; modified: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  for (const [slug, mtime] of current) {
    const prevMtime = prev.get(slug);
    if (prevMtime === undefined) {
      added.push(slug);
      continue;
    }
    if (prevMtime !== null && mtime !== null && mtime > prevMtime) {
      modified.push(slug);
    }
  }
  return { added, modified };
}

/** Not finished into a string here: this helper sits outside React and cannot reach `useTranslations`; the caller (`VaultDiffToaster`) assembles the localized text from the kind plus name or count. */
type VaultDiffToastKind = 'added' | 'edited' | 'removed' | 'digest';

/**
 * `kind` stays undefined when the manifest lacks it; `name` is `display_<locale>`, `title`,
 * then the slug tail. A folder path never enters `name`; `slug` is for off-screen uses only.
 */
export type VaultDiffNode = {
  slug: string;
  kind?: string;
  name: string;
};

type VaultDiffKindCount = { kind?: string; count: number };

export type VaultDiffActionCount = {
  total: number;
  /** An empty array when the total is 0; otherwise at least one row. */
  byKind: VaultDiffKindCount[];
};

/** Each action is counted separately. Additions and edits split by kind; deletions are a number only: a deleted document is gone from the manifest, so the count comes from the activity log's `delete_concept` entries. */
type VaultDiffDigestCounts = {
  added: VaultDiffActionCount;
  modified: VaultDiffActionCount;
  removed: number;
};

export type VaultDiffToast = {
  kind: VaultDiffToastKind;
  node?: VaultDiffNode;
  counts?: VaultDiffDigestCounts;
  variant: 'info' | 'success';
};

/** The single path by which a slug can reach the screen. Name priority: `display_<locale>` → `title` → the slug's last segment; a folder name such as `capabilities/` is never prefixed. */
export function toVaultDiffNode(
  doc: {
    slug: string;
    title?: string;
    frontmatter?: Record<string, unknown> | null;
  },
  locale?: string,
): VaultDiffNode {
  const tail = doc.slug.split('/').pop() || doc.slug;
  const title = typeof doc.title === 'string' ? doc.title.trim() : '';
  const name = resolveLocaleDisplayName(doc.frontmatter, locale, title || tail);
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === 'string' && rawKind.trim() ? rawKind.trim() : undefined;
  return { slug: doc.slug, kind, name: name.trim() || tail };
}

/** The unknown share is one final row: mixing it in would make "3 capabilities" possibly mean 4, and dropping it would break the total. */
function countByKind(nodes: VaultDiffNode[]): VaultDiffActionCount {
  const byKind = new Map<string, number>();
  let untyped = 0;
  for (const node of nodes) {
    if (!node.kind) {
      untyped += 1;
      continue;
    }
    byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
  }
  const rows: VaultDiffKindCount[] = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => ({ kind, count }));
  if (untyped > 0) rows.push({ count: untyped });
  return { total: nodes.length, byKind: rows };
}

/**
 * A rename or merge looks like one deletion plus one addition in a slug set, so the caller
 * counts deletions from `delete_concept` entries in `.ontology-atlas/activity.jsonl`.
 * One toast per burst; names are listed up to `previewLimit`.
 */
export function planVaultDiffToasts(
  diff: { added: VaultDiffNode[]; modified: VaultDiffNode[]; removed?: number },
  previewLimit = 3,
): VaultDiffToast[] {
  const limit = Math.max(0, previewLimit);
  const removed = Math.max(0, diff.removed ?? 0);
  const total = diff.added.length + diff.modified.length + removed;
  if (total === 0) return [];

  // For a small change, names beat numbers. But once a deletion is mixed in, names cannot be given
  // (a deleted document is gone from the manifest, leaving nowhere to read a name), so it goes to
  // the digest.
  if (total <= limit && removed === 0) {
    return [
      ...diff.added.map((node): VaultDiffToast => ({ kind: 'added', node, variant: 'info' })),
      ...diff.modified.map((node): VaultDiffToast => ({ kind: 'edited', node, variant: 'success' })),
    ];
  }

  return [
    {
      kind: 'digest',
      counts: {
        added: countByKind(diff.added),
        modified: countByKind(diff.modified),
        removed,
      },
      variant: 'info',
    },
  ];
}
