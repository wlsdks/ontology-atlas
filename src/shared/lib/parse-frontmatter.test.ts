import { describe, expect, it } from 'vitest';
import { buildExcerpt, extractOutLinksWithContext, parseFrontmatter } from './parse-frontmatter';

describe('parseFrontmatter — basics', () => {
  it('returns empty frontmatter when no leading ---', () => {
    const { frontmatter, body } = parseFrontmatter('hello\nworld');
    expect(frontmatter).toEqual({});
    expect(body).toBe('hello\nworld');
  });

  it('parses scalar key:value', () => {
    const raw = `---\nname: Alpha\nstatus: live\n---\nbody`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter).toEqual({ name: 'Alpha', status: 'live' });
    expect(body).toBe('body');
  });

  it('strips quotes from quoted scalars', () => {
    const { frontmatter } = parseFrontmatter(
      `---\nname: "Hello: World"\nslug: 'a-b'\n---\n`,
    );
    expect(frontmatter.name).toBe('Hello: World');
    expect(frontmatter.slug).toBe('a-b');
  });
});

describe('parseFrontmatter — lists', () => {
  it('parses inline list', () => {
    const { frontmatter } = parseFrontmatter(
      `---\ntags: [auth, security, identity]\n---\n`,
    );
    expect(frontmatter.tags).toEqual(['auth', 'security', 'identity']);
  });

  it('parses block list', () => {
    const raw = [
      '---',
      'capabilities:',
      '  - login',
      '  - logout',
      '  - reset',
      '---',
      '',
    ].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.capabilities).toEqual(['login', 'logout', 'reset']);
  });
});

describe('parseFrontmatter — objects (T16)', () => {
  it('parses inline object scalars', () => {
    const { frontmatter } = parseFrontmatter(
      `---\nposition: { x: 100, y: 200 }\n---\n`,
    );
    expect(frontmatter.position).toEqual({ x: 100, y: 200 });
  });

  it('parses block object scalars', () => {
    const raw = [
      '---',
      'meta:',
      '  owner: alice',
      '  count: 42',
      '  active: true',
      '---',
      'body',
    ].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.meta).toEqual({
      owner: 'alice',
      count: 42,
      active: true,
    });
  });

  it('does not confuse block object with adjacent scalar key', () => {
    const raw = [
      '---',
      'meta:',
      '  owner: alice',
      '  count: 1',
      'name: Alpha',
      '---',
      '',
    ].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.meta).toEqual({ owner: 'alice', count: 1 });
    expect(frontmatter.name).toBe('Alpha');
  });

  it('preserves quoted strings inside inline object', () => {
    const { frontmatter } = parseFrontmatter(
      `---\nlocation: { city: "Seoul", zone: "KST" }\n---\n`,
    );
    expect(frontmatter.location).toEqual({ city: 'Seoul', zone: 'KST' });
  });

  it('list takes precedence when both indented dash and key:value follow', () => {
    // When the line after the indent starts with a dash, the list matches first.
    const raw = [
      '---',
      'items:',
      '  - first',
      '  - second',
      '---',
      '',
    ].join('\n');
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter.items).toEqual(['first', 'second']);
  });
});

