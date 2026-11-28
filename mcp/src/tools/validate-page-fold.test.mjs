import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitRepeatedRemedies } from './validate-page-fold.mjs';

const REMEDY = 'Add it with patch_concept({slug:"<slug>"}). One real bullet is enough.';
const issue = (slug, code = 'boundary-missing') => ({
  code,
  severity: 'warning',
  message: `"${slug}" (capability) has no \`## Excludes\` section in \`src/a.b/File.java\`, so the body never states what it is not. Add it with patch_concept({slug:"${slug}"}). One real bullet is enough.`,
});

test('a code shared by two nodes states its remedy once and every issue keeps the sentence naming its node', () => {
  const { problems, remedies } = splitRepeatedRemedies([
    { slug: 'capabilities/a', issues: [issue('capabilities/a'), issue('capabilities/a', 'other-code')] },
    { slug: 'capabilities/b', issues: [issue('capabilities/b')] },
  ]);
  assert.deepEqual(remedies, { 'boundary-missing': REMEDY });
  const named = (slug) => `"${slug}" (capability) has no \`## Excludes\` section in \`src/a.b/File.java\`, so the body never states what it is not.`;
  assert.equal(problems[0].issues[0].message, named('capabilities/a'));
  assert.equal(problems[1].issues[0].message, named('capabilities/b'));
  assert.equal(problems[0].issues[1].message, issue('capabilities/a', 'other-code').message, 'a code seen once keeps its whole message');
});

test('a one-sentence message is left whole and gets no remedy', () => {
  const short = { code: 'x', severity: 'error', message: 'kind is required.' };
  const { problems, remedies } = splitRepeatedRemedies([{ slug: 'a', issues: [short] }, { slug: 'b', issues: [short] }]);
  assert.deepEqual(problems[1].issues[0], short);
  assert.deepEqual(remedies, {});
});

test('a code whose messages differ after the first sentence keeps every message whole', () => {
  const unread = (slug, file) => ({
    code: 'rule-without-read-lines',
    severity: 'warning',
    message: `"${slug}" states a rule and cites no lines this session read, so nothing backs it. Read \`${file}\` with sourceReads, then cite the lines.`,
  });
  const rows = [
    { slug: 'capabilities/a', issues: [unread('capabilities/a', 'src/a.py')] },
    { slug: 'capabilities/b', issues: [unread('capabilities/b', 'src/b.py')] },
    { slug: 'capabilities/c', issues: [unread('capabilities/c', 'src/a.py')] },
  ];
  const { problems, remedies } = splitRepeatedRemedies(rows);
  assert.deepEqual(remedies, {});
  assert.deepEqual(problems, rows);
});
