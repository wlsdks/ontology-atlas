import { describe, expect, it } from 'vitest';
import { definitionSectionCases } from '../../../../tests/fixtures/definition-section-cases.mjs';
import { buildDefinitionPreview, buildExcerpt, extractOutLinkTargets, firstHeading, parseFrontmatter } from './parse-frontmatter';

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

  /* A `#` away from the start of a line is content: `path#symbol` references must keep the separator. */
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

  it('respects the max length (a truncated result stays within max+1 including the ellipsis)', () => {
    // Very long text with no spaces (no word boundary to cut at) — cut at max and append the ellipsis.
    expect(buildExcerpt('x'.repeat(500)).length).toBeLessThanOrEqual(321);
    expect(buildExcerpt('x'.repeat(500)).endsWith('…')).toBe(true);
    expect(buildExcerpt('x'.repeat(500), 50).length).toBeLessThanOrEqual(51);
  });

  it('cuts at a word boundary instead of mid-word and appends an ellipsis', () => {
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

describe('extractOutLinkTargets — wikilinks inside the nested ontology/ vault', () => {
  // `docs/ontology/` is the nested MCP vault this project dogfoods. Wikilinks inside it
  // (`[[capabilities/x]]`) use slugs relative to that vault root, while the real document slug
  // carries an `ontology/` prefix; without the prefix, backlinks from these documents never match.
  it('a wikilink inside an ontology/ document is normalized with the ontology/ prefix', () => {
    const body = '같은 캔버스 엔진 얘기는 [[capabilities/topology-canvas-render]] 참고.';
    expect(extractOutLinkTargets(body, 'ontology/elements/sigma-graphology')).toEqual([
      'ontology/capabilities/topology-canvas-render',
    ]);
  });

  it('a wikilink that already has the ontology/ prefix does not get it twice', () => {
    expect(extractOutLinkTargets('전체 문맥은 [[ontology/project]] 문서 참고.', 'ontology/domains/views')).toEqual(['ontology/project']);
  });

  it('a wikilink in a document outside ontology/ (top level) stays relative to the vault root', () => {
    expect(extractOutLinkTargets('자세한 기능은 [[FEATURES]] 참고.', 'CHANGELOG')).toEqual(['FEATURES']);
  });

  it('a standard markdown relative link resolves against the linking document folder', () => {
    const body = '관련 element 는 [여기](../domains/ai-agent-partner.md) 참고.';
    expect(extractOutLinkTargets(body, 'ontology/capabilities/mcp-server')).toEqual(['ontology/domains/ai-agent-partner']);
  });
});

/**
 * The renderer and the folder check must fold a bare `[[slug]]` inside `wiki/` into the same name
 * (`docs/ONTOLOGY-ATLAS-SPEC.md` section 11.4).
 */
describe('extractOutLinkTargets — a bare wikilink inside wiki/ names a page in wiki/', () => {
  it('a bare slug inside a wiki/ document resolves to a page under wiki/', () => {
    expect(extractOutLinkTargets('분기 계획은 [[budget]] 문서를 참고.', 'wiki/quarter-plan')).toEqual(['wiki/budget']);
  });

  it('a target with a slash is relative to the vault root, so wiki/ is not prepended', () => {
    const body = '이 글은 [[capabilities/checkout]] 과 [[wiki/budget]] 을 가리킨다.';
    expect(extractOutLinkTargets(body, 'wiki/quarter-plan')).toEqual(['capabilities/checkout', 'wiki/budget']);
  });

  it('a bare slug in a document outside wiki/ still points at the vault root, as before', () => {
    expect(extractOutLinkTargets('[[budget]] 참고.', 'capabilities/checkout')).toEqual(['budget']);
  });

  it('gives the same answer as the folder check: both resolvers build the same target', () => {
    // The folder half normalises with `wiki-page-schema.ts`; if that boundary and this
    // one ever part again, one of these two assertions moves and the other does not.
    expect(extractOutLinkTargets('[[budget]] [[wiki/budget]]', 'wiki/a')).toEqual(['wiki/budget']);
  });
});

describe('extractOutLinkTargets — what is not a link to a document', () => {
  it('skips [[src:sources/…#anchor]] citations and keeps the page links beside it', () => {
    const body = '- fact [[src:sources/plan.pdf#p2]] and see [[wiki/other]] and [[src:sources/a.csv#r3|row]]';
    expect(extractOutLinkTargets(body, 'wiki/me')).toEqual(['wiki/other']);
  });

  it('skips web, anchor-only, non-Markdown and self links, and lists a target once in first-link order', () => {
    const body = '[w](https://x.test/a.md) [h](#top) [i](pic.png) [me](me.md) [b](b.md) [[a]] [again](./b.md#part) [[a|A]]';
    expect(extractOutLinkTargets(body, 'notes/me')).toEqual(['notes/b', 'a']);
  });

  it('keeps a Windows backslash as part of the name: only a slash separates folders in a vault path', () => {
    expect(extractOutLinkTargets('[w](..\\domains\\x.md) [[notes\\win]]', 'notes/me')).toEqual(['notes/..\\domains\\x', 'notes\\win']);
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


describe('complete opening definition previews', () => {
  it.each(['\n', '\r\n'])('preserves opening content with line separator %j and a long remainder', (separator) => {
    const body = ['```', '# shell comment', '```', '# Title', '', 'Definition.', '', ...Array(10_000).fill('Later content.')].join(separator);
    expect(firstHeading(body)).toBe(separator === '\n' ? 'Title' : null);
    const prose = ['# Title', '', 'Definition.', 'with a qualification.', '', ...Array(10_000).fill('Later content.')].join(separator);
    expect(buildDefinitionPreview(prose, { title: 'Title' })).toBe('Definition. with a qualification.');
    expect(buildDefinitionPreview(prose.replace('with a qualification.', '| qualification |'), { title: 'Title' })).toBeUndefined();
  });
  it('preserves final and consecutive carriage returns', () => {
    expect(buildDefinitionPreview('# Title\r\r\n\r\nDefinition.\r', { title: 'Title' })).toBe('Definition.');
    expect(buildDefinitionPreview('Definition.\r\n', {})).toBe('Definition.');
    expect(firstHeading('```\n# hidden\n```\n')).toBeNull();
  });
  it('preserves multiline qualifications and inline references under a recorded title', () => {
    expect(buildDefinitionPreview('\n# 재시도\n\n다시 읽지만 [[report|보고서]]는\n저장하지 않는다. See `path.ts#retry` and [policy](./policy).\n\n## Excludes\nPersisting a report.', { title: 'Retry', display_ko: '재시도' })).toBe('다시 읽지만 [[report|보고서]]는 저장하지 않는다. See `path.ts#retry` and [policy](./policy).');
  });
  it('accepts a complete paragraph at the budget and abstains before clipping a late qualification', () => {
    expect(buildDefinitionPreview('a'.repeat(320), {})).toBe('a'.repeat(320));
    expect(buildDefinitionPreview('A retry is allowed. '.repeat(20) + 'But this is uncertain.', {})).toBeUndefined();
  });
  it.each([
    '# Excludes\nPersisting a report.',
    '## Includes\nRetries.',
    '- Retries.', '+ Retries.', '* Retries.', '1. Retries.',
    '> Retries.', '```text\nRetries.\n```', '~~~\nRetries.\n~~~',
    '    Retries.', '\tRetries.', '<div>Retries.</div>',
    '| Responsibility |\n| --- |\n| Retries |',
    'Responsibility | Policy\n--- | ---\nRetries | Always',
    'Excludes\n========\nPersisting a report.',
    'Excludes\n--------\nPersisting a report.',
    '# Retry\n\n## Excludes\nPersisting a report.',
    '# Retry\n\n# Retry\nRetries.',
    '',
  ])('does not promote block content into a definition: %s', (body) => {
    expect(buildDefinitionPreview(body, { title: 'Retry' })).toBeUndefined();
  });
  it.each(['## Excludes', '- Excluded', '> Quoted', '```'])('ends prose at the next block: %s', (block) => {
    expect(buildDefinitionPreview(`Retries but never persists.\n${block}\nPersisting a report.`, {})).toBe('Retries but never persists.');
  });
  it('does not treat an inferred first heading as authored title authority', () => {
    expect(buildDefinitionPreview('# Excludes\nPersisting a report.', {})).toBeUndefined();
  });
});


describe('ambiguous definition continuations', () => {
  it.each(definitionSectionCases)('reads $name without dropping its qualification', ({ body, expected }) => {
    expect(buildDefinitionPreview(body, { title: 'Retry' })).toBe(expected);
  });
  it('keeps indented continuation text even when its first character resembles a block', () => {
    expect(buildDefinitionPreview('Retry dispatch may write reports\n    # only with explicit approval.', {})).toBe('Retry dispatch may write reports # only with explicit approval.');
  });
  it.each(['| only with approval |', '<em>only with approval</em>', '![only with approval](policy.png)', '[approval]: policy.md'])('abstains instead of returning an unqualified prefix: %s', (continuation) => {
    expect(buildDefinitionPreview(`Retry dispatch may write reports\n${continuation}`, {})).toBeUndefined();
  });
});