describe('buildExcerpt — markdown is flattened to readable prose', () => {
  it('turns a markdown table into middot-separated prose, with NO raw pipes or separator dashes', () => {
    const body = [
      '@modelcontextprotocol/sdk 기반 stdio JSON-RPC 서버.',
      '',
      '| 도구 | 동작 |',
      '| --- | --- |',
      '| list_concepts | vault 의 모든 노드 |',
      '| get_concept | 단일 slug |',
    ].join('\n');
    const excerpt = buildExcerpt(body);
    // the unreadable failure mode: raw table pipes / separator rows survive
    expect(excerpt).not.toContain('|');
    expect(excerpt).not.toMatch(/-{2,}/);
    // cells read as middot-separated prose (underscores are stripped as
    // markdown italic — pre-existing behavior, so list_concepts → listconcepts)
    expect(excerpt).toContain('도구 · 동작');
    expect(excerpt).toContain('listconcepts · vault 의 모든 노드');
    expect(excerpt.startsWith('@modelcontextprotocol/sdk')).toBe(true);
  });

  it('strips headings, list bullets, links, and emphasis to plain text', () => {
    const body = [
      '# Heading',
      '',
      'A **bold** and _italic_ line with a [link](./other.md).',
      '',
      '- first bullet',
      '- second bullet',
    ].join('\n');
    const excerpt = buildExcerpt(body);
    expect(excerpt).not.toContain('#');
    expect(excerpt).not.toContain('*');
    expect(excerpt).not.toContain('](');
    expect(excerpt).toContain('bold');
    expect(excerpt).toContain('link'); // link text kept, url dropped
    expect(excerpt).toContain('first bullet');
    expect(excerpt).not.toMatch(/^\s*-\s/);
  });

  /*
   * The search palette draws this excerpt as a result's reason. A `path#symbol` reference —
   * how every element document in the dogfood vault names its entrypoint — lost the `#` to the
   * residual-mark strip, so the row read `src/widgets/topology-controls/ui/HubRail.tsxHubRail`
   * and the two names glued into one word nobody can read (2026-09-21). A `#` away from the
   * start of a line is content, not a heading mark.
   */
  it('keeps the separator between a path and the symbol it names', () => {
    const body = [
      '- Primary implementation: `src/widgets/topology-controls/ui/HubRail.tsx#HubRail`',
      '- Also see [HubRail](src/widgets/topology-controls/ui/HubRail.tsx).',
    ].join('\n');
    const excerpt = buildExcerpt(body);
    expect(excerpt).toContain('src/widgets/topology-controls/ui/HubRail.tsx#HubRail');
    expect(excerpt).not.toContain('HubRail.tsxHubRail');
    // The link form keeps only its text, so nothing glues there either.
    expect(excerpt).toContain('Also see HubRail.');
  });

  it('respects the max length (잘릴 땐 말줄임표 포함 max+1 이내)', () => {
    // Very long text with no spaces (no word boundary to cut at) — cut at max and append the ellipsis.
    expect(buildExcerpt('x'.repeat(500)).length).toBeLessThanOrEqual(321);
    expect(buildExcerpt('x'.repeat(500)).endsWith('…')).toBe(true);
    expect(buildExcerpt('x'.repeat(500), 50).length).toBeLessThanOrEqual(51);
  });

  it('단어 중간에서 뚝 끊지 않고 어절 경계에서 자르고 말줄임표를 붙인다 (sonnet 검수 D1)', () => {
    const prose = '이 프로젝트의 ontology 는 비즈니스 핵심과 구현 근거를 잇는다 '.repeat(20);
    const out = buildExcerpt(prose, 60);
    expect(out.endsWith('…')).toBe(true);
    // The final fragment must be a whole word — never cut right after a space.
    const body = out.slice(0, -1);
    expect(prose.includes(body)).toBe(true);
    expect(body.endsWith(' ')).toBe(false);
    // Short input passes through unchanged.
    expect(buildExcerpt('짧은 문장', 320)).toBe('짧은 문장');
  });
});

describe('extractOutLinksWithContext — wikilinks inside the nested ontology/ vault', () => {
  // `docs/ontology/` is the nested MCP vault this project dogfoods. Wikilinks
  // inside it (`[[capabilities/x]]`) use slugs relative to that vault root, while
  // the real document slug carries an `ontology/` prefix. Without the prefix
  // correction, `backlinksDetail` lookups always missed even where real backlinks
  // existed, so the backlinks strip at the bottom of `/docs` never rendered — e.g.
  // a `[[capabilities/topology-canvas-render]]` link written inside an
  // `ontology/elements/*` document.
  it('ontology/ 문서 안의 위키링크는 ontology/ 접두사를 붙여 정규화한다', () => {
    const body = '같은 캔버스 엔진 얘기는 [[capabilities/topology-canvas-render]] 참고.';
    const { contexts } = extractOutLinksWithContext(
      body,
      'ontology/elements/sigma-graphology',
    );
    expect(contexts).toHaveLength(1);
    expect(contexts[0].target).toBe('ontology/capabilities/topology-canvas-render');
    expect(contexts[0].linkText).toBe('capabilities/topology-canvas-render');
  });

  it('이미 ontology/ 접두사가 붙은 위키링크는 이중으로 접두사를 붙이지 않는다', () => {
    const body = '전체 문맥은 [[ontology/project]] 문서 참고.';
    const { contexts } = extractOutLinksWithContext(
      body,
      'ontology/domains/views',
    );
    expect(contexts[0].target).toBe('ontology/project');
  });

  it('ontology/ 바깥(최상위) 문서의 위키링크는 그대로 vault 루트 기준을 유지한다', () => {
    const body = '자세한 기능은 [[FEATURES]] 참고.';
    const { contexts } = extractOutLinksWithContext(body, 'CHANGELOG');
    expect(contexts[0].target).toBe('FEATURES');
  });

  it('표준 markdown 상대경로 링크는 (이미 정확했던) fromDir 기준 정규화를 그대로 유지한다', () => {
    const body = '관련 element 는 [여기](../domains/ai-agent-partner.md) 참고.';
    const { contexts } = extractOutLinksWithContext(
      body,
      'ontology/capabilities/mcp-server',
    );
    expect(contexts[0].target).toBe('ontology/domains/ai-agent-partner');
  });
});

/**
 * ⚠️ **The renderer and the folder check must fold a bare `[[slug]]` into the same
 * name** (measured 2026-09-09).
 *
 * `docs/ONTOLOGY-ATLAS-SPEC.md` §11.4 says a page link is `[[wiki/<slug>]]` **or**
 * `[[<slug>]]`, and `validateWikiFolder` has always resolved the bare form inside
 * `wiki/`. This function did not, and the two disagreed in both directions on one
 * folder: a bare `[[budget]]` rendered as plain text with no anchor and drew no edge on
 * the Library graph, while the folder check reported the link as perfectly resolved. A
 * genuinely dead link passed every gate the product has.
 */
