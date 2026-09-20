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

  it('빈 query 는 모두 통과', () => {
    expect(matchesDocsTreeQuery(doc, '')).toBe(true);
  });

  it('이름·주소로 찾는다', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('server'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('엠시피'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('capabilities/'))).toBe(true);
  });

  it('아무 데도 없으면 false', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('zzz'))).toBe(false);
  });
});

describe('한글 자판 질의 — 팔레트와 같은 답', () => {
  // Measured 2026-09-19: the vault tree's own box answered nothing to either of
  // these while the palette resolved them against the same documents.
  const doc = {
    title: '장바구니',
    slug: 'capabilities/cart',
    path: 'capabilities/cart.md',
    frontmatter: { display_ko: '장바구니' },
  } as Parameters<typeof matchesDocsTreeQuery>[0];

  it('초성으로 찾는다', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('ㅈㅂㄱㄴ'))).toBe(true);
  });

  it('조합 중인 음절로도 찾는다', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('장바ㄱ'))).toBe(true);
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('자'))).toBe(true);
  });

  it('초성이 다르면 끌어오지 않는다', () => {
    expect(matchesDocsTreeQuery(doc, normalizeForMatch('ㅋㅋㅋ'))).toBe(false);
  });
});
