import type { BriefLineDetail } from './brief-model';
import type { EvidenceRow } from './evidence-states';

/**
 * **The named concepts under each evidence line.**
 *
 * A count with no way to reach the concept, the file and the date sends a reader back to the
 * agent's summary, which is the failure this brief exists to end (PO evidence seat,
 * 2026-09-19). These are the rows the line opens into.
 *
 * ⚠️ **One row per concept, because the sentence above it counts concepts.** An earlier version
 * pushed one row per changed file, so a concept citing four moved files filled four rows: the
 * line read "3 concepts" while the disclosure listed eleven and the hidden-count line under it
 * agreed with the disclosure rather than with the sentence (2026-09-20). Each row carries the
 * newest path, which is the one the verdict rests on, and the concept's own verdict decides
 * which list it joins — a concept with both a vanished path and a moved one is counted once, as
 * missing, exactly as `ontology-brief` counted it.
 */
export function buildEvidenceDetails(input: {
  rows: readonly EvidenceRow[];
  /** Concept id → display title. A missing title falls back to the id. */
  titleById: ReadonlyMap<string, string>;
  /** Where a named concept opens. */
  hrefOf?: (id: string) => string;
}): Map<string, BriefLineDetail[]> {
  const hrefOf = input.hrefOf ?? ((id: string) => `/topology/?p=${encodeURIComponent(id)}`);
  const moved: BriefLineDetail[] = [];
  const gone: BriefLineDetail[] = [];
  const folderOnly: BriefLineDetail[] = [];
  for (const row of input.rows) {
    const name = input.titleById.get(row.id) ?? row.id;
    const href = hrefOf(row.id);
    if (row.verdict === 'missing') {
      const path = row.gone[0];
      if (path) gone.push({ name, slug: row.slug, path, at: null, docAt: row.docChangedAt, href });
    } else if (row.verdict === 'stale') {
      const file = newest(row.moved);
      if (file) moved.push({ name, slug: row.slug, path: file.path, at: file.changedAt, docAt: row.docChangedAt, href });
    } else if (row.reason === 'folder-only') {
      const folder = newest(row.folders);
      if (folder) folderOnly.push({ name, slug: row.slug, path: folder.path, at: folder.changedAt, docAt: row.docChangedAt, href });
    }
  }
  const map = new Map<string, BriefLineDetail[]>();
  map.set('ontology-evidence-moved', moved.sort(byNewest));
  map.set('ontology-evidence-missing', gone);
  map.set('ontology-evidence-folder-only', folderOnly.sort(byNewest));
  return map;
}

type EvidenceFile = { path: string; changedAt: string };

/** The entry the verdict rests on: the one that changed last. `undefined` for an empty list. */
function newest(entries: readonly EvidenceFile[]): EvidenceFile | undefined {
  return entries.reduce<EvidenceFile | undefined>(
    (best, entry) => (!best || (Date.parse(entry.changedAt) || 0) > (Date.parse(best.changedAt) || 0) ? entry : best),
    undefined,
  );
}

function byNewest(a: BriefLineDetail, b: BriefLineDetail): number {
  return (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0);
}
