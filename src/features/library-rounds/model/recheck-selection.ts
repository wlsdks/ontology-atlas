import type { RoundPassEntry } from '@/entities/library-round';

/**
 * Which stale concepts a recheck run takes, before anything is read: every kind, longest-waiting
 * document first, never one with uncommitted changes, one a person raised, or one left "Not
 * decided" before whose document and files have not changed since.
 */

/** What a run sends at most: documents plus diffs. */
export const RECHECK_MAX_SENT_BYTES = 200 * 1024;
/** A cited file's diff is cut after this many lines. */
export const RECHECK_DIFF_MAX_LINES = 400;

export interface RecheckCandidate {
  slug: string;
  /** Vault-relative document. */
  path: string;
  /** The commit that dates the document, where its moved files are diffed from. */
  docCommit: string;
  docChangedAt: string;
  /** Cited files that moved after the document. */
  moved: readonly string[];
  /** The document's dating commit and its files' commits. */
  basis: string;
}

export function recheckBasis(docCommit: string, files: readonly { path: string; commit: string | null }[]): string {
  return [docCommit, ...files.map((file) => `${file.path}@${file.commit ?? ''}`).sort()].join(' ');
}

/** Per slug, the basis it was last left "Not decided" on, from this schedule's earlier runs. */
export function leftBefore(entries: readonly RoundPassEntry[], roundId: string): Map<string, string> {
  const left = new Map<string, string>();
  for (const entry of entries) {
    if (entry.roundId !== roundId || !entry.recheck || entry.recheck.undoOf) continue;
    for (const concept of entry.recheck.concepts) {
      if (concept.outcome === 'left' && concept.basis) left.set(concept.slug, concept.basis);
      else left.delete(concept.slug);
    }
  }
  return left;
}

export function chooseRecheckCandidates({
  candidates,
  uncommitted,
  raised,
  left,
}: {
  candidates: readonly RecheckCandidate[];
  /** Vault documents and cited files with uncommitted changes. */
  uncommitted: ReadonlySet<string>;
  /** Slugs carrying `review_state: human_decides`. */
  raised: ReadonlySet<string>;
  left: ReadonlyMap<string, string>;
}): { ordered: RecheckCandidate[]; skippedUncommitted: number } {
  let skippedUncommitted = 0;
  const ordered = candidates.filter((candidate) => {
    if (uncommitted.has(candidate.path) || candidate.moved.some((path) => uncommitted.has(path))) {
      skippedUncommitted += 1;
      return false;
    }
    if (raised.has(candidate.slug)) return false;
    return left.get(candidate.slug) !== candidate.basis;
  });
  ordered.sort((a, b) => Date.parse(a.docChangedAt) - Date.parse(b.docChangedAt) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { ordered, skippedUncommitted };
}
