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
    expect(result.sourceConceptCount).toBe(0);
    expect(result.sourceKindCounts).toEqual({});
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
    expect(result.sourceConceptCount).toBe(1);
    expect(result.sourceKindCounts).toEqual({ project: 1 });
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
    expect(result.sourceKindCounts).toEqual({ workflow: 1 });
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

  it('sourceKindCounts counts frontmatter docs without relation-derived stubs', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'domains/payments',
          frontmatter: { kind: 'domain', title: 'Payments' },
        }),
        makeDoc({
          slug: 'capabilities/refund',
          frontmatter: {
            kind: 'capability',
            title: 'Refund',
            domain: 'payments',
            elements: ['refund-worker'],
          },
        }),
        makeDoc({
          slug: 'elements/gateway',
          frontmatter: { kind: 'element', title: 'Gateway' },
        }),
      ]),
    );

    expect(result.nodes.find((n) => n.id === 'element:refund-worker')).toBeDefined();
    expect(result.sourceConceptCount).toBe(3);
    expect(result.sourceKindCounts).toEqual({
      domain: 1,
      capability: 1,
      element: 1,
    });
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

  it('folder-prefixed refs — domain / dependencies / contains 가 중복 unknown 노드를 만들지 않는다', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'ops-signal-board',
          frontmatter: {
            kind: 'project',
            title: 'Ops Signal Board',
            contains: ['capabilities/storage'],
          },
        }),
        makeDoc({
          slug: 'domains/incident-intake',
          frontmatter: {
            kind: 'domain',
            title: 'Incident Intake',
          },
        }),
        makeDoc({
          slug: 'capabilities/app',
          frontmatter: {
            kind: 'capability',
            title: 'App',
            domain: 'domains/incident-intake',
            dependencies: ['capabilities/storage'],
          },
        }),
        makeDoc({
          slug: 'capabilities/storage',
          frontmatter: {
            kind: 'capability',
            title: 'Storage',
            domain: 'domains/incident-intake',
          },
        }),
      ]),
    );

    expect(result.nodes.find((n) => n.id === 'domain:incident-intake')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'domain:domainsincident-intake')).toBeUndefined();
    expect(result.nodes.find((n) => n.id === 'capability:storage')).toBeDefined();
    expect(
      result.nodes.find((n) => n.id === 'capability:capabilitiesstorage'),
    ).toBeUndefined();
    expect(
      result.edges.find(
        (e) =>
          e.type === 'contains' &&
          e.from === 'project:ops-signal-board' &&
          e.to === 'capability:storage',
      ),
    ).toBeDefined();
    expect(
      result.edges.find(
        (e) =>
          e.type === 'depends_on' &&
          e.from === 'capability:app' &&
          e.to === 'capability:storage',
      ),
    ).toBeDefined();
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
/** P6 — relation_notes 가 해당 엣지의 label(왜)로 승격된다. */
describe("relation_notes → edge label", () => {
  it("dependencies ref 의 노트가 그 엣지에 실린다", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "capabilities/writer",
        frontmatter: {
          kind: "capability",
          title: "Writer",
          dependencies: ["capabilities/mcp-server"],
          relation_notes: { "capabilities/mcp-server": "쓰기 경로가 이 서버를 지난다" },
        },
      }),
      makeDoc({ slug: "capabilities/mcp-server", frontmatter: { kind: "capability", title: "MCP Server" } }),
    ]);
    const d = deriveOntologyFromVault(manifest);
    const edge = d.edges.find((e) => e.type === "depends_on" && e.sourceSlug === "capabilities/writer");
    expect(edge?.label).toBe("쓰기 경로가 이 서버를 지난다");
  });
});


describe("domains[] folder-prefixed ref (리텐션 P4-① 팬텀 도메인 회귀)", () => {
  it("'domains/tasks' 참조가 실 도메인 노드와 병합된다 — 팬텀 민팅 금지", () => {
    const manifest = makeManifest([
      makeDoc({ slug: "project", frontmatter: { kind: "project", title: "P", domains: ["domains/tasks"] } }),
      makeDoc({ slug: "domains/tasks", title: "Tasks", frontmatter: { kind: "domain", title: "Tasks" } }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    const domainNodes = result.nodes.filter((n) => n.kind === "domain");
    expect(domainNodes).toHaveLength(1);
    expect(domainNodes[0].id).toBe("domain:tasks");
    expect(result.nodes.some((n) => n.id === "domain:domainstasks")).toBe(false);
    expect(
      result.edges.some((e) => e.from.startsWith("project:") && e.to === "domain:tasks" && e.type === "contains"),
    ).toBe(true);
  });

  it("평문 이름('auth')은 종전대로 slugify 스텁", () => {
    const manifest = makeManifest([
      makeDoc({ slug: "project", frontmatter: { kind: "project", title: "P", domains: ["auth"] } }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    expect(result.nodes.some((n) => n.id === "domain:auth")).toBe(true);
  });
});

describe("element display 인간화 — 슬라이스 B (코드 경로 → 사람 이름)", () => {
  it("elements[] 로 합성되는 element 노드 — title 은 원문 경로, display 는 인간화", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "capabilities/writer",
        frontmatter: {
          kind: "capability",
          title: "Writer",
          elements: ["src/foo/bar-baz.ts"],
        },
      }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    const el = result.nodes.find((n) => n.kind === "element" && n.title === "src/foo/bar-baz.ts");
    expect(el).toBeDefined();
    expect(el?.title).toBe("src/foo/bar-baz.ts");
    expect(el?.display).toBe("Bar Baz");
  });

  it("element doc 에 display: 가 명시되면 인간화가 지지 않는다", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "elements/bar-baz",
        title: "src/foo/bar-baz.ts",
        frontmatter: {
          kind: "element",
          title: "src/foo/bar-baz.ts",
          display: "커스텀 이름",
        },
      }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    const el = result.nodes.find((n) => n.id === "element:bar-baz");
    expect(el?.title).toBe("src/foo/bar-baz.ts");
    expect(el?.display).toBe("커스텀 이름");
  });

  it("element 가 아닌 kind 는 경로처럼 보여도 인간화되지 않는다", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "capabilities/src-tool",
        title: "src/tools/exporter.ts",
        frontmatter: { kind: "capability", title: "src/tools/exporter.ts" },
      }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    const cap = result.nodes.find((n) => n.id === "capability:src-tool");
    expect(cap?.title).toBe("src/tools/exporter.ts");
    expect(cap?.display).toBe("src/tools/exporter.ts");
  });
});
