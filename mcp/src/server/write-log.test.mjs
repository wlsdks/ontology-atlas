import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeWrite } from './write-log.mjs';

const wrote = { ok: true, changed: true, dryRun: false };

test('a relation replaced through remove_relation is logged as the replacement it is, with its reason', () => {
  const entry = summarizeWrite('remove_relation', {
    from: 'capabilities/refund',
    to: 'elements/ledger',
    type: 'depends_on',
    replaceWith: { to: 'elements/payments', type: 'depends_on', why: 'Payments owns the ledger now.' },
  }, wrote);
  assert.equal(entry.tool, 'replace_relation');
  assert.equal(entry.target, 'capabilities/refund');
  assert.match(entry.summary, /^replace capabilities\/refund --depends_on--> elements\/ledger with --depends_on--> elements\/payments$/);
  assert.equal(entry.why, 'Payments owns the ledger now.');
});

test('a concept renamed with newKind is logged as a reclassification, and without it as a rename', () => {
  const reclassified = summarizeWrite('rename_concept', { oldSlug: 'elements/refund-rules', newKind: 'capability', domain: 'domains/billing' }, { ...wrote, newSlug: 'capabilities/refund-rules' });
  assert.equal(reclassified.tool, 'reclassify_concept');
  assert.equal(reclassified.target, 'capabilities/refund-rules');
  assert.equal(reclassified.summary, 'reclassify elements/refund-rules → capability');
  const renamed = summarizeWrite('rename_concept', { oldSlug: 'capabilities/refunds', newSlug: 'capabilities/refund' }, wrote);
  assert.equal(renamed.tool, undefined, 'a plain rename keeps the tool name the caller logs');
  assert.equal(renamed.summary, 'rename capabilities/refunds → capabilities/refund');
  const removed = summarizeWrite('remove_relation', { from: 'a', to: 'b', type: 'depends_on' }, wrote);
  assert.equal(removed.tool, undefined);
  assert.equal(removed.summary, 'remove a --depends_on--> b');
});

test('a dry run logs nothing for either call', () => {
  assert.equal(summarizeWrite('remove_relation', { from: 'a', to: 'b', type: 'depends_on', replaceWith: { to: 'c', type: 'depends_on' } }, { dryRun: true }), null);
  assert.equal(summarizeWrite('rename_concept', { oldSlug: 'a', newKind: 'element' }, { dryRun: true }), null);
});
