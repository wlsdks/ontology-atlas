import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  assert.deepEqual(result.measurementScope.candidateDiscovery, {
    status: 'measured',
    effectiveThresholds: result.rows[0].candidateCoverage.thresholds,
    relaxedMinimumCoverage: [
      'definitionCoverage',
      'citationRecall',
      'competencyCoverage',
    ],
    strictMaximums: {
      maximumForbiddenLeakage: 0,
    },
  });
  assert.equal(result.measurementScope.goldenOracleConsistency.status, 'measured');
  assert.deepEqual(result.measurementScope.independentConstruction, {
    status: 'not_measured',
    unmeasuredDimensions: [
      'definitionCoverage',
      'citationRecall',
      'competencyCoverage',
    ],
  });

  for (const row of rows.values()) {
    assert.equal(row.candidateCoverage.passed, true, row.id);
    assert.equal(row.candidateCoverage.metrics.definitionCoverage, 0, row.id);
    assert.equal(row.candidateCoverage.metrics.competencyCoverage, 0, row.id);
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

  result.rows[0].candidateCoverage.passed = true;
  result.rows[0].oracleContract.passed = false;
  assert.equal(result.rows.some((row) => !row.oracleContract.passed), true);
  assert.equal(passesMeaningCorpus(result), false);
});

test('CLI exposes measurement scope in JSON and readable text', () => {
  const script = join(process.cwd(), 'scripts/evaluate-meaning-corpus.mjs');
  const jsonRun = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.equal(jsonRun.status, 0, jsonRun.stderr);
  const result = JSON.parse(jsonRun.stdout);
  assert.equal(result.measurementScope.independentConstruction.status, 'not_measured');

  const textRun = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(textRun.status, 0, textRun.stderr);
  assert.match(
    textRun.stdout,
    new RegExp(result.measurementScope.candidateDiscovery.status),
  );
  assert.match(
    textRun.stdout,
    new RegExp(result.measurementScope.goldenOracleConsistency.status),
  );
  assert.match(
    textRun.stdout,
    new RegExp(result.measurementScope.independentConstruction.status.replace('_', ' ')),
  );
  for (const dimension of result.measurementScope.candidateDiscovery.relaxedMinimumCoverage) {
    const threshold = result.measurementScope.candidateDiscovery.effectiveThresholds[dimension];
    assert.match(textRun.stdout, new RegExp(`${dimension}\\s+>=\\s+${threshold}`));
  }
  for (const [dimension, threshold] of Object.entries(
    result.measurementScope.candidateDiscovery.strictMaximums,
  )) {
    assert.match(textRun.stdout, new RegExp(`${dimension}\\s+<=\\s+${threshold}`));
  }
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
