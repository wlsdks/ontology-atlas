import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  repositoryPathExists,
  textNamesExactPath,
  validateCitationsAndConfidence,
  validateOptionalConceptBoundaryList,
} from './evidence-review.mjs';

test('a path named inside a longer path or file name is not a mention', () => {
  assert.equal(textNamesExactPath('Edit src/app/page.tsx to change it', 'src/app/page.tsx'), true);
  assert.equal(textNamesExactPath('(src/app/page.tsx)', 'src/app/page.tsx'), true);
  assert.equal(textNamesExactPath('Edit src/app/page.tsx.bak', 'src/app/page.tsx'), false);
  assert.equal(textNamesExactPath('Edit old-src/app/page.tsx', 'src/app/page.tsx'), false);
  assert.equal(textNamesExactPath('', 'src/app/page.tsx'), false);
});

test('a repository path must exist inside the root and be relative', () => {
  const root = mkdtempSync(join(tmpdir(), 'proposal-evidence-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.mjs'), '');
    assert.equal(repositoryPathExists(root, 'src/a.mjs'), true);
    assert.equal(repositoryPathExists(root, 'src/missing.mjs'), false);
    assert.equal(repositoryPathExists(root, '../outside'), false);
    assert.equal(repositoryPathExists(root, join(root, 'src', 'a.mjs')), false);
    assert.equal(repositoryPathExists(root, ''), false);
    assert.equal(repositoryPathExists('', 'src/a.mjs'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an includes or excludes list must be unique, short and non-blank', () => {
  const codesFor = (value) => {
    const findings = [];
    validateOptionalConceptBoundaryList(value, 'project.includes', findings);
    return findings.map((row) => row.code);
  };
  assert.deepEqual(codesFor(undefined), []);
  assert.deepEqual(codesFor(['a', 'b']), []);
  assert.deepEqual(codesFor(['a', 'a']), ['invalid-concept-boundary-list']);
  assert.deepEqual(codesFor(['a', ' ']), ['invalid-concept-boundary-list']);
  assert.deepEqual(codesFor('a'), ['invalid-concept-boundary-list']);
  assert.deepEqual(codesFor(Array.from({ length: 21 }, (_, index) => `item ${index}`)), ['invalid-concept-boundary-list']);
});

function reviewCitations(row, evidenceBySource = new Map()) {
  const findings = [];
  validateCitationsAndConfidence({
    row,
    path: 'concepts[0]',
    availableSources: new Set(['README.md', 'docs/risky.md', 'docs/trap.md']),
    evidenceBySource,
    findings,
    label: 'meaning',
  });
  return findings.map((row) => `${row.severity}:${row.code}`);
}

test('a claim without a known, trusted citation and a 0-1 confidence is an error', () => {
  const trusted = new Map([['README.md', { trust: 'candidate-evidence', excerpt: '' }]]);
  assert.deepEqual(reviewCitations({ evidence: ['README.md'], confidence: 0.5 }, trusted), []);
  assert.deepEqual(reviewCitations({ evidence: [], confidence: 0.5 }, trusted), ['error:missing-citation']);
  assert.deepEqual(
    reviewCitations({ evidence: ['nowhere.md'], confidence: 0.5 }, trusted),
    ['error:unknown-citation'],
  );
  assert.deepEqual(reviewCitations({ evidence: ['README.md'], confidence: 1.5 }, trusted), ['error:invalid-confidence']);
  assert.deepEqual(reviewCitations({ evidence: ['README.md'] }, trusted), ['error:invalid-confidence']);
});

test('untrusted instructions and uncorroborated risky evidence cannot carry a claim', () => {
  const evidenceBySource = new Map([
    ['docs/trap.md', { trust: 'untrusted-instruction' }],
    ['docs/risky.md', { trust: 'claim-review-required' }],
  ]);
  assert.ok(
    reviewCitations({ evidence: ['docs/trap.md'], confidence: 0.5 }, evidenceBySource)
      .includes('error:untrusted-citation'),
  );
  assert.deepEqual(
    reviewCitations({ evidence: ['docs/risky.md'], confidence: 0.5 }, evidenceBySource),
    ['warning:risky-citation', 'error:risky-citation-unconfirmed'],
  );
});
