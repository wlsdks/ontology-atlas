import assert from 'node:assert/strict';
import { test } from 'node:test';

import { foldRepeatedGuidance } from './validate-page-fold.mjs';

const issue = (slug, code = 'boundary-missing') => ({
  code,
  severity: 'warning',
  message: `"${slug}" (capability) has no \`## Excludes\` section in \`src/a.b/File.java\`, so the body never states what it is not. Add it with patch_concept({slug:"${slug}"}). One real bullet is enough.`,
});

test('a code keeps its repair guidance once a page and names every node', () => {
  const page = foldRepeatedGuidance([
    { slug: 'capabilities/a', issues: [issue('capabilities/a'), issue('capabilities/a', 'other-code')] },
    { slug: 'capabilities/b', issues: [issue('capabilities/b')] },
  ]);
  assert.equal(page[0].issues[0].message, issue('capabilities/a').message);
  assert.equal(page[0].issues[1].message, issue('capabilities/a', 'other-code').message);
  assert.equal(
    page[1].issues[0].message,
    '"capabilities/b" (capability) has no `## Excludes` section in `src/a.b/File.java`, so the body never states what it is not. Repair as the first boundary-missing on this page says.',
  );
});

test('a one-sentence message is left whole', () => {
  const short = { code: 'x', severity: 'error', message: 'kind is required.' };
  const page = foldRepeatedGuidance([{ slug: 'a', issues: [short] }, { slug: 'b', issues: [short] }]);
  assert.deepEqual(page[1].issues[0], short);
});

test('a message whose guidance names a fact of its own node is left whole', () => {
  const unread = (slug, file) => ({
    code: 'rule-without-read-lines',
    severity: 'warning',
    message: `"${slug}" states a rule and cites no lines this session read, so nothing backs it. Read \`${file}\` with sourceReads, then cite the lines.`,
  });
  const page = foldRepeatedGuidance([
    { slug: 'capabilities/a', issues: [unread('capabilities/a', 'src/a.py')] },
    { slug: 'capabilities/b', issues: [unread('capabilities/b', 'src/b.py')] },
    { slug: 'capabilities/c', issues: [unread('capabilities/c', 'src/a.py')] },
  ]);
  assert.equal(page[1].issues[0].message, unread('capabilities/b', 'src/b.py').message);
  assert.equal(
    page[2].issues[0].message,
    '"capabilities/c" states a rule and cites no lines this session read, so nothing backs it. Repair as the first rule-without-read-lines on this page says.',
  );
});
