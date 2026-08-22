import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

/**
 * Classifies a vault polling result into *added* and *modified*. A pure helper with no React
 * dependency, called by `VaultDiffToaster`.
 *
 * Input: the previous and current manifests as (slug, mtime|null) maps.
 * Output: newly appeared slugs, and slugs whose mtime changed.
 *
 * Policy:
 *   - a slug absent from prev → added
 *   - the same slug with a non-null mtime on both sides and current > prev → modified
 *   - a null mtime on either side (a static manifest) makes the comparison meaningless, so the
 *     modified verdict is skipped (blocking false positives)
 *   - removals are deliberately excluded — an explicit user action (`delete_concept` and the like)
 *     raises its own toast, and repeating it from a polling result is noise
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
export type VaultDiffToastKind = 'added' | 'edited' | 'removed' | 'digest';

/**
 * **The contract that a toast never speaks a slug** (owner instruction, 2026-08-01).
 *
 * It used to say `편집됨: capabilities/payment-authorization`. That line gives a user close to zero
 * information — `capabilities/` is a developer folder name and `payment-authorization` is a file
 * name, not what a person calls that concept (vault nodes carry `display_ko`/`display_en`, and the
 * map, INDEX, and popovers already render those — only the toast used the raw slug).
 *
 * So this type pins the three pieces that reach the screen:
 *   - `kind` — the raw kind, to be rendered in plain words. **Left `undefined` when the manifest
 *     does not have it. Never invented.**
 *   - `name` — what a person calls it: `display_<locale>` → `title` → the slug's tail.
 *     **A folder path never enters here under any circumstance** (`toVaultDiffNode` takes only the
 *     last segment).
 *   - `slug` — kept only for off-screen uses (deeplinks, deduplication).
 */
export type VaultDiffNode = {
  slug: string;
  kind?: string;
  name: string;
};

/** Per-kind counts within one action (added/edited). A row with no `kind` is the unknown share. */
export type VaultDiffKindCount = { kind?: string; count: number };

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
export type VaultDiffDigestCounts = {
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
 * **What lasts longest has to say the most** (verdict, 2026-08-01).
 *
 * The previous version emitted the first three as slugs and the rest as a **separate toast** reading
 * `+N more`. Toasts expire independently, so when the earlier ones went first **only a number with
 * nothing to refer to remained on screen** — the owner caught exactly that state (a lone "+4 more").
 * When an agent writes 34 at once, the residue reads "+31 more".
 *
 * So the fan-out is dropped in favour of **one toast per burst**. It has to say **what changed**
 * rather than how many, so it is not folded into a total: additions, edits, and deletions are
 * counted separately. When the total is small (≤ `previewLimit`) names beat numbers, and the slugs
 * are emitted as before.
 *
 * **Why the deletion count is not computed here.** The manifest is a set of slugs, so **a rename
 * looks like "1 deleted + 1 added"** (measured 2026-08-01: `appointment-booking` →
 * `appointment-booking-renamed` was exactly that shape, and files holding backlinks were caught as
 * "edited" for good measure). A merge is the same. So deletions alone are **counted by the caller
 * from the `delete_concept` entries in `.ontology-atlas/activity.jsonl`** — a tool name knows the
 * intent, a slug set does not.
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
