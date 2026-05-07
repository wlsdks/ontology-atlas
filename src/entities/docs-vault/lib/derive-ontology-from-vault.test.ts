import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/types';

function makeDoc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: partial.path ?? `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    description: partial.description,
    tags: partial.tags ?? [],
    frontmatter: partial.frontmatter ?? {},
    headings: partial.headings ?? [],
    excerpt: partial.excerpt ?? '',
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? '2026-04-01T00:00:00.000Z',
    linksOut: partial.linksOut ?? [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' },
  };
}

describe('deriveOntologyFromVault', () => {
  it('frontmatter 가 빈 vault → 빈 결과 + warning', () => {
    const result = deriveOntologyFromVault(makeManifest([]));
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('frontmatter');
  });

  it('kind + capabilities → doc node + capability nodes + contains edges', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/checkout',
          title: '결제 시스템',
          frontmatter: {
            kind: 'project',
            capabilities: ['결제 처리', '환불'],
          },
        }),
      ]),
    );
    expect(result.nodes.find((n) => n.id === 'project:checkout')?.title).toBe('결제 시스템');
    expect(result.nodes.find((n) => n.id === 'capability:결제-처리')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'capability:환불')).toBeDefined();
    const containsEdges = result.edges.filter((e) => e.type === 'contains');
    expect(containsEdges).toHaveLength(2);
    expect(containsEdges.every((e) => e.from === 'project:checkout')).toBe(true);
  });

  it('domain + elements + relates 모두 분기', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'specs/payment',
          frontmatter: {
            kind: 'workflow',
            title: '결제 흐름',
            domain: 'payments',
            elements: ['gateway', 'queue'],
            relates: ['legacy-checkout'],
          },
        }),
      ]),
    );
    expect(result.nodes.find((n) => n.kind === 'domain')?.title).toBe('payments');
    expect(result.nodes.find((n) => n.id === 'element:gateway')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'element:queue')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'unknown:legacy-checkout')?.kind).toBe('unknown');
    const relatedEdges = result.edges.filter((e) => e.type === 'related_to');
    expect(relatedEdges).toHaveLength(1);
    // domain edge 는 domain (parent) → docNode (child) 방향이어야 트리에서
    // 도메인 아래에 workflow 가 매달린다 (\`contains\` from=parent, to=child).
    const domainContainsEdge = result.edges.find(
      (e) =>
        e.type === 'contains' &&
        e.from === 'domain:payments' &&
        e.to === 'workflow:payment',
    );
    expect(domainContainsEdge).toBeDefined();
  });

  it('relates[] — `capabilities/foo` 형식 ref 가 기존 capability 노드로 resolve', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'capabilities/mcp-server',
          frontmatter: { kind: 'capability', title: 'MCP server' },
        }),
        makeDoc({
          slug: 'elements/mcp-sdk',
          frontmatter: {
            kind: 'element',
            title: '@modelcontextprotocol/sdk',
            relates: ['capabilities/mcp-server'],
          },
        }),
      ]),
    );
    // \`unknown:capabilitiesmcp-server\` 같은 mangled stub 이 만들어지면 안 된다.
    expect(
      result.nodes.find((n) => n.id.startsWith('unknown:capabilities')),
    ).toBeUndefined();
    // 대신 기존 capability 노드를 가리키는 related_to edge 가 있어야 한다.
    const resolvedEdge = result.edges.find(
      (e) =>
        e.type === 'related_to' &&
        e.from === 'element:mcp-sdk' &&
        e.to === 'capability:mcp-server',
    );
    expect(resolvedEdge).toBeDefined();
  });

  it('domains[] (plural) — project → 자식 도메인 contains edge', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'project',
          frontmatter: {
            kind: 'project',
            title: 'workbench',
            domains: ['auth', 'billing'],
          },
        }),
      ]),
    );
    expect(result.nodes.find((n) => n.id === 'domain:auth')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'domain:billing')).toBeDefined();
    const containsToAuth = result.edges.find(
      (e) =>
        e.type === 'contains' &&
        e.from === 'project:project' &&
        e.to === 'domain:auth',
    );
    expect(containsToAuth).toBeDefined();
  });

  it('dependencies → depends_on 같은 kind 에', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/auth-service',
          frontmatter: {
            kind: 'project',
            dependencies: ['user-store', 'session-store'],
          },
        }),
      ]),
    );
    const depEdges = result.edges.filter((e) => e.type === 'depends_on');
    expect(depEdges).toHaveLength(2);
    expect(depEdges.find((e) => e.to === 'project:user-store')).toBeDefined();
  });

  it('kind 없는 doc 은 무시', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'random/note',
          frontmatter: { capabilities: ['orphan'] },
        }),
      ]),
    );
    expect(result.nodes).toHaveLength(0);
  });

  it('양방향 frontmatter (domain.capabilities[] + capability.domain:) → contains edge dedup', () => {
    // 같은 contains 관계가 두 진입경로에서 등장:
    //   domains/auth.md          → capabilities: ['login']
    //   capabilities/login.md    → domain: auth
    // 두 doc 모두 \`domain:auth--contains-->capability:login\` edge 를 만들지만
    // 그래프 입장에서는 같은 edge — id 충돌은 React duplicate-key 경고로 이어지고
    // ego-graph 가 일부 edge 를 silently 누락한다. 같은 (from, to, type) 은 1 edge.
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'domains/auth',
          frontmatter: { kind: 'domain', title: 'auth', capabilities: ['login'] },
        }),
        makeDoc({
          slug: 'capabilities/login',
          frontmatter: { kind: 'capability', title: 'login', domain: 'auth' },
        }),
      ]),
    );
    const containsEdges = result.edges.filter(
      (e) =>
        e.type === 'contains' &&
        e.from === 'domain:auth' &&
        e.to === 'capability:login',
    );
    expect(containsEdges).toHaveLength(1);
    // 전체 edge id 도 unique 해야 한다.
    const ids = result.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('동일 capability 가 여러 doc 에 등장 → 단일 node 로 dedup', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/a',
          frontmatter: { kind: 'project', capabilities: ['shared-cap'] },
        }),
        makeDoc({
          slug: 'projects/b',
          frontmatter: { kind: 'project', capabilities: ['shared-cap'] },
        }),
      ]),
    );
    const capNodes = result.nodes.filter((n) => n.kind === 'capability');
    expect(capNodes).toHaveLength(1);
    const containsEdges = result.edges.filter((e) => e.type === 'contains');
    // 두 project 모두 같은 cap 을 가리킴 — edge 는 2개.
    expect(containsEdges).toHaveLength(2);
  });
});