describe('extractOutLinksWithContext — a bare wikilink inside wiki/ names a page in wiki/', () => {
  it('wiki/ 문서 안의 맨 슬러그는 wiki/ 안의 페이지로 풀린다', () => {
    const body = '분기 계획은 [[budget]] 문서를 참고.';
    const { slugs, contexts } = extractOutLinksWithContext(body, 'wiki/quarter-plan');
    expect(slugs).toEqual(['wiki/budget']);
    expect(contexts[0].target).toBe('wiki/budget');
    // The reader still shows what the author typed, not the resolved path.
    expect(contexts[0].linkText).toBe('budget');
  });

  it('슬래시가 있는 대상은 vault 루트 기준이라 wiki/ 를 덧붙이지 않는다', () => {
    const body = '이 글은 [[capabilities/checkout]] 과 [[wiki/budget]] 을 가리킨다.';
    const { slugs } = extractOutLinksWithContext(body, 'wiki/quarter-plan');
    expect(slugs).toEqual(['capabilities/checkout', 'wiki/budget']);
  });

  it('wiki/ 바깥 문서의 맨 슬러그는 종전대로 vault 루트를 가리킨다', () => {
    const { slugs } = extractOutLinksWithContext('[[budget]] 참고.', 'capabilities/checkout');
    expect(slugs).toEqual(['budget']);
  });

  it('폴더 검사와 같은 답을 낸다: 두 해석기가 같은 대상을 만든다', () => {
    // The folder half normalises with `wiki-page-schema.ts`; if that boundary and this
    // one ever part again, one of these two assertions moves and the other does not.
    const { slugs } = extractOutLinksWithContext('[[budget]] [[wiki/budget]]', 'wiki/a');
    expect(new Set(slugs)).toEqual(new Set(['wiki/budget']));
  });
});

describe('extractOutLinksWithContext — a wiki citation is not a link', () => {
  it('skips [[src:sources/…#anchor]] and keeps the page links beside it', () => {
    const body = '- fact [[src:sources/plan.pdf#p2]] and see [[wiki/other]] and [[src:sources/a.csv#r3|row]]';
    const { slugs, contexts } = extractOutLinksWithContext(body, 'wiki/me');
    expect(slugs).toEqual(['wiki/other']);
    expect(contexts.map((c) => c.target)).toEqual(['wiki/other']);
  });
});

describe('parseFrontmatter — malformed-quoted-scalar', () => {
  const codesOf = (raw: string) =>
    (parseFrontmatter(raw).diagnostics ?? []).map((d) => d.code);

  const FLAGGED: Array<[string, string]> = [
    ['closing quote followed by text', 'display_ko: "에이전트" 목적지'],
    ['single quotes closing early', "title: 'a' b"],
    ['double quote never closed', 'title: "unclosed'],
    ['a lone quote', 'title: "'],
  ];
  for (const [name, line] of FLAGGED) {
    it(`flags ${name}`, () => {
      expect(codesOf(`---\n${line}\n---\n`)).toEqual(['malformed-quoted-scalar']);
    });
  }

  const CLEAN: Array<[string, string]> = [
    ['a properly quoted value', 'title: "a"'],
    ['a properly single-quoted value', "title: 'a'"],
    ['quotes inside an unquoted value', 'title: a "b" c'],
    ['an escaped quote inside a quoted value', 'title: "a \\"b\\""'],
    ['an empty quoted value', 'title: ""'],
    ['an empty value', 'title:'],
    // `unquote` strips a wrapping pair whenever the last character is the same
    // quote, so both of these render as written. The rule follows the renderer.
    ['an apostrophe inside a closed single-quoted pair', "title: 'Owner's guide'"],
    ['an inner pair inside a closed double-quoted pair', 'display_en: "He said "hi" today"'],
    ['a colon inside the quoted value', 'created_by: "agent:unknown"'],
  ];
  for (const [name, line] of CLEAN) {
    it(`accepts ${name}`, () => {
      expect(codesOf(`---\n${line}\n---\n`)).toEqual([]);
    });
  }

  it('names the key and offers the repaired line', () => {
    // The line that stood in docs/ontology/elements/agents-destination.md while
    // `pnpm vault:validate` reported 0 issues (2026-08-31).
    const { frontmatter, diagnostics } = parseFrontmatter(
      '---\ndisplay_ko: "에이전트" 목적지\n---\n',
    );
    // Parsing stays lenient — the broken value is exactly what every reader showed.
    expect(frontmatter.display_ko).toBe('에이전트" 목적지');
    expect(diagnostics?.[0]).toEqual({
      code: 'malformed-quoted-scalar',
      line: 2,
      message:
        'Frontmatter line 2 `display_ko:` closes its quote before the end of the value, ' +
        'so the rest is read as literal text. Close the quote or remove it: `display_ko: 에이전트 목적지`',
    });
  });
});
