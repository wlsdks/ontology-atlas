import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addFinding,
  countBy,
  digest,
  mapUnique,
  nonBlank,
  portableSourceRef,
  uniqueStrings,
  validTimestamp,
} from './qualification-field-rules.mjs';

test('a field value is non-blank only when untrimmed-clean, non-empty and within its length cap', () => {
  assert.equal(nonBlank('value'), true);
  assert.equal(nonBlank(''), false);
  assert.equal(nonBlank(' padded '), false);
  assert.equal(nonBlank(5), false);
  assert.equal(nonBlank('x'.repeat(1000)), true);
  assert.equal(nonBlank('x'.repeat(1001)), false);
  assert.equal(nonBlank('abcd', 3), false);
});

test('a timestamp is valid only in canonical ISO form', () => {
  assert.equal(validTimestamp('2026-11-21T09:30:00.000Z'), true);
  assert.equal(validTimestamp('2026-11-21'), false);
  assert.equal(validTimestamp('2026-02-30T00:00:00.000Z'), false);
  assert.equal(validTimestamp('not a date'), false);
});

test('a source reference is portable only as a relative path', () => {
  assert.equal(portableSourceRef('src/app/page.tsx'), true);
  assert.equal(portableSourceRef('/Users/someone/repo/file.ts'), false);
  assert.equal(portableSourceRef('~/repo/file.ts'), false);
  assert.equal(portableSourceRef('file:///repo/file.ts'), false);
  assert.equal(portableSourceRef('C:\\repo\\file.ts'), false);
  assert.equal(portableSourceRef('D:/repo/file.ts'), false);
});

test('a digest is sha256 followed by 64 lowercase hex characters', () => {
  assert.equal(digest(`sha256:${'a'.repeat(64)}`), true);
  assert.equal(digest(`sha256:${'A'.repeat(64)}`), false);
  assert.equal(digest(`sha256:${'a'.repeat(63)}`), false);
  assert.equal(digest(`md5:${'a'.repeat(64)}`), false);
});

test('a list of strings must be unique and each entry non-blank', () => {
  assert.equal(uniqueStrings(['a', 'b']), true);
  assert.equal(uniqueStrings([]), true);
  assert.equal(uniqueStrings(['a', 'a']), false);
  assert.equal(uniqueStrings(['a', '']), false);
  assert.equal(uniqueStrings('a'), false);
});

test('rows are keyed by a unique non-blank id, and a bad row is reported, not kept', () => {
  const findings = [];
  const rows = mapUnique([{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 'b' }], 'id', findings, 'scenarios');
  assert.deepEqual([...rows.keys()], ['a', 'b']);
  assert.deepEqual(findings.map((row) => row.path), ['scenarios[1].id', 'scenarios[2].id']);
  const notArray = [];
  assert.equal(mapUnique(undefined, 'id', notArray, 'claims').size, 0);
  assert.equal(notArray[0].code, 'invalid-array');
});

test('findings default to error severity and carry refs and category only when given', () => {
  const findings = [];
  addFinding(findings, 'a', 'p', 'm');
  addFinding(findings, 'b', 'p', 'm', { severity: 'failure', category: 'evidence', refs: ['w1'] });
  assert.deepEqual(findings[0], { code: 'a', severity: 'error', path: 'p', message: 'm' });
  assert.deepEqual(findings[1], {
    code: 'b', severity: 'failure', path: 'p', message: 'm', category: 'evidence', refs: ['w1'],
  });
});

test('status counts list every status, including zeros', () => {
  assert.deepEqual(
    countBy([{ status: 'passed' }, { status: 'passed' }, { status: 'failed' }, null], new Set(['passed', 'failed', 'unknown'])),
    { passed: 2, failed: 1, unknown: 0 },
  );
});
