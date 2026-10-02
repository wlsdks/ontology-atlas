import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from './frontmatter-updates';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

describe('quoted mapping updates', () => {
  it('retains indented malformed source after an unrelated scalar edit', () => {
    const source = '---\n"title": Old\n  "bad\\q": keep this source\n---\n\nBody';
    const updated = applyFrontmatterUpdates(source, { title: 'New' });
    expect(updated).toBe('---\ntitle: New\n  "bad\\q": keep this source\n---\n\nBody');
    expect(parseFrontmatter(updated).diagnostics).toHaveLength(1);
  });

  it('replaces a complete block across blank lines without dropping the next field', () => {
    const source = '---\nnote: |-\n  First\n\n  Last\ntitle: Kept\n---\n\nBody';
    const updated = applyFrontmatterUpdates(source, { note: 'New' });
    expect(parseFrontmatter(updated)).toEqual({ frontmatter: { note: 'New', title: 'Kept' }, body: '\nBody' });
    expect(updated).not.toContain('Last');
  });

  for (const { target, key } of [
    { target: String.prototype, key: 'at' },
    { target: Object, key: 'hasOwn' },
  ]) {
    it(`edits quoted frontmatter without the newer ${key} method`, () => {
      const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
      let parsed;
      try {
        Object.defineProperty(target, key, { ...descriptor, value: undefined });
        const updated = applyFrontmatterUpdates('---\n"title": "Old"\nlabels: { value: "001" }\n---\n\nBody', { title: 'New' });
        parsed = parseFrontmatter(updated);
      } finally {
        Object.defineProperty(target, key, descriptor);
      }
      expect(parsed).toEqual({ frontmatter: { title: 'New', labels: { value: '001' } }, body: '\nBody' });
    });
  }

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
