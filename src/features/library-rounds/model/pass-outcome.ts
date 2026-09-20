import type { RoundKind, RoundPassOutcome } from '@/entities/library-round';

import type { ConsistencyPassResult } from './consistency-pass';

/**
 * **What one pass writes into the ledger** — the outcome word and the two numbers beside it.
 *
 * The two kinds of round answer with different evidence, and mixing them was a lie a person
 * read in the morning. A consistency pass has a local check: it knows how many pages it judged
 * and which ones went stale. A service pass has no such check — it re-reads the documents one
 * connector brought in and writes pages — so its outcome can only come from what its turn did,
 * and its `checked` is the number of documents it was sent to refresh. Before this, the
 * consistency check ran for *every* pass and a service round's ledger row wore a
 * `stale · N` badge counting pages that round never looked at.
 */

export interface PassFacts {
  kind: RoundKind;
  /** The local consistency check, for a consistency round only; `null` for a service round. */
  check: ConsistencyPassResult | null;
  /** Service round: the documents this pass was sent to refresh. */
  refreshed?: number;
  failed: boolean;
  written: readonly string[];
  refused: readonly string[];
}

export interface PassLedgerFacts {
  outcome: RoundPassOutcome;
  checked: number;
  stale: string[];
}

export function passLedgerFacts({ kind, check, refreshed = 0, failed, written, refused }: PassFacts): PassLedgerFacts {
  const stale = kind === 'consistency' && check ? check.stalePages : [];
  const checked = kind === 'consistency' && check ? check.checked : refreshed;
  return { outcome: outcomeOf({ failed, written, refused, stale }), checked, stale };
}

function outcomeOf(input: {
  failed: boolean;
  written: readonly string[];
  refused: readonly string[];
  stale: readonly string[];
}): RoundPassOutcome {
  if (input.failed) return 'failed';
  if (input.written.length > 0) return 'redrafted';
  if (input.refused.length > 0) return 'refused';
  if (input.stale.length > 0) return 'stale';
  return 'held';
}
