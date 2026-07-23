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
    // 정확 구절 부스트 — 스니펫은 첫 토큰이 아니라 매치된 전체 구절을
    // 하이라이트한다(P1 검수 #2: 클릭한 결과의 스니펫에 실제 매치어가
    // 있어야 함).
    expect(
      hit.text.slice(hit.hit.start, hit.hit.end).toLowerCase(),
    ).toBe('deterministic compile');
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

  // 착지 결함 (P1 검수) #2 — 정확 구절 매치 문서가 흩어진 토큰 AND 매치
  // 문서보다 랭킹 상위에 와야 신뢰 회복. 그래야 클릭한 1위 결과의 스니펫에
  // 실제로 하이라이트 가능한 매치어가 존재한다(뷰어 착지 전제조건).
  it('정확 구절 매치 문서가 흩어진 토큰 매치 문서보다 위 (본문 정확-구절 부스트)', () => {
    const docs = [
      // 토큰이 각각은 있지만 구절로 안 이어짐(흩어진 매치) — idx 0 이라
      // 기존 로직이면 오히려 이 문서가 앞서던 회귀 케이스.
      doc('scattered', 'zzz'),
      // "deterministic compile" 이 그대로 이어지는 정확 구절.
      doc('exact', 'yyy'),
    ];
    const bodyIndex = bodyIndexOf({
      scattered: 'deterministic is discussed, and later compile appears too',
      exact: `${'filler '.repeat(50)}the deterministic compile phrase lives here`,
    });
    const out = searchDocs('deterministic compile', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['exact', 'scattered']);
    // 1위 스니펫엔 실제 매치어(전체 구절)가 있어야 한다.
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    expect(hit.text.slice(hit.hit.start, hit.hit.end).toLowerCase()).toBe(
      'deterministic compile',
    );
  });

  it('정확 구절 매치는 줄바꿈으로 쪼개져도(줄-랩) 찾아 부스트한다', () => {
    const docs = [doc('wrapped', 'zzz')];
    const bodyIndex = bodyIndexOf({
      wrapped: 'Give it a local, git-backed\nmental model it can read.',
    });
    const out = searchDocs('git-backed mental model', docs, 30, bodyIndex);
    expect(out).toHaveLength(1);
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    // extractBodySnippet 이 개행을 표시용 공백으로 눌러도(한 줄 스니펫),
    // hit 범위는 실제 매치된 구절 길이(개행 포함 원문 기준)를 그대로
    // 보존해야 한다 — 부스트가 올바른 위치/길이를 찾았다는 증거.
    expect(hit.text.slice(hit.hit.start, hit.hit.end)).toBe(
      'git-backed mental model',
    );
  });

  it('정확-구절 부스트 최댓값(idx 0)도 제목 최저점(20) 은 절대 못 이긴다', () => {
    const docs = [
      // title 매치가 idx 80 초과로 잘려 최저 title 점수(20)만 받는 최악 케이스.
      doc('title-hit', `${'x'.repeat(90)}needle phrase`),
      doc('body-exact', 'zzz'),
    ];
    // 본문 idx 0 — 정확-구절 부스트가 최댓값을 받는 최유리 케이스.
    const bodyIndex = bodyIndexOf({
      'body-exact': 'needle phrase right at the very start of the body',
    });
    const out = searchDocs('needle phrase', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['title-hit', 'body-exact']);
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
