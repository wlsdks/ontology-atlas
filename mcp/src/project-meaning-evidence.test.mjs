import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractProjectMeaningEvidencePaths } from './project-meaning-evidence.mjs';

test('repository-root competency path stays valid without erasing sibling evidence', () => {
  const body = [
    '## Competency answers',
    '',
    '### evidence: partial',
    '',
    'Question',
    '',
    'Answer',
    '',
    '- Evidence: `README.md`, `cmd/tool/main.go`',
    '- Paths: `.`, `cmd/tool/main.go`',
    '- Gap: Canonical root file is unresolved.',
  ].join('\n');

  assert.deepEqual(extractProjectMeaningEvidencePaths(body), [
    '.',
    'cmd/tool/main.go',
    'README.md',
  ]);
});

test('unsafe competency paths still fail the complete evidence row closed', () => {
  const body = [
    '## Competency answers',
    '',
    '- Evidence: `README.md`',
    '- Paths: `../secret`',
  ].join('\n');
  assert.deepEqual(extractProjectMeaningEvidencePaths(body), []);
});

test('source-range Evidence decodes only to its safe underlying path without erasing siblings', () => {
  const path = `${'segment/'.repeat(54)}file.ts`;
  assert.ok(path.length < 500);
  const range = `source:${path}#L1-L2@sha256:${'a'.repeat(64)}`;
  assert.ok(range.length > 500);
  const body = `## Competency answers\n\n- Evidence: \`README.md\`, \`${range}\`\n- Paths: \`src/main.ts\``;
  assert.deepEqual(extractProjectMeaningEvidencePaths(body), [path, 'README.md', 'src/main.ts'].sort());
});

test('malformed source ranges and source URIs in Paths fail closed', () => {
  const bad = [
    `source:../secret.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:/secret.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:C:/secret.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:src\\secret.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:src/a.ts#L0-L1@sha256:${'a'.repeat(64)}`,
    `source:src/a.ts#L2-L1@sha256:${'a'.repeat(64)}`,
    `source:src/a.ts#L1-L1@sha256:${'A'.repeat(64)}`,
    `source:src/a\`b.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:src/a, b.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:source:src/a.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:C:relative.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:src/a#fragment.ts#L1-L1@sha256:${'a'.repeat(64)}`,
    `source:broken-${String.fromCharCode(0xd800)}.ts#L1-L1@sha256:${'a'.repeat(64)}`,
  ];
  for (const value of bad) {
    assert.deepEqual(extractProjectMeaningEvidencePaths(`## Competency answers\n\n- Evidence: \`${value}\``), []);
  }
  const valid = `source:src/a.ts#L1-L1@sha256:${'a'.repeat(64)}`;
  assert.deepEqual(extractProjectMeaningEvidencePaths(`## Competency answers\n\n- Paths: \`${valid}\``), []);
});

test('source ranges preserve valid supplementary Unicode paths and ordinary auth implementation names', () => {
  const values = ['src/😀/token.ts', 'src/auth/password-policy.py'];
  const body = `## Competency answers\n\n- Evidence: ${values.map((path) => `\`source:${path}#L1-L1@sha256:${'a'.repeat(64)}\``).join(', ')}`;
  assert.deepEqual(extractProjectMeaningEvidencePaths(body), ['src/😀/token.ts', 'src/auth/password-policy.py']);
});
