import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { VaultDoc } from "@/entities/docs-vault";
import { buildRecentActivityRows, resolveRecentActivityAgo } from "./recent-activity";

function doc(overrides: Partial<VaultDoc> & Pick<VaultDoc, "slug" | "updatedAt">): VaultDoc {
  return {
    path: `${overrides.slug}.md`,
    title: overrides.slug,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: "",
    wordCount: 0,
    linksOut: [],
    ...overrides,
  };
}

function node(id: string, kind: string, title: string, summary?: string): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    summary,
  };
}

describe("resolveRecentActivityAgo", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("labels same-day updates as today", () => {
    expect(resolveRecentActivityAgo(new Date("2026-07-18T01:00:00.000Z"), now)).toEqual({
      unit: "today",
    });
  });

  it("labels 1-day-old updates as yesterday", () => {
    expect(resolveRecentActivityAgo(new Date("2026-07-17T01:00:00.000Z"), now)).toEqual({
      unit: "yesterday",
    });
  });

  it("labels older updates with a day count", () => {
    expect(resolveRecentActivityAgo(new Date("2026-07-13T01:00:00.000Z"), now)).toEqual({
      unit: "daysAgo",
      days: 5,
    });
  });
});

describe("buildRecentActivityRows", () => {
  it("sorts vault docs by real mtime desc, resolves kind + nearest domain title, skips project/readme noise", () => {
    // doc.slug 는 vault-relative 전체 경로(deriveDocNode 의 doc.slug 규약과 동일하게
    // "ontology/" 루트 접두를 포함) — 실제 node id 는 file tail 만 쓴다는 점이
    // 이 테스트의 핵심 회귀 포인트다.
    const docs: VaultDoc[] = [
      doc({
        slug: "ontology/elements/topology-map-canvas",
        updatedAt: "2026-07-18T09:00:00.000Z",
        description: "지도 뷰 단일 컨테이너 변환 엔진",
        frontmatter: { kind: "element" },
      }),
      doc({
        slug: "ontology/capabilities/mcp-server",
        updatedAt: "2026-07-17T09:00:00.000Z",
        description: "write 도구 9종으로 확장",
        frontmatter: { kind: "capability" },
      }),
      doc({
        slug: "project",
        updatedAt: "2026-07-18T10:00:00.000Z",
        frontmatter: { kind: "project" },
      }),
      doc({
        slug: "README",
        updatedAt: "2026-07-18T11:00:00.000Z",
        frontmatter: { kind: "vault-readme" },
      }),
    ];
    const nodes = [
      node("element:topology-map-canvas", "element", "topology-map-canvas"),
      node("capability:mcp-server", "capability", "MCP Server"),
      node("domain:views", "domain", "Views"),
      node("domain:ai-agent-partner", "domain", "AI Agent Partner"),
    ];
    const parentOf = new Map<string, string>([
      ["element:topology-map-canvas", "domain:views"],
      ["capability:mcp-server", "domain:ai-agent-partner"],
    ]);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const rows = buildRecentActivityRows(docs, nodeById, parentOf, 4);

    expect(rows).toEqual([
      {
        slug: "ontology/elements/topology-map-canvas",
        kind: "element",
        domainTitle: "Views",
        what: "지도 뷰 단일 컨테이너 변환 엔진",
        updatedAt: new Date("2026-07-18T09:00:00.000Z"),
      },
      {
        slug: "ontology/capabilities/mcp-server",
        kind: "capability",
        domainTitle: "AI Agent Partner",
        what: "write 도구 9종으로 확장",
        updatedAt: new Date("2026-07-17T09:00:00.000Z"),
      },
    ]);
  });

  it("falls back to the node summary, then the doc excerpt, when description is missing", () => {
    const docs: VaultDoc[] = [
      doc({
        slug: "ontology/elements/a",
        updatedAt: "2026-07-18T09:00:00.000Z",
        excerpt: "excerpt text",
        frontmatter: { kind: "element" },
      }),
    ];
    const nodes = [node("element:a", "element", "a", "summary text")];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const rows = buildRecentActivityRows(docs, nodeById, new Map(), 4);

    expect(rows[0].what).toBe("summary text");
  });

  it("respects the limit and returns an empty array when there is nothing to show", () => {
    expect(buildRecentActivityRows([], new Map(), new Map(), 4)).toEqual([]);
  });
});
