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

/** A body whose text opens past the 320-character first paragraph, so only the body tier can match it. */
const deep = (text: string) => `${'filler '.repeat(60)}\n\n${text}`;

describe('searchDocs metadata tiers', () => {
  it('scores a title match above a summary match', () => {
    const docs = [
      doc('a', 'other', { description: 'graph engine here' }),
      doc('b', 'graph engine'),
    ];
    const out = searchDocs('graph', docs);
    expect(out.map((m) => m.doc.slug)).toEqual(['b', 'a']);
    expect(out[0].titleHit).toEqual({ start: 0, end: 5 });
  });

  it('requires every token of a multi-token query to match somewhere', () => {
    const docs = [
      doc('a', 'graph engine'),
      doc('b', 'graph only'),
    ];
    const out = searchDocs('graph engine', docs);
    expect(out.map((m) => m.doc.slug)).toEqual(['a']);
  });

  it('counts tag and slug matches in the score', () => {
    const docs = [doc('mcp-server', 'Server', { tags: ['mcp'] })];
    const out = searchDocs('mcp', docs);
    expect(out).toHaveLength(1);
    // slug(25) + tag(15)
    expect(out[0].score).toBeGreaterThanOrEqual(40);
  });
});

describe('searchDocs finds a page by its first paragraph only through the body index', () => {
  const raw = '---\ntitle: Plain page\n---\n\nQuillwort grows in cold ponds.\n\n## Later\n\nOther text.';
  const plain = doc('plain', 'Plain page', { excerpt: 'Quillwort grows in cold ponds.' });

  it('finds the page by a first-paragraph word when the index holds its body', () => {
    const out = searchDocs('quillwort', [plain], 30, bodyIndexOf({ plain: raw }));
    expect(out.map((match) => match.doc.slug)).toEqual(['plain']);
    expect(out[0].bodyHit?.text).toContain('Quillwort');
  });

  it('ranks an indexed page by its first paragraph above fifteen tag matches', () => {
    const tagged = Array.from({ length: 15 }, (_, i) => doc(`tagged-${i}`, `Other ${i}`, { tags: ['ledger'] }));
    const page = doc('close', 'Month end', { excerpt: 'Ledger close runs at midnight.' });
    const out = searchDocs('ledger', [...tagged, page], 15, bodyIndexOf({ close: 'Ledger close runs at midnight.' }));
    expect(out).toHaveLength(15);
    expect(out[0].doc.slug).toBe('close');
  });

  it('does not find the page by that word without the index', () => {
    expect(searchDocs('quillwort', [plain], 30)).toEqual([]);
  });

  it('finds a page by its description, and a concept by its definition preview', () => {
    const described = doc('d', 'Described', { description: 'Tracks quillwort stock' });
    const defined = doc('e', 'Defined', { definitionPreview: 'Tracks quillwort stock' });
    expect(searchDocs('quillwort', [described, defined]).map((match) => match.doc.slug)).toEqual(['d', 'e']);
  });
});

