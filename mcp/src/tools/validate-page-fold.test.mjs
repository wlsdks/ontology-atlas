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
