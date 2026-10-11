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

/**
 * The toast text is not finished into a string here because this file is a pure helper outside
 * React and cannot reach next-intl's `useTranslations`. It passes the kind plus the name or count
 * in structured form, and the caller (`VaultDiffToaster`, a React component) assembles the localized
 * text with `t('featuresMisc.vaultDiffToaster.*')` — so a hardcoded English literal like
 * "Added: domains/refunds" cannot leak again.
 */
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

/** Per-kind counts within one action (added/edited). A row with no `kind` is the unknown share. */
type VaultDiffKindCount = { kind?: string; count: number };

export type VaultDiffActionCount = {
  total: number;
  /** An empty array when the total is 0; otherwise at least one row. */
  byKind: VaultDiffKindCount[];
};

/**
 * Digest only — each of the three actions is counted separately rather than folded into one total.
 *
 * Additions and edits can read their kind from the manifest, so they are split by kind ("3
 * capabilities · 12 elements added" beats "15 added"). **Deletions are a number only** — a deleted
 * document is gone from the manifest, leaving nowhere to read its kind, and even the count comes
 * from the activity log's `delete_concept` entries (see the note below).
 */
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

/**
 * A manifest row → the pieces that can go on screen. **This is the single path by which a slug can
 * reach the screen at all.**
 *
 * Name priority: `display_<locale>` → `title` → the slug's **last segment**. The third is a last
 * resort, and even then a folder name such as `capabilities/` is never prefixed. (Reaching the
 * third is rare in practice — the manifest's own `title` is already filled from frontmatter title →
 * first H1 → slug tail.)
 */
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

/**
 * Per-kind counts. The unknown share is collected into **one final row** — mixing it in would make
 * "3 capabilities" possibly mean 4, and dropping it would break the total.
 */
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