describe('searchDocs body tier ranks lowest', () => {
  it('keeps complete phrase highlights in successive documents', () => {
    const docs = [doc('a', 'Other'), doc('b', 'Other')];
    const index = bodyIndexOf({ a: 'needle\nphrase here', b: 'needle\tphrase there' });
    const matches = searchDocs('needle phrase', docs, 1, index);
    expect(matches[0].doc).toBe(docs[0]);
    const all = searchDocs('needle phrase', docs, 2, index);
    // 20 for the first paragraph holding the first token, 16 for the exact phrase in the body.
    expect(all.map(match => match.score)).toEqual([36, 36]);
    expect(all.map(match => match.bodyHit!.text.slice(match.bodyHit!.hit.start, match.bodyHit!.hit.end)))
      .toEqual(['needle phrase', 'needle phrase']);
  });

  it('keeps the exhaustive prefix, stable ties and highlights across result limits', () => {
    const docs = Array.from({ length: 80 }, (_, i) => doc(`documents/${79 - i}`, i % 5 === 0 ? 'needle phrase' : 'Other', {
      description: i % 3 === 0 ? 'needle phrase' : '', tags: i % 7 === 0 ? ['needle', 'phrase'] : [],
      frontmatter: { display_ko: '그래프 문서', display_en: 'Graph document' },
    }));
    const bodies = bodyIndexOf(Object.fromEntries(docs.map((d, i) => [d.slug,
      `${' \n\t'.repeat(i % 17)}needle${i % 2 ? '\n' : ' scattered '}phrase 그래프 c++ [x] İ`,
    ])));
    const snapshot = structuredClone({ docs, bodies });
    for (const query of ['needle phrase', 'NEEDLE', '그래프', 'graph', 'c++ [x]', 'i', 'missing', '']) {
      const exhaustive = searchDocs(query, docs, Infinity, bodies);
      for (const limit of [0, 1, 3, 15, 79, 80, 200, 3.8, -3, Number.NaN, Infinity]) {
        expect(searchDocs(query, docs, limit, bodies)).toEqual(exhaustive.slice(0, limit));
      }
    }
    expect({ docs, bodies }).toEqual(snapshot);
    const ties = docs.map(d => ({ ...d, title: 'needle', description: '', tags: [], frontmatter: {} }));
    const tiedBodies = bodyIndexOf(Object.fromEntries(ties.map(d => [d.slug, 'needle'])));
    expect(searchDocs('needle', ties, 15, tiedBodies).map(match => match.doc)).toEqual(ties.slice(0, 15));
    const lateWinner = { ...ties[79], title: 'needle', description: 'needle', tags: ['needle'] };
    expect(searchDocs('needle', [...ties.slice(0, 79), lateWinner], 1, tiedBodies)[0].doc).toBe(lateWinner);
  });

  it('ignores the body when there is no bodyIndex', () => {
    const docs = [doc('a', 'other')];
    expect(searchDocs('phrase', docs)).toEqual([]);
  });

  it('includes body-only matches with a bodyHit snippet', () => {
    const docs = [doc('a', 'unrelated title')];
    const bodyIndex = bodyIndexOf({
      a: 'Intro line.\n\nThe deterministic compile phrase lives here.\n',
    });
    const out = searchDocs('deterministic compile', docs, 30, bodyIndex);
    expect(out).toHaveLength(1);
    expect(out[0].titleHit).toBeNull();
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    // The exact-phrase boost highlights the whole matched phrase, not the first token.
    expect(
      hit.text.slice(hit.hit.start, hit.hit.end).toLowerCase(),
    ).toBe('deterministic compile');
    expect(hit.text).toContain('deterministic compile phrase');
  });

  it('ranks a title hit above any body-only hit', () => {
    const docs = [
      doc('body-only', 'zzz totally different'),
      doc('title-hit', 'needle at end of a very long title indeed truly'),
    ];
    // The body-only case matches just past the first paragraph, so only the body tier scores it.
    const bodyIndex = bodyIndexOf({
      'body-only': deep('needle first thing in the body'),
    });
    // A title match clipped past index 80 scores the title minimum (20) and still beats body (≤2).
    const longTitle = `${'x'.repeat(90)}needle`;
    docs[1] = doc('title-hit', longTitle);
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['title-hit', 'body-only']);
  });

  it('scores a body hit below the lowest summary score', () => {
    const docs = [
      doc('summary-late', 'zzz', {
        description: `${'y'.repeat(30)}needle far into the summary`,
      }),
      doc('body-first', 'zzz'),
    ];
    const bodyIndex = bodyIndexOf({ 'body-first': deep('needle right away') });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['summary-late', 'body-first']);
  });

  it('never scores frontmatter as the first paragraph of an index hit', () => {
    const docs = [doc('front-only', 'aaa'), doc('opening', 'bbb')];
    const bodyIndex: DocsBodyIndex = new Map([
      ['front-only', { raw: '---\ncreated_by: "agent:claude-code"\n---\nThe close runs at midnight.', lower: '---\ncreated_by: "agent:claude-code"\n---\nthe close runs at midnight.', key: 'front-only' }],
      ['opening', buildBodyEntry('Claude closes the ledger.', 'opening')],
    ]);
    const out = searchDocs('claude', docs, 30, bodyIndex);
    const scoreOf = (slug: string) => out.find((m) => m.doc.slug === slug)?.score ?? 0;
    expect(scoreOf('front-only')).toBeLessThan(2);
    expect(scoreOf('opening')).toBeGreaterThanOrEqual(20);
  });

  it('ranks an earlier body match slightly higher', () => {
    const docs = [doc('late', 'aaa'), doc('early', 'bbb')];
    const bodyIndex = bodyIndexOf({
      late: `${'filler '.repeat(400)}needle`,
      early: deep('needle up front'),
    });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['early', 'late']);
  });

  it('satisfies a multi-token AND across metadata and body', () => {
    const docs = [doc('a', 'graph doc'), doc('b', 'graph doc two')];
    const bodyIndex = bodyIndexOf({ a: 'compile is discussed here' });
    const out = searchDocs('graph compile', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['a']);
  });

  // An exact phrase match must outrank scattered token matches, so the top result's snippet holds a
  // markable match.
  it('ranks an exact-phrase body match above scattered tokens', () => {
    const docs = [
      // Each token is present but not as a phrase (a scattered match).
      doc('scattered', 'zzz'),
    // "deterministic compile" as one contiguous exact phrase.
      doc('exact', 'yyy'),
    ];
    const bodyIndex = bodyIndexOf({
      scattered: deep('deterministic is discussed, and later compile appears too'),
      exact: `${'filler '.repeat(50)}the deterministic compile phrase lives here`,
    });
    const out = searchDocs('deterministic compile', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['exact', 'scattered']);
    // The top result's snippet must contain the actual match (the whole phrase).
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    expect(hit.text.slice(hit.hit.start, hit.hit.end).toLowerCase()).toBe(
      'deterministic compile',
    );
  });

  it('boosts an exact phrase even when split by a line wrap', () => {
    const docs = [doc('wrapped', 'zzz')];
    const bodyIndex = bodyIndexOf({
      wrapped: 'Give it a local, git-backed\nmental model it can read.',
    });
    const out = searchDocs('git-backed mental model', docs, 30, bodyIndex);
    expect(out).toHaveLength(1);
    expect(out[0].bodyHit).not.toBeNull();
    const hit = out[0].bodyHit!;
    // The hit range keeps the phrase's raw length even when the snippet flattens newlines.
    expect(hit.text.slice(hit.hit.start, hit.hit.end)).toBe(
      'git-backed mental model',
    );
  });

  it('keeps the largest exact-phrase boost below the lowest title score', () => {
    const docs = [
    // Worst case: a title match clipped past idx 80, scoring only the title minimum (20).
      doc('title-hit', `${'x'.repeat(90)}needle phrase`),
      doc('body-exact', 'zzz'),
    ];
    // The match sits just past the first paragraph, so only the body tier and its phrase boost score it.
    const bodyIndex = bodyIndexOf({
      'body-exact': deep('needle phrase right at the very start of the body'),
    });
    const out = searchDocs('needle phrase', docs, 30, bodyIndex);
    expect(out.map((m) => m.doc.slug)).toEqual(['title-hit', 'body-exact']);
  });

  it('lets a metadata match also carry a bodyHit snippet', () => {
    const docs = [doc('a', 'needle title')];
    const bodyIndex = bodyIndexOf({ a: 'body also mentions needle here' });
    const out = searchDocs('needle', docs, 30, bodyIndex);
    expect(out[0].titleHit).not.toBeNull();
    expect(out[0].bodyHit).not.toBeNull();
  });
});

describe('extractBodySnippet returns 60 characters of context and a highlight range', () => {
  it('adds no leading ellipsis for a match near the start', () => {
    const body = 'needle then a tail that keeps going for a while afterwards';
    const s = extractBodySnippet(body, 0, 6);
    expect(s.text.startsWith('needle')).toBe(true);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('needle');
  });

  it('windows 60 characters each side with ellipses around a middle match', () => {
    const before = 'a'.repeat(100);
    const after = 'b'.repeat(100);
    const body = `${before}NEEDLE${after}`;
    const s = extractBodySnippet(body, 100, 6);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('NEEDLE');
    // Window size: 60 before + 6 matched + 60 after + 2 ellipses
    expect(s.text.length).toBe(60 + 6 + 60 + 2);
  });

  it('collapses newlines and tabs into a one-line snippet', () => {
    const body = 'line one\nline two needle line\tthree';
    const idx = body.indexOf('needle');
    const s = extractBodySnippet(body, idx, 6);
    expect(s.text).not.toMatch(/[\n\t]/);
    expect(s.text.slice(s.hit.start, s.hit.end)).toBe('needle');
  });
});
