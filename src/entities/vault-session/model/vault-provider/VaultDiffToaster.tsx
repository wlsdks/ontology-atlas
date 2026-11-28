import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { useToast } from '@/shared/ui/toast/toast';
import {
  diffVaultManifest,
  planVaultDiffToasts,
  toVaultDiffNode,
  type VaultDiffActionCount,
  type VaultDiffToast,
} from '../../lib/diff-manifest';
import { useLocalVault } from './local-vault-context';

/** Only the app appends to the wiki log, and the run that wrote a line already said it finished. */
const APP_WIKI_LOG_SLUG = 'wiki/_log';

/**
 * Toasts surface polling changes; the first load of each folder records a baseline only, so a switch
 * never reports the next folder's files as added. Kind is never invented:
 * when unknown, text uses the plain event and the digest counts it as other.
 * Deletions are not detected here; `delete_concept` raises its own toast.
 */
export function VaultDiffToaster() {
  const { status, manifest, handle, consumeSelfWrittenSlugs, consumeReportedConflicts, agentActivityLog } =
    useLocalVault();
  const toast = useToast();
  const t = useTranslations('featuresMisc.vaultDiffToaster');
  const kindLabel = useOntologyKindLabel();
  const locale = useLocale();
  const prevMapRef = useRef<Map<string, number | null> | null>(null);
  const prevHandleRef = useRef<typeof handle>(null);
  /** Only `delete_concept` entries inside the window since the previous diff belong to this burst; filled inside the effect because `Date.now()` during render is impure (`react-hooks/purity`). */
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

    if (prevMapRef.current === null || prevHandleRef.current !== handle) {
      prevMapRef.current = currentMap;
      prevHandleRef.current = handle;
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
    const observedSlugs = new Set([...added, ...modified].filter((slug) => slug !== APP_WIKI_LOG_SLUG));
    const selfWritten = consumeSelfWrittenSlugs(observedSlugs);
    // A save refused as a conflict already reported this change; a second green notice would bury it.
    // Only the same slug at the same mtime is dropped.
    const alreadyReported = consumeReportedConflicts(
      new Map(modified.map((slug) => [slug, currentMap.get(slug) ?? null])),
    );
    const externalAdded = added.filter((slug) => observedSlugs.has(slug) && !selfWritten.has(slug));
    const externalModified = modified.filter(
      (slug) => observedSlugs.has(slug) && !selfWritten.has(slug) && !alreadyReported.has(slug),
    );

    // A rename or merge looks like "deleted + added" in the manifest; the tool name knows the intent, so only `delete_concept`
    // entries inside this burst's window are counted.
    const removed = countRecentDeletes(agentActivityLog, prevSeenAtRef.current ?? 0);
    prevSeenAtRef.current = Date.now();

    if (externalAdded.length === 0 && externalModified.length === 0 && removed === 0) return;

    // Converting to a manifest row (kind plus display_*/title) lets the screen say "Capability · Payment authorization", not a folder path.
    const docBySlug = new Map(docs.map((d) => [d.slug, d]));
    const toNode = (slug: string) => toVaultDiffNode(docBySlug.get(slug) ?? { slug }, locale);

    for (const planned of planVaultDiffToasts({
      added: externalAdded.map(toNode),
      modified: externalModified.map(toNode),
      removed,
    })) {
      toast.show(formatVaultDiffToastMessage(planned, t, kindLabel), planned.variant);
    }
  }, [status, manifest, handle, toast, t, kindLabel, locale, consumeSelfWrittenSlugs, consumeReportedConflicts, agentActivityLog]);

  return null;
}

/** The activity log is appended right after a successful MCP write, so the tool name is the intent; unlike a slug diff it never misreads a rename as a deletion. */
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
