import type { BriefLineDetail } from './brief-model';
import type { EvidenceRow } from '@/shared/lib/evidence-states';

/**
 * The named concepts under each evidence line, one row per concept because the sentence counts concepts. Each row
 * carries its newest path, the one the verdict rests on, and the concept's verdict picks its list: a concept with
 * a vanished path and a moved one counts once, as missing, as `ontology-brief` counts it.
 */
export function buildEvidenceDetails(input: {
  rows: readonly EvidenceRow[];
  /** Concept id to display title; a missing title falls back to the id. */
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

/** The entry the verdict rests on, the most recently changed; `undefined` for an empty list. */
function newest(entries: readonly EvidenceFile[]): EvidenceFile | undefined {
  return entries.reduce<EvidenceFile | undefined>(
    (best, entry) => (!best || (Date.parse(entry.changedAt) || 0) > (Date.parse(best.changedAt) || 0) ? entry : best),
    undefined,
  );
}

function byNewest(a: BriefLineDetail, b: BriefLineDetail): number {
  return (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0);
}
