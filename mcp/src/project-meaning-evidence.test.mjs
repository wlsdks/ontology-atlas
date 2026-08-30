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
