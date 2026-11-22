import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseAutomaticImportDelivery,
  resolveImportReviewMode,
  summarizeReconciliation,
} from './import-review-rules.mjs';

const none = {
  reviewMode: undefined,
  reconcile: true,
  allowLargeResponse: undefined,
  afterReviewId: undefined,
  focusPath: undefined,
  focusDirection: undefined,
  focusLimit: undefined,
  focusAfterEdgeId: undefined,
};

test('a focusPath alone asks for the focus review, and nothing asks for no mode', () => {
  assert.equal(resolveImportReviewMode({ ...none, focusPath: 'src/a.ts' }), 'focus');
  assert.equal(resolveImportReviewMode(none), undefined);
  assert.equal(resolveImportReviewMode({ ...none, reviewMode: 'next' }), 'next');
});

test('an argument that belongs to another review mode is refused by name', () => {
  assert.throws(() => resolveImportReviewMode({ ...none, allowLargeResponse: true }), /allowLargeResponse is only valid with reviewMode "full"/);
  assert.throws(() => resolveImportReviewMode({ ...none, afterReviewId: 'r1' }), /afterReviewId is only valid with reviewMode "next"/);
  assert.throws(() => resolveImportReviewMode({ ...none, reviewMode: 'focus' }), /reviewMode "focus" requires focusPath/);
  assert.throws(() => resolveImportReviewMode({ ...none, reviewMode: 'full', focusPath: 'a' }), /focusPath is only valid with reviewMode "focus"/);
  assert.throws(() => resolveImportReviewMode({ ...none, focusLimit: 5 }), /only valid in focus mode/);
});

test('the next review needs a reconciliation to review', () => {
  assert.throws(() => resolveImportReviewMode({ ...none, reviewMode: 'next', reconcile: false }), /requires reconcile:true/);
});

const base = { reviewMode: undefined, reconcile: true, hasReconciliation: true };

test('a response at the 128 KiB limit is sent whole and one byte over falls back to the compact review', () => {
  assert.deepEqual(chooseAutomaticImportDelivery({ ...base, estimatedFullResponseBytes: 128 * 1024 }), { whole: true });
  const { delivery } = chooseAutomaticImportDelivery({ ...base, estimatedFullResponseBytes: 128 * 1024 + 1 });
  assert.equal(delivery.selection, 'automatic_compact');
  assert.equal(delivery.estimatedFullResponseBytes, 128 * 1024 + 1);
});

test('an explicit full request over the limit is refused with the retry arguments', () => {
  try {
    chooseAutomaticImportDelivery({ ...base, reviewMode: 'full', estimatedFullResponseBytes: 200_000 });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.equal(error.repairFields.largeResponseConfirmationRequired, true);
    assert.deepEqual(error.repairFields.retryArguments, { reviewMode: 'full', allowLargeResponse: true });
  }
});

test('the compact fallback is refused when there is nothing to reconcile against', () => {
  for (const unreconciled of [{ reconcile: false }, { hasReconciliation: false }]) {
    assert.throws(
      () => chooseAutomaticImportDelivery({ ...base, ...unreconciled, estimatedFullResponseBytes: 200_000 }),
      /compact review requires reconcile:true and a loadable active vault/,
    );
  }
});

const reconciliation = (counts) => ({
  inBoth: new Array(counts.both ?? 0),
  inCodeMissingFromVault: new Array(counts.missing ?? 0),
  inCodeMissingEndpointAbsent: new Array(counts.absent ?? 0),
  inVaultNotInCode: new Array(counts.notInCode ?? 0),
  notJudgeableByImports: new Array(counts.notJudgeable ?? 0),
});

test('a vault with no drift reads as in sync', () => {
  const summary = summarizeReconciliation(reconciliation({ both: 4 }), 0);
  assert.equal(summary.hint, 'code import graph and vault depends_on edges are in sync (4 shared, no drift).');
  assert.equal(summary.inBoth, 4);
});

test('every bucket with drift, and any unresolved import, is named in the hint and never called stale', () => {
  const summary = summarizeReconciliation(reconciliation({ missing: 1, notInCode: 2 }), 3);
  assert.match(summary.hint, /^1 import-backed candidate\(s\) are missing from the vault/);
  assert.match(summary.hint, /2 vault depends_on edge\(s\) have no matching code import/);
  assert.match(summary.hint, /Read the code before treating any of these as stale/);
  assert.match(summary.hint, /3 unresolved import\(s\) could not be compared/);
  assert.equal(summary.unresolvedImports, 3);
});
