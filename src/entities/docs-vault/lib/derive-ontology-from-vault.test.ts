import { describe, expect, it } from 'vitest';
import { buildLocalManifest } from './build-local-manifest';
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
  it('same-kind docs sharing a filename tail both survive as nodes', () => {
    // Two same-kind docs with the same tail must not overwrite each other.
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'capabilities/auth',
          frontmatter: { kind: 'capability', title: 'Auth' },
        }),
        makeDoc({
          slug: 'archive/auth',
          frontmatter: { kind: 'capability', title: 'Old auth' },
        }),
      ]),
    );
    const authNodes = result.nodes.filter((node) => node.sourceSlug?.endsWith('auth'));
    expect(authNodes).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes('capability:auth'))).toBe(true);
  });

  it('keeps vault-readme in the derived graph for the topology surface to exclude', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'README',
          title: 'Vault guide',
          frontmatter: { kind: 'vault-readme', title: 'Vault guide' },
        }),
        makeDoc({
          slug: 'projects/example',
          title: 'Example',
          frontmatter: { kind: 'project', title: 'Example' },
        }),
      ]),
    );
    expect(result.nodes.map((node) => node.kind)).toContain('vault-readme');
    expect(result.nodes.map((node) => node.title)).toContain('Vault guide');
    expect(result.sourceConceptCount).toBe(2);
    expect(result.sourceKindCounts).toEqual({ 'vault-readme': 1, project: 1 });
  });

  it('returns an empty result and a warning for a vault without frontmatter', () => {
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

  it('derives edges from domain, elements and relates', () => {
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
    // `contains` runs parent → child, so a `domain:` edge runs domain → doc.
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

  it('resolves a `capabilities/foo` relates ref to the existing capability node', () => {
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
    // No mangled stub such as `unknown:capabilitiesmcp-server`.
    expect(
      result.nodes.find((n) => n.id.startsWith('unknown:capabilities')),
    ).toBeUndefined();
    // A related_to edge onto the existing capability node instead.
    const resolvedEdge = result.edges.find(
      (e) =>
        e.type === 'related_to' &&
        e.from === 'element:mcp-sdk' &&
        e.to === 'capability:mcp-server',
    );
    expect(resolvedEdge).toBeDefined();
  });

  it('creates no duplicate unknown nodes for folder-prefixed domain, dependencies and contains refs', () => {
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

  it('derives project-to-domain contains edges from domains[]', () => {
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

  it('derives depends_on edges from dependencies', () => {
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

  it('derives depends_on edges from the canonical depends_on key', () => {
    // `depends_on` is canonical for capability/element (`mcp/src/schema.mjs`), so the web reads it too.
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'capabilities/token-issue',
          frontmatter: {
            kind: 'capability',
            depends_on: ['jwt-signer', 'key-store'],
          },
        }),
      ]),
    );
    const depEdges = result.edges.filter((e) => e.type === 'depends_on');
    expect(depEdges).toHaveLength(2);
    expect(depEdges.find((e) => e.to === 'capability:jwt-signer')).toBeDefined();
    expect(depEdges.find((e) => e.to === 'capability:key-store')).toBeDefined();
  });

  it('unions dependencies and depends_on without duplicating a target', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'capabilities/session',
          frontmatter: {
            kind: 'capability',
            dependencies: ['shared-target', 'only-dep'],
            depends_on: ['shared-target', 'only-alias'],
          },
        }),
      ]),
    );
    const depEdges = result.edges.filter((e) => e.type === 'depends_on');
    expect(depEdges.map((e) => e.to).sort()).toEqual([
      'capability:only-alias',
      'capability:only-dep',
      'capability:shared-target',
    ]);
  });

  it('ignores a doc without kind', () => {
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

  it('dedupes a contains edge declared from both sides', () => {
    // `domains/auth.md` lists `login` and `capabilities/login.md` names `domain: auth`; both mean one
    // edge, and a duplicate id breaks React keys and the ego graph.
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
    // Edge ids are unique.
    const ids = result.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dedupes a capability referenced by several docs into one node', () => {
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
    // Both projects point at the same capability — two edges.
    expect(containsEdges).toHaveLength(2);
  });
});
/** `relation_notes` becomes the matching edge's label. */
describe("relation_notes → edge label", () => {
  it.each([false, true])('keeps the declared reason when containment is stated at both ends (parent first: %s)', (parentFirst) => {
    const child = makeDoc({ slug: 'capabilities/review', frontmatter: { kind: 'capability', title: 'Review', domain: 'domains/agents' } });
    const parent = makeDoc({ slug: 'domains/agents', frontmatter: { kind: 'domain', title: 'Agents', capabilities: ['capabilities/review'], relation_notes: { 'capabilities/review': 'Agents owns review because it preserves the evidence used for judgment.' } } });
    const result = deriveOntologyFromVault(makeManifest(parentFirst ? [parent, child] : [child, parent]));
    const edges = result.edges.filter((edge) => edge.from === 'domain:agents' && edge.to === 'capability:review');
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe('Agents owns review because it preserves the evidence used for judgment.');
    expect(edges[0].sourceSlug).toBe('domains/agents');
  });
  it("carries a dependencies ref note on its edge", () => {
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


describe("domains[] folder-prefixed refs", () => {
  it("merges a 'domains/tasks' ref into the real domain node", () => {
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

  it("slugifies a plain name ('auth') into a stub", () => {
    const manifest = makeManifest([
      makeDoc({ slug: "project", frontmatter: { kind: "project", title: "P", domains: ["auth"] } }),
    ]);
    const result = deriveOntologyFromVault(manifest);
    expect(result.nodes.some((n) => n.id === "domain:auth")).toBe(true);
  });
});

describe("element display names from code paths", () => {
  it("keeps the raw path as title and a readable display for elements[] nodes", () => {
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

  it("prefers an explicit display over the derived one", () => {
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

  it("does not derive display names for non-element kinds", () => {
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
  // A derived node's sourceSlug is the citing document, not its own.
  it("sets hasOwnDocument only for nodes with their own document", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "capabilities/frontmatter-to-ontology",
        title: "Frontmatter to Ontology",
        frontmatter: {
          kind: "capability",
          elements: ["elements/derive-ontology-from-vault"],
          relates: ["capabilities/only-mentioned"],
        },
      }),
    ]);
    const result = deriveOntologyFromVault(manifest);

    const authored = result.nodes.find(
      (n) => n.id === "capability:frontmatter-to-ontology",
    );
    expect(authored?.hasOwnDocument).toBe(true);
    expect(authored?.sourceSlug).toBe("capabilities/frontmatter-to-ontology");

    // Relation-only node: its sourceSlug is the citing document.
    const derived = result.nodes.find(
      (n) => n.id === "element:derive-ontology-from-vault",
    );
    expect(derived?.hasOwnDocument).toBe(false);
    expect(derived?.sourceSlug).toBe("capabilities/frontmatter-to-ontology");

    const relatedOnly = result.nodes.find(
      (n) => n.id === "capability:only-mentioned",
    );
    expect(relatedOnly?.hasOwnDocument).toBe(false);
  });

  it("sets hasOwnDocument=false on nodes derived from every relation key", () => {
    const manifest = makeManifest([
      makeDoc({
        slug: "projects/atlas",
        frontmatter: {
          kind: "project",
          slug: "atlas",
          domains: ["domains/plural-domain"],
          capabilities: ["capabilities/from-capabilities"],
          elements: ["elements/from-elements"],
          contains: ["documents/from-contains"],
          relates: ["from-relates"],
          dependencies: ["projects/from-dependencies"],
          broader: ["projects/from-broader"],
        },
      }),
      makeDoc({
        slug: "capabilities/child",
        frontmatter: { kind: "capability", domain: "Singular Domain" },
      }),
    ]);
    const result = deriveOntologyFromVault(manifest);

    const authoredIds = new Set(["project:atlas", "capability:child"]);
    for (const n of result.nodes) {
      expect({ id: n.id, own: n.hasOwnDocument }).toEqual({
        id: n.id,
        own: authoredIds.has(n.id),
      });
    }
    // One derived node per relation key, singular `domain` included.
    expect(result.nodes.filter((n) => !n.hasOwnDocument)).toHaveLength(8);
  });
});


describe('authored definition projection through the local manifest', () => {
  const intro = 'Retries a failed read, but does not persist a report.';
  const boundaries = '\n\n## Includes\nRetrying reads.\n\n## Excludes\nPersisting a report.\n\n## Uncertainty\nThe retry limit is unknown.';
  const cases = [
    { name: 'inline-pipe-qualification', metadata: '', body: 'Retry dispatch may write reports\nonly for `ReadRequest | WriteRequest` with explicit approval.', expected: 'Retry dispatch may write reports only for `ReadRequest | WriteRequest` with explicit approval.' },
    { name: 'indented-qualification', metadata: '', body: 'Retry dispatch may write reports\n    only with explicit approval.', expected: 'Retry dispatch may write reports only with explicit approval.' },
    { name: 'tabbed-qualification', metadata: '', body: 'Retry dispatch may write reports\n\tonly with explicit approval.', expected: 'Retry dispatch may write reports only with explicit approval.' },
    { name: 'intro', metadata: '', body: intro + boundaries, expected: intro },
    { name: 'empty', metadata: 'description: ""\n', body: intro, expected: intro },
    { name: 'blank', metadata: 'description: "   "\n', body: intro, expected: intro },
    { name: 'authored', metadata: `description: "  ${'Authored qualification. '.repeat(20)}  "\n`, body: intro, expected: 'Authored qualification. '.repeat(20).trim() },
    { name: 'title', metadata: '', body: '# Retry\n\n' + intro + boundaries, expected: intro },
    { name: 'display', metadata: 'display_ko: 재시도\n', body: '# 재시도\n\n다시 읽지만\n보고서를 저장하지 않는다.' + boundaries, expected: '다시 읽지만 보고서를 저장하지 않는다.' },
    { name: 'section', metadata: '', body: '## Excludes\nPersisting a report.', expected: undefined },
    { name: 'misleading', metadata: '', body: '# Excludes\nPersisting a report.', expected: undefined },
    { name: 'inferred-title', metadata: '', body: '# Excludes\nPersisting a report.', expected: undefined, omitTitle: true },
    { name: 'list', metadata: '', body: '- Persisting a report.', expected: undefined },
    { name: 'long', metadata: '', body: 'A retry is allowed. '.repeat(20) + 'But this is uncertain.', expected: undefined },
  ];
  it.each(cases)('preserves definition eligibility for $name', async ({ name, metadata, body, expected, omitTitle }) => {
    const raw = `---\nkind: capability\n${omitTitle ? '' : 'title: Retry\n'}${metadata}---\n${body}`;
    const file = { kind: 'file', name: `${name}.md`, getFile: async () => ({ text: async () => raw, lastModified: 1 }) };
    const root = { kind: 'directory', name: 'Definitions', entries: async function* () { yield [file.name, file]; } } as unknown as FileSystemDirectoryHandle;
    const { manifest } = await buildLocalManifest(root);
    const result = deriveOntologyFromVault(manifest);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].summary).toBe(expected);
    if (name === 'intro') {
      expect(manifest.docs[0].excerpt).toContain('Persisting a report.');
      expect(await (await file.getFile()).text()).toContain('## Excludes\nPersisting a report.');
    }
  });
});
