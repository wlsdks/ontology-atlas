import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import type { VaultManifest, VaultDoc } from "@/entities/docs-vault";
import {
  buildVaultGraphFlow,
  resolveNodeDomainSlug,
  stripTrailingParenthetical,
} from "./use-vault-graph-flow";

function makeDoc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: partial.path ?? `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    description: partial.description,
    tags: partial.tags ?? [],
    frontmatter: partial.frontmatter ?? {},
    headings: partial.headings ?? [],
    excerpt: partial.excerpt ?? "",
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? "2026-05-01T00:00:00Z",
    linksOut: partial.linksOut ?? [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "v1",
    generatedAt: "2026-05-01T00:00:00Z",
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir", children: [] },
  };
}

describe("buildVaultGraphFlow", () => {
  it("kind 가 없는 doc 은 노드로 만들지 않는다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({ slug: "no-kind", frontmatter: { title: "X" } }),
        makeDoc({
          slug: "capabilities/foo",
          frontmatter: { kind: "capability", title: "Foo" },
        }),
      ]),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["capabilities/foo"]);
  });

  it("node id 가 vault slug 와 일치 (인스펙터 lookup 안전)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "capabilities/mcp-server",
          title: "MCP Server",
          frontmatter: { kind: "capability", title: "MCP Server" },
        }),
      ]),
    );
    expect(result.nodes[0].id).toBe("capabilities/mcp-server");
    expect(result.nodes[0].data).toMatchObject({
      kind: "capability",
      vault: true,
      ephemeral: false,
    });
  });

  it("frontmatter array 키에서 edge 를 만들고 마지막 segment 매칭도 적용", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: { kind: "project", capabilities: ["mcp-server"] },
        }),
        makeDoc({
          slug: "capabilities/mcp-server",
          frontmatter: {
            kind: "capability",
            elements: ["mcp/src/index.js"],
          },
        }),
        makeDoc({
          slug: "elements/mcp-sdk",
          path: "elements/mcp-sdk.md",
          title: "mcp/src/index.js",
          frontmatter: { kind: "element", title: "mcp/src/index.js" },
        }),
      ]),
    );
    const edgePairs = result.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));
    // project --capabilities--> capabilities/mcp-server (tail match)
    expect(edgePairs).toContainEqual({
      source: "project",
      target: "capabilities/mcp-server",
    });
  });

  it("vault 외부 ref 는 dangling 으로 무시", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "a",
          frontmatter: { kind: "capability", relates: ["nonexistent"] },
        }),
      ]),
    );
    expect(result.edges).toEqual([]);
  });

  it("노드 카드 라벨은 트레일링 괄호 메타 strip (fullTitle 은 원본 유지)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "capabilities/cli",
          title: "CLI Developer Entry (16 commands incl. bootstrap)",
          frontmatter: {
            kind: "capability",
            title: "CLI Developer Entry (16 commands incl. bootstrap)",
          },
        }),
        makeDoc({
          slug: "capabilities/no-parens",
          title: "Plain Title",
          frontmatter: { kind: "capability", title: "Plain Title" },
        }),
      ]),
      { kindLabelOf: () => "역량" },
    );
    const cli = result.nodes.find((n) => n.id === "capabilities/cli");
    const plain = result.nodes.find((n) => n.id === "capabilities/no-parens");
    expect(cli?.data.label).toBe("역량 · CLI Developer Entry");
    expect(cli?.data.fullTitle).toBe(
      "CLI Developer Entry (16 commands incl. bootstrap)",
    );
    expect(plain?.data.label).toBe("역량 · Plain Title");
  });

  it("노드 data 에 domainSlug 가 들어간다 (capability/element=frontmatter.domain, domain=자기 tail)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "domains/foo",
          frontmatter: { kind: "domain", title: "Foo" },
        }),
        makeDoc({
          slug: "capabilities/bar",
          frontmatter: { kind: "capability", title: "Bar", domain: "foo" },
        }),
        makeDoc({
          slug: "elements/baz",
          frontmatter: { kind: "element", title: "Baz", domain: "foo" },
        }),
        makeDoc({
          slug: "project",
          frontmatter: { kind: "project", title: "P" },
        }),
      ]),
    );
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId["domains/foo"]?.data.domainSlug).toBe("foo");
    expect(byId["capabilities/bar"]?.data.domainSlug).toBe("foo");
    expect(byId["elements/baz"]?.data.domainSlug).toBe("foo");
    expect(byId["project"]?.data.domainSlug).toBeNull();
  });

  it("self-edge 는 추가 안 함", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "a",
          frontmatter: { kind: "capability", relates: ["a"] },
        }),
      ]),
    );
    expect(result.edges).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Layout contract — 선 꼬임 회귀 차단. Containment (capabilities /
  // elements / contains / domains) 만 dagre rank 에 들어가야 계층이
  // 클리어해진다. relates / dependencies / describes 가 rank 에 끼면 같은
  // kind 의 두 노드가 다른 column 으로 흩어져 사선 엣지가 폭증.
  // ─────────────────────────────────────────────────────────────────────

  it("containment chain 으로 LR 계층이 형성된다 (project → domain → capability → element)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            kind: "project",
            domains: ["foo"],
          },
        }),
        makeDoc({
          slug: "domains/foo",
          frontmatter: {
            kind: "domain",
            title: "Foo",
            capabilities: ["bar"],
          },
        }),
        makeDoc({
          slug: "capabilities/bar",
          frontmatter: {
            kind: "capability",
            title: "Bar",
            elements: ["baz"],
          },
        }),
        makeDoc({
          slug: "elements/baz",
          frontmatter: { kind: "element", title: "Baz" },
        }),
      ]),
      { layoutMode: "dagre" },
    );
    const xOf = (id: string) =>
      result.nodes.find((n) => n.id === id)?.position.x ?? NaN;
    // LR 계층 — 좌→우 단조 증가.
    expect(xOf("project")).toBeLessThan(xOf("domains/foo"));
    expect(xOf("domains/foo")).toBeLessThan(xOf("capabilities/bar"));
    expect(xOf("capabilities/bar")).toBeLessThan(xOf("elements/baz"));
  });

  it("LR layout edge endpoint 는 박스 내부를 관통하지 않도록 좌우 handle 을 쓴다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            kind: "project",
            domains: ["domains/foo"],
          },
        }),
        makeDoc({
          slug: "domains/foo",
          frontmatter: {
            kind: "domain",
            title: "Foo",
          },
        }),
      ]),
      { layoutMode: "dagre" },
    );

    for (const node of result.nodes) {
      expect(node.sourcePosition).toBe(Position.Right);
      expect(node.targetPosition).toBe(Position.Left);
    }
    expect(result.edges[0]).toMatchObject({
      type: "vault",
      sourceHandle: "source-right",
      targetHandle: "target-left",
    });
  });

  it("relates 엣지는 rank 에 영향 주지 않는다 — 같은 kind 끼리는 같은 column", () => {
    // 두 capability 가 서로 relates. 옛 버전은 rank 에 들어가서 b 가
    // a 보다 한 단계 우측. fix 후엔 둘 다 같은 rank (x 동일).
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "capabilities/a",
          frontmatter: {
            kind: "capability",
            title: "A",
            relates: ["capabilities/b"],
          },
        }),
        makeDoc({
          slug: "capabilities/b",
          frontmatter: { kind: "capability", title: "B" },
        }),
      ]),
      { layoutMode: "dagre" },
    );
    const xA = result.nodes.find((n) => n.id === "capabilities/a")?.position.x;
    const xB = result.nodes.find((n) => n.id === "capabilities/b")?.position.x;
    expect(xA).toBe(xB);
    expect(result.edges[0]).toMatchObject({
      type: "vault",
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    });
  });

  it("엣지 data 에 semanticType 이 표시된다 (containment | relation)", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "domains/foo",
          frontmatter: {
            kind: "domain",
            title: "Foo",
            capabilities: ["bar"],
          },
        }),
        makeDoc({
          slug: "capabilities/bar",
          frontmatter: {
            kind: "capability",
            title: "Bar",
            relates: ["baz"],
            dependencies: ["qux"],
          },
        }),
        makeDoc({
          slug: "capabilities/baz",
          frontmatter: { kind: "capability", title: "Baz" },
        }),
        makeDoc({
          slug: "capabilities/qux",
          frontmatter: { kind: "capability", title: "Qux" },
        }),
      ]),
    );
    const byKey = Object.fromEntries(
      result.edges.map((e) => [`${e.source}->${e.target}`, e]),
    );
    expect(byKey["domains/foo->capabilities/bar"]?.data).toMatchObject({
      semanticType: "containment",
    });
    expect(byKey["capabilities/bar->capabilities/baz"]?.data).toMatchObject({
      semanticType: "relation",
    });
    expect(byKey["capabilities/bar->capabilities/qux"]?.data).toMatchObject({
      semanticType: "relation",
    });
  });

  it("depends_on alias 를 dependencies edge 로 렌더한다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "capabilities/a",
          frontmatter: {
            kind: "capability",
            title: "A",
            depends_on: ["capabilities/b"],
          },
        }),
        makeDoc({
          slug: "capabilities/b",
          frontmatter: { kind: "capability", title: "B" },
        }),
      ]),
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      id: "capabilities/a--dependencies-->capabilities/b",
      source: "capabilities/a",
      target: "capabilities/b",
      data: {
        frontmatterKey: "dependencies",
        semanticType: "relation",
      },
    });
  });

  it("큰 vault 에 일부 canvasPosition 만 있으면 자동 layout 으로 복구한다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            kind: "project",
            domains: ["domains/a", "domains/b", "domains/c"],
          },
        }),
        makeDoc({
          slug: "domains/a",
          frontmatter: {
            kind: "domain",
            title: "A",
            canvasPosition: { x: 10_000, y: 10_000 },
          },
        }),
        makeDoc({
          slug: "domains/b",
          frontmatter: {
            kind: "domain",
            title: "B",
            canvasPosition: { x: 20_000, y: 20_000 },
          },
        }),
        makeDoc({
          slug: "domains/c",
          frontmatter: { kind: "domain", title: "C" },
        }),
      ]),
      { layoutMode: "dagre" },
    );

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId["domains/a"]?.position).not.toEqual({ x: 10_000, y: 10_000 });
    expect(byId["domains/b"]?.position).not.toEqual({ x: 20_000, y: 20_000 });
    expect(byId["project"]?.position.x).toBeLessThan(
      byId["domains/a"]?.position.x ?? Number.NEGATIVE_INFINITY,
    );
  });

  it("충분한 canvasPosition coverage 가 있으면 사용자 layout 을 복원한다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            kind: "project",
            domains: ["domains/a", "domains/b"],
            canvasPosition: { x: 10, y: 20 },
          },
        }),
        makeDoc({
          slug: "domains/a",
          frontmatter: {
            kind: "domain",
            title: "A",
            canvasPosition: { x: 300, y: 400 },
          },
        }),
        makeDoc({
          slug: "domains/b",
          frontmatter: {
            kind: "domain",
            title: "B",
            canvasPosition: { x: 500, y: 600 },
          },
        }),
      ]),
    );

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.project?.position).toEqual({ x: 10, y: 20 });
    expect(byId["domains/a"]?.position).toEqual({ x: 300, y: 400 });
    expect(byId["domains/b"]?.position).toEqual({ x: 500, y: 600 });
  });

  it("자동 정렬 옵션은 충분한 canvasPosition 도 무시한다", () => {
    const result = buildVaultGraphFlow(
      makeManifest([
        makeDoc({
          slug: "project",
          frontmatter: {
            kind: "project",
            domains: ["domains/a", "domains/b"],
            canvasPosition: { x: 10, y: 20 },
          },
        }),
        makeDoc({
          slug: "domains/a",
          frontmatter: {
            kind: "domain",
            title: "A",
            canvasPosition: { x: 300, y: 400 },
          },
        }),
        makeDoc({
          slug: "domains/b",
          frontmatter: {
            kind: "domain",
            title: "B",
            canvasPosition: { x: 500, y: 600 },
          },
        }),
      ]),
      { ignorePersistedPosition: true },
    );

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.project?.position).not.toEqual({ x: 10, y: 20 });
    expect(byId["domains/a"]?.position).not.toEqual({ x: 300, y: 400 });
    expect(byId["domains/b"]?.position).not.toEqual({ x: 500, y: 600 });
  });
});

describe("stripTrailingParenthetical", () => {
  it("트레일링 괄호 메타 strip", () => {
    expect(
      stripTrailingParenthetical("CLI Developer Entry (16 commands incl. bootstrap)"),
    ).toBe("CLI Developer Entry");
  });
  it("중첩 괄호도 trailing 그룹이면 전체 strip", () => {
    expect(
      stripTrailingParenthetical("Ontology Hub — Mode-Aware (Q1=(a))"),
    ).toBe("Ontology Hub — Mode-Aware");
  });
  it("괄호 없으면 그대로", () => {
    expect(stripTrailingParenthetical("Mode-Aware Adapter")).toBe(
      "Mode-Aware Adapter",
    );
  });
  it("중간 괄호 + 뒤 텍스트는 strip 안 함", () => {
    expect(stripTrailingParenthetical("Foo (bar) baz")).toBe("Foo (bar) baz");
  });
  it("괄호로 시작하는 타이틀은 그대로", () => {
    expect(stripTrailingParenthetical("(Internal)")).toBe("(Internal)");
  });
});

describe("resolveNodeDomainSlug", () => {
  const make = (slug: string, kind: string, fm: Record<string, unknown> = {}) =>
    ({
      slug,
      path: `${slug}.md`,
      title: slug,
      tags: [],
      frontmatter: { kind, title: slug, ...fm },
      headings: [],
      excerpt: "",
      wordCount: 0,
      updatedAt: "2026-05-14T00:00:00Z",
      linksOut: [],
    }) as VaultDoc;

  it("domain → 자기 tail slug", () => {
    expect(
      resolveNodeDomainSlug(make("domains/ai-agent-partner", "domain"), "domain"),
    ).toBe("ai-agent-partner");
  });
  it("capability → frontmatter.domain", () => {
    expect(
      resolveNodeDomainSlug(
        make("capabilities/x", "capability", { domain: "foo" }),
        "capability",
      ),
    ).toBe("foo");
  });
  it("element → frontmatter.domain", () => {
    expect(
      resolveNodeDomainSlug(
        make("elements/y", "element", { domain: "bar" }),
        "element",
      ),
    ).toBe("bar");
  });
  it("project → null", () => {
    expect(resolveNodeDomainSlug(make("project", "project"), "project")).toBeNull();
  });
  it("frontmatter.domain 없으면 null", () => {
    expect(
      resolveNodeDomainSlug(
        make("capabilities/z", "capability"),
        "capability",
      ),
    ).toBeNull();
  });
});
