'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { useToast } from '@/shared/ui/toast';
import {
  diffVaultManifest,
  planVaultDiffToasts,
  toVaultDiffNode,
  type VaultDiffActionCount,
  type VaultDiffToast,
} from '../lib/diff-manifest';
import { useLocalVault } from './local-vault-context';

/**
 * Visual notification of vault polling results — changes detected by polling are surfaced as a
 * toast on whichever page is open.
 *
 * Behaviour:
 *   - mounted inside `LocalVaultProvider`, tracking the (slug, mtime) map of `manifest.docs`
 *   - the first mount records a baseline only (blocking false positives)
 *   - thereafter: a new slug → added; the same slug with a newer mtime → modified
 *   - one toast per burst (the fan-out was dropped — see the `diff-manifest.ts` comment)
 *   - text is assembled per locale from `featuresMisc.vaultDiffToaster.*`. `diffVaultManifest` and
 *     `planVaultDiffToasts` are pure helpers returning structure only, so the strings are finished
 *     here with `useTranslations`
 *
 * ## A notification has to carry information (owner instruction, 2026-08-01)
 *
 * The old text was `edited: capabilities/payment-authorization`. Four things were missing at once:
 * ① `capabilities/` is a developer folder name, not words for a screen; ② a slug is not what a
 * person calls the concept (`display_<locale>` exists, and only the toast ignored it); ③ it never
 * said what kind of thing changed; ④ "edited" states that an event occurred, which is not information.
 *
 * So what reaches the screen is three parts — *kind (in plain words) + event + human name* — as in
 * **"Capability edited — Payment authorization"**. For several at once it counts by kind:
 * "3 capabilities · 12 elements added". **When the kind cannot be obtained it is not invented** —
 * the text becomes "Added — name", and the digest counts them honestly as "N other".
 *
 * Deletion detection is excluded here: an explicit user action is more valuable as its own toast
 * (a command like delete_concept raises one), and repeating it from a polling result is noise.
 */
export function VaultDiffToaster() {
  const { status, manifest, consumeSelfWrittenSlugs, agentActivityLog } = useLocalVault();
  const toast = useToast();
  const t = useTranslations('featuresMisc.vaultDiffToaster');
  const kindLabel = useOntologyKindLabel();
  const locale = useLocale();
  const prevMapRef = useRef<Map<string, number | null> | null>(null);
  /**
   * When the previous diff was seen — only `delete_concept` entries inside this window belong to
   * this burst. Calling `Date.now()` during render would be impure (`react-hooks/purity`), so it is
   * filled inside the effect when the first baseline is stored.
   */
  const prevSeenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'loaded' || !manifest) return;

    type DocLite = {
      slug: string;
      mtime?: number;
      title?: string;
      frontmatter?: Record<string, unknown>;
    };
    const docs: DocLite[] = manifest.docs;
    const currentMap = new Map<string, number | null>(
      docs.map((d) => [d.slug, d.mtime ?? null]),
    );

    // First load — record the baseline and stop.
    if (prevMapRef.current === null) {
      prevMapRef.current = currentMap;
      prevSeenAtRef.current = Date.now();
      return;
    }

    const { added, modified } = diffVaultManifest(
      prevMapRef.current,
      currentMap,
    );
    prevMapRef.current = currentMap;

    // The app's own writes (bootstrap, inline editing) already gave feedback through the action
    // itself; re-reporting them from a polling diff is a burst of noise.
    const selfWritten = consumeSelfWrittenSlugs();
    const externalAdded = added.filter((slug) => !selfWritten.has(slug));
    const externalModified = modified.filter((slug) => !selfWritten.has(slug));

    // Deletions cannot be counted from the manifest — a rename or merge looks like "deleted +
    // added" (measured, see the diff-manifest.ts comment). A tool name knows the intent, so only
    // `delete_concept` entries inside this burst's window are counted.
    const removed = countRecentDeletes(agentActivityLog, prevSeenAtRef.current ?? 0);
    prevSeenAtRef.current = Date.now();

    if (externalAdded.length === 0 && externalModified.length === 0 && removed === 0) return;

    // Slugs are not passed straight through — converting to a manifest row here (kind plus
    // display_*/title) is what lets the screen say "Capability · Payment authorization" instead of
    // a folder path.
    const docBySlug = new Map(docs.map((d) => [d.slug, d]));
    const toNode = (slug: string) => toVaultDiffNode(docBySlug.get(slug) ?? { slug }, locale);

    for (const planned of planVaultDiffToasts({
      added: externalAdded.map(toNode),
      modified: externalModified.map(toNode),
      removed,
    })) {
      toast.show(formatVaultDiffToastMessage(planned, t, kindLabel), planned.variant);
    }
  }, [status, manifest, toast, t, kindLabel, locale, consumeSelfWrittenSlugs, agentActivityLog]);

  return null;
}

/**
 * How many `delete_concept` entries were recorded in this burst's window (after `since`).
 *
 * The activity log is an audit log the server appends immediately after a successful MCP write, so
 * the tool name *is* the intent — unlike a manifest slug diff, it never misreads a rename as a deletion.
 */
function countRecentDeletes(
  entries: { at: string; tool: string }[] | undefined,
  since: number,
): number {
  if (!entries?.length) return 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.tool !== 'delete_concept') continue;
    const at = Date.parse(entry.at);
    if (Number.isFinite(at) && at >= since) count += 1;
  }
  return count;
}

type Translate = ReturnType<typeof useTranslations>;
type KindLabel = (kind: string) => string;

function formatVaultDiffToastMessage(
  planned: VaultDiffToast,
  t: Translate,
  kindLabel: KindLabel,
): string {
  switch (planned.kind) {
    case 'added':
    case 'edited': {
      const node = planned.node;
      if (!node) return '';
      // The kind is stated only when it is known; otherwise it ends at "Added — name".
      return node.kind
        ? t(planned.kind === 'added' ? 'addedKind' : 'editedKind', {
            kind: kindLabel(node.kind),
            name: node.name,
          })
        : t(planned.kind, { name: node.name });
    }
    case 'digest': {
      const c = planned.counts;
      if (!c) return '';
      // A zero action is not drawn — "0 deleted" is noise, not information.
      const parts: string[] = [];
      if (c.added.total > 0) {
        parts.push(t('digestAdded', { breakdown: formatBreakdown(c.added, t, kindLabel) }));
      }
      if (c.modified.total > 0) {
        parts.push(t('digestModified', { breakdown: formatBreakdown(c.modified, t, kindLabel) }));
      }
      if (c.removed > 0) parts.push(t('digestRemoved', { count: c.removed }));
      return parts.join(t('digestJoin'));
    }
    default:
      return '';
  }
}

/**
 * "3 capabilities · 12 elements". With no kind readable at all it emits numbers only — writing
 * "5 other" when everything is unknown implies some other share that does not exist.
 */
function formatBreakdown(count: VaultDiffActionCount, t: Translate, kindLabel: KindLabel): string {
  const rows = count.byKind;
  if (rows.length === 1 && !rows[0].kind) {
    return t('digestKindPlain', { count: rows[0].count });
  }
  return rows
    .map((row) =>
      row.kind
        ? t('digestKindItem', { kind: kindLabel(row.kind), count: row.count })
        : t('digestKindOther', { count: row.count }),
    )
    .join(t('digestKindJoin'));
}
