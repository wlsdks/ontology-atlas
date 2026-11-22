import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignedSemanticAuthoritySources,
  domainAuthoritySources,
  proposalAuthorityClaim,
  semanticUnitSupportsClaim,
} from './meaning-authority.mjs';

const ROLES = new Set(['mission']);

function semantic(excerpt, overrides = {}) {
  return { trust: 'candidate-evidence', role: 'mission', title: '', excerpt, ...overrides };
}

test('a source counts only when it shares two claim terms and is trusted mission evidence', () => {
  const evidenceBySource = new Map([
    ['docs/a.md', semantic('Invoices reconcile payments against ledger entries nightly.')],
    ['docs/b.md', semantic('Ledger entries stay immutable once a payment settles.')],
    ['docs/weak.md', semantic('Payments are mentioned once here.')],
    ['docs/wrong-role.md', semantic('Invoices reconcile payments against ledger entries.', { role: 'readme' })],
    ['docs/untrusted.md', semantic('Invoices reconcile payments against ledger entries.', { trust: 'untrusted-instruction' })],
  ]);
  const aligned = alignedSemanticAuthoritySources({
    sources: ['docs/a.md', 'docs/b.md', 'docs/weak.md', 'docs/wrong-role.md', 'docs/untrusted.md', 'docs/missing.md'],
    claim: 'Reconciles payments with ledger entries',
    evidenceBySource,
    allowedRoles: ROLES,
  });
  assert.deepEqual(aligned, ['docs/a.md', 'docs/b.md']);
});

test('two sources with the same excerpt are one authority', () => {
  const excerpt = 'Invoices reconcile payments against ledger entries nightly.';
  const evidenceBySource = new Map([
    ['docs/a.md', semantic(excerpt)],
    ['docs/copy.md', semantic(`  ${excerpt.toUpperCase()}  `)],
  ]);
  const aligned = alignedSemanticAuthoritySources({
    sources: ['docs/a.md', 'docs/copy.md'],
    claim: 'Reconciles payments with ledger entries',
    evidenceBySource,
    allowedRoles: ROLES,
  });
  assert.deepEqual(aligned, ['docs/a.md']);
});

test('a claim made only of generic words has no authority to align with', () => {
  const evidenceBySource = new Map([['docs/a.md', semantic('The product provides a service for the user.')]]);
  assert.deepEqual(
    alignedSemanticAuthoritySources({
      sources: ['docs/a.md'],
      claim: 'product service user',
      evidenceBySource,
      allowedRoles: ROLES,
    }),
    [],
  );
});

test('word endings do not hide an overlap (plural, past tense, -ing)', () => {
  const evidenceBySource = new Map([['docs/a.md', semantic('Retries queued messages while deliveries failed.')]]);
  assert.deepEqual(
    alignedSemanticAuthoritySources({
      sources: ['docs/a.md'],
      claim: 'retrying queue deliveries',
      evidenceBySource,
      allowedRoles: ROLES,
    }),
    ['docs/a.md'],
  );
});

test('a domain needs a sentence that says it owns that exact domain', () => {
  const domain = { title: 'Billing' };
  const owns = semantic('Billing owns invoices and ledger entries.', { role: 'architecture' });
  const mentions = semantic('Invoices and ledger entries feed Billing reports.', { role: 'architecture' });
  const evidenceBySource = new Map([['docs/owns.md', owns], ['docs/mentions.md', mentions]]);
  const sources = ['docs/owns.md', 'docs/mentions.md'];
  const claim = 'Billing\nInvoices and ledger entries';
  assert.deepEqual(domainAuthoritySources({ sources, domain, claim, evidenceBySource }), ['docs/owns.md']);
});

test('a Korean responsibility verb counts as explicit ownership', () => {
  const evidenceBySource = new Map([
    ['docs/ko.md', semantic('청구 도메인은 송장과 원장 항목을 담당한다.', { role: 'architecture' })],
  ]);
  assert.deepEqual(
    domainAuthoritySources({
      sources: ['docs/ko.md'],
      domain: { title: '청구' },
      claim: '청구 도메인은 송장과 원장 항목을 담당한다.',
      evidenceBySource,
    }),
    ['docs/ko.md'],
  );
});

test('a review unit supports a claim only with two shared terms, ignoring review filler words', () => {
  assert.equal(
    semanticUnitSupportsClaim('Exports invoices as signed archives', 'Archives of signed invoices are exported nightly.'),
    true,
  );
  assert.equal(
    semanticUnitSupportsClaim('Exports invoices as signed archives', 'Invoices are mentioned in this review of the question.'),
    false,
  );
  assert.equal(semanticUnitSupportsClaim('', 'anything about invoices'), false);
});

test('the authority claim joins every authored statement and skips blanks', () => {
  assert.equal(
    proposalAuthorityClaim({
      title: 'Billing',
      definition: ' ',
      includes: ['Invoices'],
      excludes: ['Taxes'],
      why: 'It owns money flow',
    }),
    'Billing\nInvoices\nTaxes\nIt owns money flow',
  );
});
