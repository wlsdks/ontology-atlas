// The vocabulary a source receipt may use: gaps (what is wrong) and actions
// (what to do). Declared once for `project-source-receipt.mjs`
// and `project-meaning-inventory.mjs`, which both gate on it; two copies let one
// accept what the other silently rejects. Gate: `project-source-vocabulary.test.mjs`.

/** What is wrong. Messages print these names verbatim, so no prose is needed. */
export const PROJECT_SOURCE_GAP_IDS = Object.freeze(
  new Set([
    'source_unbound',
    'multiple_active_sources',
    'receipt_missing',
    'receipt_malformed',
    'source_role_evidence_missing',
    'declared_source_path_missing',
    'source_inventory_truncated',
    'ontology_changed',
    'source_changed',
  ]),
);

/**
 * What to do. A new name needs its sentence in `MEANING_NEXT_ACTION_HINTS`
 * (`tools/graph.mjs`); `meaning-hint-coverage.test.mjs` blocks the omission.
 */
export const PROJECT_SOURCE_ACTION_IDS = Object.freeze(
  new Set([
    'connect_source',
    'repair_source_binding',
    'measure_source',
    'record_source_role',
    'repair_source_path',
    'review_inventory_limit',
    'remeasure_source',
    'use_current_evidence',
  ]),
);
