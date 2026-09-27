import type { RoundKind, RoundPassOutcome } from '@/entities/library-round';

import type { ConsistencyPassResult } from './consistency-pass';

/**
 * One pass's ledger outcome. Consistency passes report their local check; service passes only
 * what their turn did; an ontology pass that finished unrefused has "reviewed", never "held".
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
  const reviewed = kind === 'ontology' && !failed;
  return { outcome: outcomeOf({ failed, written, refused, stale, reviewed }), checked, stale };
}

function outcomeOf(input: {
  failed: boolean;
  written: readonly string[];
  refused: readonly string[];
  stale: readonly string[];
  reviewed?: boolean;
}): RoundPassOutcome {
  if (input.failed) return 'failed';
  if (input.written.length > 0) return 'redrafted';
  if (input.refused.length > 0) return 'refused';
  if (input.reviewed) return 'reviewed';
  if (input.stale.length > 0) return 'stale';
  return 'held';
}
