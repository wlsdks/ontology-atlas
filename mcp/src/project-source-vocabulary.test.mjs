// The source-receipt vocabulary is declared once: two copies used as gates let
// one accept what the other silently rejects.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  PROJECT_SOURCE_ACTION_IDS,
  PROJECT_SOURCE_GAP_IDS,
} from './project-source-vocabulary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OWNER = 'project-source-vocabulary.mjs';

test('the scanner sees both quote styles: non-empty differs from complete', () => {
  // Checked against the real file: a probe sharing the defect's assumption
  // (single quotes) cannot prove it.
  const text = readFileSync(join(HERE, 'meaning-assessment.mjs'), 'utf8');
  const single = [...text.matchAll(/'[a-z_]{6,}'/g)].length;
  const double = [...text.matchAll(/"[a-z_]{6,}"/g)].length;
  assert.ok(double > 0, 'if this file no longer uses double quotes, what this check guarded is gone');
  void single;
});

test('the scan is not idle: the words exist', () => {
  assert.ok(PROJECT_SOURCE_ACTION_IDS.size >= 6, 'the action list is empty');
  assert.ok(PROJECT_SOURCE_GAP_IDS.size >= 6, 'the gap list is empty');
  assert.ok(PROJECT_SOURCE_ACTION_IDS.has('connect_source'));
  assert.ok(PROJECT_SOURCE_GAP_IDS.has('source_unbound'));
});

test('the two lists do not overlap: a gap and an action are different things', () => {
  const both = [...PROJECT_SOURCE_ACTION_IDS].filter((id) => PROJECT_SOURCE_GAP_IDS.has(id));
  assert.deepEqual(both, [], `these names are both a gap and an action: ${both.join(', ')}`);
});

test('no file redeclares these lists', () => {
  const offenders = [];
  for (const file of readdirSync(HERE)) {
    if (!file.endsWith('.mjs') || file === OWNER || file.endsWith('.test.mjs')) continue;
    const text = readFileSync(join(HERE, file), 'utf8');
    for (const block of text.matchAll(/new Set\(\[([^\]]*)\]/g)) {
      // Both quote styles: scanning single quotes only missed a copy
      // in `meaning-assessment.mjs`.
      const names = [...block[1].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
      if (names.length < 3) continue;
      const overlap = names.filter(
        (n) => PROJECT_SOURCE_ACTION_IDS.has(n) || PROJECT_SOURCE_GAP_IDS.has(n),
      );
      // Overlap above half means a copy, not a few coincidental names.
      if (overlap.length >= Math.ceil(names.length / 2)) {
        offenders.push(`${file}: ${overlap.slice(0, 4).join(', ')}…`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these files redeclare the words; import them from ${OWNER}:\n${offenders.join('\n')}`,
  );
});
