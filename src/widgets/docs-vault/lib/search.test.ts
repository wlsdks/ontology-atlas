import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildBodyEntry, type DocsBodyIndex } from './body-index';
import { extractBodySnippet, searchDocs } from './search';

function doc(slug: string, title: string, extra: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
    ...extra,
  };
}

function bodyIndexOf(entries: Record<string, string>): DocsBodyIndex {
  const m = new Map<string, ReturnType<typeof buildBodyEntry>>();
  for (const [slug, raw] of Object.entries(entries)) {
    m.set(slug, buildBodyEntry(raw, slug));
  }
  return m;
}

describe('searchDocs — 기존 메타데이터 티어 (회귀 가드)', () => {
  it('title 매치가 excerpt 매치보다 높은 점수', () => {
    const docs = [
      doc('a', 'other', { excerpt: 'graph engine here' }),
      doc('b', 'graph engine'),
    ];
    const out = searchDocs('graph', docs);
    expect(out.map((m) => m.doc.slug)).toEqual(['b', 'a']);
    expect(out[0].titleHit).toEqual({ start: 0, end: 5 });
  });

  it('멀티 토큰은 AND — 모든 토큰이 어딘가에 매치해야 포함', () => {
    const docs = [
      doc('a', 'graph engine'),
      doc('b', 'graph only'),
    ];
    const out = searchDocs('graph engine', docs);
    expect(out.map((m) => m.doc.slug)).toEqual(['a']);
  });

  it('tag / slug 매치도 점수에 반영', () => {
    const docs = [doc('mcp-server', 'Server', { tags: ['mcp'] })];
    const out = searchDocs('mcp', docs);
    expect(out).toHaveLength(1);
    // slug(25) + tag(15)
    expect(out[0].score).toBeGreaterThanOrEqual(40);
  });
});

describe('searchDocs — 본문(body) 최하위 티어', () => {
  it('bodyIndex 없으면 기존과 동일 (본문 무시)', () => {
    const docs = [doc('a', 'other')];
    expect(searchDocs('phrase', docs)).toEqual([]);
  });

  it('본문에만 매치되는 문서도 결과에 포함되고 bodyHit 스니펫을 갖는다', () => {
    const docs = [doc('a', 'unrelated title')];
    const bodyIndex = bodyIndexOf({
      a: 'Intro line.\n\nThe deterministic compile phrase lives here.\n',
    });
    const out = searchDocs('deterministic compile', docs, 30, bodyIndex);
    expect(out).toHaveLength(1);
    expect(out[0].titleHit).toBeNull();
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    expect(
      hit.text.slice(hit.hit.start, hit.hit.end).toLowerCase(),
    ).toBe('deterministic');
    expect(hit.text).toContain('deterministic compile phrase');
  });

  it('제목 히트는 항상 본문-단독 히트보다 위 (최하위 티어 보장)', () => {
    const docs = [
      doc('body-only', 'zzz totally different'),
      doc('title-hit', 'needle at end of a very long title indeed truly'),
    ];
    // body-only 는 본문 맨 앞(가장 유리한 위치)에서 매치
    const bodyIndex = bodyIndexOf({
      'body-only': 'needle first thing in the body',
    });
    // title 매치가 인덱스 80 초과로 잘려 최저 title 점수(20)여도 body(≤2) 를 이긴다
    const longTitle = `${'x'.repeat(90)}needle`;
    docs[1] = doc('title-hit', longTitle);
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['title-hit', 'body-only']);
  });

  it('excerpt 최저점(2)보다도 본문 점수가 낮다', () => {
    const docs = [
      doc('excerpt-late', 'zzz', {
        excerpt: `${'y'.repeat(30)}needle far into the excerpt`,
      }),
      doc('body-first', 'zzz'),
    ];
    const bodyIndex = bodyIndexOf({ 'body-first': 'needle right away' });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['excerpt-late', 'body-first']);
  });

  it('본문끼리는 먼저 나오는 매치가 근소하게 위', () => {
    const docs = [doc('late', 'aaa'), doc('early', 'bbb')];
    const bodyIndex = bodyIndexOf({
      late: `${'filler '.repeat(400)}needle`,
      early: 'needle up front',
    });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['early', 'late']);
  });

  it('멀티 토큰 AND 가 메타데이터+본문에 걸쳐도 성립', () => {
    const docs = [doc('a', 'graph doc'), doc('b', 'graph doc two')];
    const bodyIndex = bodyIndexOf({ a: 'compile is discussed here' });
    const out = searchDocs('graph compile', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['a']);
  });

  it('메타데이터에도 매치된 문서는 bodyHit 스니펫을 같이 들 수 있다', () => {
    const docs = [doc('a', 'needle title')];
    const bodyIndex = bodyIndexOf({ a: 'body also mentions needle here' });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out[0].titleHit).not.toBeNull();
    expect(out[0].bodyHit).not.toBeNull();
  });
});

describe('extractBodySnippet — ±60자 문맥 + 하이라이트 범위', () => {
  it('문서 앞부분 매치 — 앞 생략부호 없음', () => {
    const body = 'needle then a tail that keeps going for a while afterwards';
    const s = extractBodySnippet(body, 0, 6);
    expect(s.text.startsWith('needle')).toBe(true);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('needle');
  });

  it('중간 매치 — 앞뒤 60자 창 + 생략부호, hit 범위 보존', () => {
    const before = 'a'.repeat(100);
    const after = 'b'.repeat(100);
    const body = `${before}NEEDLE${after}`;
    const s = extractBodySnippet(body, 100, 6);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('NEEDLE');
    // 창 크기: 앞 60 + 매치 6 + 뒤 60 + 생략부호 2
    expect(s.text.length).toBe(60 + 6 + 60 + 2);
  });

  it('개행/탭은 공백으로 눌러 한 줄 스니펫으로', () => {
    const body = 'line one\nline two needle line\tthree';
    const idx = body.indexOf('needle');
    const s = extractBodySnippet(body, idx, 6);
    expect(s.text).not.toMatch(/[\n\t]/);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('needle');
  });
});
