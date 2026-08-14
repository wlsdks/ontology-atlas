import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  evaluateMeaningCorpus,
  passesMeaningCorpus,
} from './evaluate-meaning-corpus.mjs';

const corpusRoot = join(process.cwd(), 'tests/fixtures/meaning-corpus');

test('meaning corpus passes each fixture with no implementation-shaped business leakage', () => {
  const result = evaluateMeaningCorpus(corpusRoot);
  const rows = new Map(result.rows.map((row) => [row.id, row]));

  assert.equal(result.summary.corpusSize, 3);
  assert.equal(result.summary.candidatePrecision, 1);
  assert.equal(result.summary.candidateRecall, 1);
  assert.equal(result.summary.oracleContractsPassed, 3);

  for (const row of rows.values()) {
    assert.equal(row.candidateCoverage.passed, true, row.id);
    assert.deepEqual(row.candidateCoverage.findings.falsePositiveSlugs, [], row.id);
    assert.deepEqual(row.candidateCoverage.findings.forbiddenLeakage, [], row.id);
  }
  assert.equal(passesMeaningCorpus(result), true);
});

test('a fixture failure is not masked by passing aggregate thresholds', () => {
  const result = evaluateMeaningCorpus(corpusRoot);

  assert.equal(result.summary.candidatePrecision >= 0.8, true);
  assert.equal(result.summary.candidateRecall >= 0.75, true);
  assert.equal(result.summary.oracleContractsPassed, result.summary.corpusSize);
  // Gate probe: simulate the exact class of defect that caused the old
  // aggregate false-green. The aggregate remains healthy, but one fixture
  // failure must make the release predicate red.
  result.rows[0].candidateCoverage.passed = false;
  assert.equal(result.rows.some((row) => !row.candidateCoverage.passed), true);
  assert.equal(passesMeaningCorpus(result), false);
});

test('an empty corpus cannot pass', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'meaning-corpus-empty-'));
  try {
    assert.throws(
      () => evaluateMeaningCorpus(emptyRoot),
      /meaning corpus is empty/,
    );
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});
