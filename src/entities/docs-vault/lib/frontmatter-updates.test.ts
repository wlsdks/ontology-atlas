import { describe, expect, it } from 'vitest';
import { applyFrontmatterUpdates } from './frontmatter-updates';


/**
 * With a BOM or CRLF source, **the key is updated rather than duplicated** (2026-07-28).
 *
 * Without CRLF normalization a `\r` stays at the end of the key line, matching misses,
 * and the same key is appended instead of updated — from then on that file's
 * frontmatter carries the key twice.
 */
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
