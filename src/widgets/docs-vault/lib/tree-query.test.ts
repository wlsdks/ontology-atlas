import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '@/shared/lib/node-name-match';
import { matchesDocsTreeQuery } from './tree-query';

describe('matchesDocsTreeQuery', () => {
  const doc = {
    title: 'MCP Server',
    slug: 'capabilities/mcp-server',
    path: 'capabilities/mcp-server.md',
    frontmatter: { display_ko: '엠시피 서버' },
  } as Parameters<typeof matchesDocsTreeQuery>[0];

  it('passes everything for an empty query', () => {
    expect(matchesDocsTreeQuery(doc, '')).toBe(true);
  });

  it('matches by name and path', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('server'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('엠시피'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('capabilities/'))).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('zzz'))).toBe(false);
  });
});

describe('Hangul keyboard queries answer like the palette', () => {
  const doc = {
    title: '장바구니',
    slug: 'capabilities/cart',
    path: 'capabilities/cart.md',
    frontmatter: { display_ko: '장바구니' },
  } as Parameters<typeof matchesDocsTreeQuery>[0];

  it('matches by initial consonants', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('ㅈㅂㄱㄴ'))).toBe(true);
  });

  it('matches a syllable still being composed', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('장바ㄱ'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('자'))).toBe(true);
  });

  it('does not pull in names with different initial consonants', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('ㅋㅋㅋ'))).toBe(false);
  });
});
