import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { VaultDoc } from "@/entities/docs-vault";
import { buildRecentActivityRows, resolveRecentActivityAgo } from "./recent-activity";
import { resolveAuthoredDescription } from "./authored-description";

function doc(overrides: Partial<VaultDoc> & Pick<VaultDoc, "slug" | "updatedAt">): VaultDoc {
  const merged: VaultDoc = {
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
  // Both production paths (`scripts/build-docs-vault.mjs`, `build-local-manifest.ts`) fill
  // `doc.description` **only from that frontmatter key**. The fixture matches — a fixture filling only
  // one side would be testing a document that cannot actually exist.
  if (typeof merged.description === "string" && merged.frontmatter.description === undefined) {
    merged.frontmatter = { ...merged.frontmatter, description: merged.description };
  }
  return merged;
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
    // `doc.slug` is the full vault-relative path (including the "ontology/" root prefix, matching
    // `deriveDocNode`'s doc.slug convention) — that a real node id uses only the file tail is this test's
    // core regression point.
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
        nodeId: "element:topology-map-canvas",
        title: "topology-map-canvas",
        domainTitle: "Views",
        what: "지도 뷰 단일 컨테이너 변환 엔진",
        updatedAt: new Date("2026-07-18T09:00:00.000Z"),
      },
      {
        slug: "ontology/capabilities/mcp-server",
        kind: "capability",
        nodeId: "capability:mcp-server",
        title: "MCP Server",
        domainTitle: "AI Agent Partner",
        what: "write 도구 9종으로 확장",
        updatedAt: new Date("2026-07-17T09:00:00.000Z"),
      },
    ]);
  });

  it("leaves nodeId null when the doc has no matching graph node (dangling doc)", () => {
    const docs: VaultDoc[] = [
      doc({
        slug: "ontology/elements/orphaned",
        updatedAt: "2026-07-18T09:00:00.000Z",
        frontmatter: { kind: "element" },
      }),
    ];

    const rows = buildRecentActivityRows(docs, new Map(), new Map(), 4);

    expect(rows[0].nodeId).toBeNull();
  });

  it("설명이 없으면 발췌로 떨어지지 않는다 — 카드 본문과 같은 규칙(A2)", () => {
    // `node.summary` is excluded from the fallback too: that value itself falls back to `doc.excerpt`, so
    // keeping it lets the excerpt back in via one detour.
    const docs: VaultDoc[] = [
      doc({
        slug: "ontology/elements/a",
        updatedAt: "2026-07-18T09:00:00.000Z",
        excerpt: "VaultAgentSetupPanel (merged into AppSettingsMenu's vault / mcpAgents t",
        frontmatter: { kind: "element" },
      }),
    ];
    const nodes = [
      node("element:a", "element", "a", "VaultAgentSetupPanel (merged into AppSettingsMenu"),
    ];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const rows = buildRecentActivityRows(docs, nodeById, new Map(), 4);

    expect(rows[0].what).toBe("");
  });

  it("사람이 쓴 frontmatter description 만 행에 실린다 — 카드 본문과 같은 함수", () => {
    const written = doc({
      slug: "ontology/elements/a",
      updatedAt: "2026-07-18T09:00:00.000Z",
      description: "지도 뷰 단일 컨테이너 변환 엔진",
      excerpt: "본문 첫 줄이라 발췌로 잡힌 내부 메모",
      frontmatter: { kind: "element" },
    });

    const rows = buildRecentActivityRows([written], new Map(), new Map(), 4);

    expect(rows[0].what).toBe("지도 뷰 단일 컨테이너 변환 엔진");
    // Same document, same verdict — one source shared with the card-body consumer.
    expect(resolveAuthoredDescription(written)).toBe("지도 뷰 단일 컨테이너 변환 엔진");
  });

  it("respects the limit and returns an empty array when there is nothing to show", () => {
    expect(buildRecentActivityRows([], new Map(), new Map(), 4)).toEqual([]);
  });
});
