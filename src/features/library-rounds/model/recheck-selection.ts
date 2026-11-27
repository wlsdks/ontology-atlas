import type { RoundPassEntry } from '@/entities/library-round';

/**
 * Which stale concepts a recheck run takes, before anything is read: every kind, longest-waiting
 * document first, never one with uncommitted changes, one a person raised, or one left "Not
 * decided" before whose document and files have not changed since.
 */

/** What a run sends at most: documents plus diffs. */
export const RECHECK_MAX_SENT_BYTES = 200_000;
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

/**
 * Per slug, the basis it was last parked on in this schedule's runs: left "Not decided", or
 * marked and then undone. An undone document returns to the bytes it had, so its basis returns
 * too, and the next run does not send the same document and diff again.
 */
export function leftBefore(entries: readonly RoundPassEntry[], roundId: string): Map<string, string> {
  const left = new Map<string, string>();
  const runs = new Map<string, RoundPassEntry>();
  for (const entry of entries) {
    if (entry.roundId !== roundId || !entry.recheck) continue;
    const { undoOf, undone } = entry.recheck;
    if (undoOf) {
      const paths = new Set(undone ?? []);
      for (const concept of runs.get(undoOf)?.recheck?.concepts ?? []) {
        if (paths.has(concept.path) && concept.basis) left.set(concept.slug, concept.basis);
      }
      continue;
    }
    runs.set(entry.id, entry);
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
