// The **vocabulary** a source receipt may use: the gaps (what is wrong) and the
// actions (what to do).
//
// Why it was split out (2026-08-17): the same list existed **byte for byte**
// in both `project-source-receipt.mjs` and `project-meaning-inventory.mjs`, and
// both were used as gates:
//
//   project-source-receipt.mjs:76      `!ACTION_IDS.has(value.id)`        → null
//   project-meaning-inventory.mjs:112  `!SOURCE_ACTION_IDS.has(...)`      → rejected
//
// So adding one action and editing only one copy left the receipt accepting it
// while the inventory quietly rejected it. That mismatch surfaces not as an error
// but as **nothing happening at all**, which takes a long time to notice.
//
// This repository fixed the same shape five times in a single day (write path,
// config merge, validator, health calculation, remedy table). **When there are two
// copies and no gate, drifting apart is the default.**
//
// Gate: `project-source-vocabulary.test.mjs`.

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
 * What to do. **Adding a name here requires adding the human-readable sentence
 * too** — `MEANING_NEXT_ACTION_HINTS` in `index.js`. Omitting it is blocked by
 * `meaning-hint-coverage.test.mjs`.
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
