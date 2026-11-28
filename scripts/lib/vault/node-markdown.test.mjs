import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFrontmatter } from '../parse-frontmatter.mjs';
import { buildNodeMarkdown } from './node-markdown.mjs';

describe('buildNodeMarkdown', () => {
  it('reads back as written, including values that would be retyped or break the block', () => {
    const frontmatter = {
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abc',
      slug: 'capabilities/x',
      kind: 'capability',
      title: 'Why: "quotes", a # hash and 2026',
      year: '2026',
      flag: 'true',
      depends_on: ['elements/a', 'needs, a comma'],
      relation_notes: { 'elements/a': 'because: it calls a' },
      skipped: undefined,
      removed: null,
    };
    const markdown = buildNodeMarkdown({ frontmatter, body: '\n\nBody line.\n' });
    const read = parseFrontmatter(markdown);
    assert.deepEqual(read.diagnostics ?? [], []);
    const { skipped, removed, ...written } = frontmatter;
    assert.deepEqual(read.frontmatter, written);
    assert.equal(read.body.trim(), 'Body line.');
    assert.equal(skipped, undefined);
    assert.equal(removed, null);
  });
});
