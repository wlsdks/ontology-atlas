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
    // 들여쓰기 다음 줄이 dash 인 경우 list 가 먼저 매치.
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

  it('respects the max length', () => {
    expect(buildExcerpt('x'.repeat(500)).length).toBe(320);
    expect(buildExcerpt('x'.repeat(500), 50).length).toBe(50);
  });
});

describe('extractOutLinksWithContext — wikilinks inside the nested ontology/ vault', () => {
  // persona QA (fix/persona-findings ③): docs/ontology/ 는 이 프로젝트가
  // dogfood 하는 중첩 MCP vault — 그 안의 위키링크(`[[capabilities/x]]`)는
  // ontology-vault-루트 기준 slug 를 쓰지만, 실제 문서 slug 는
  // `ontology/` 접두사가 붙는다. 접두사 보정 없이는 실제 역참조가 있어도
  // backlinksDetail 조회가 항상 빗나가 `/docs` 하단 backlinks strip 이
  // 절대 렌더되지 않았다 (예: docs/ontology/elements/sigma-graphology.md
  // 의 `[[capabilities/topology-canvas-render]]`).
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
