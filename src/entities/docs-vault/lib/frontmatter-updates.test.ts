import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from './frontmatter-updates';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

describe('quoted mapping updates', () => {
  it('replaces a decoded key once and preserves unrelated malformed source', () => {
    const source = '---\n"title": Old\n"bad\\q": kept\n---\n\nBody';
    const updated = applyFrontmatterUpdates(source, { title: 'New' });
    expect(updated).toBe('---\ntitle: New\n"bad\\q": kept\n---\n\nBody');
  });

  it('preserves quoted keys and scalar types over repeated edits', () => {
    const updates = { 'a:b': { 'x,y': '001', empty: '', flag: 'false', 'key\\name': 'C:\\new\\tools, x' } };
    let source = '---\n"a:b": old\n---\n\nBody';
    for (let round = 0; round < 3; round += 1) {
      source = applyFrontmatterUpdates(source, updates);
      expect(parseFrontmatter(source)).toEqual({ frontmatter: updates, body: '\nBody' });
    }
  });
});


/** With BOM or CRLF sources a key is updated, not duplicated by a trailing `\r`. */
describe('BOM and CRLF sources', () => {
  it('updates a key and keeps CRLF line endings', () => {
    const raw = '---\r\nkind: capability\r\ntitle: 옛 제목\r\n---\r\n본문\r\n';
    const next = applyFrontmatterUpdates(raw, { title: '새 제목' });
    const titleLines = next.split(/\r?\n/).filter((l) => l.startsWith('title:'));
    expect(titleLines).toEqual(['title: 새 제목']);
    expect(next.includes('\r\n')).toBe(true);
  });

  it('updates frontmatter behind a BOM instead of adding a new block', () => {
    const raw = '﻿---\nkind: capability\ntitle: 옛 제목\n---\n본문\n';
    const next = applyFrontmatterUpdates(raw, { title: '새 제목' });
    expect(next.startsWith('﻿')).toBe(true);
    expect(next).toContain('kind: capability');
    const titleLines = next.split('\n').filter((l) => l.startsWith('title:'));
    expect(titleLines).toEqual(['title: 새 제목']);
  });
});
