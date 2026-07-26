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
  // 두 생산 경로(`scripts/build-docs-vault.mjs`, `build-local-manifest.ts`)는
  // 둘 다 `doc.description` 을 **frontmatter 의 그 키에서만** 채운다. 픽스처도
  // 같게 둔다 — 한쪽만 채운 픽스처는 실제로 불가능한 문서를 시험하는 것이다.
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
    // `node.summary` 도 폴백에서 뺀다: 그 값 자체가 `doc.excerpt` 로 떨어지므로
    // 남겨 두면 발췌가 한 칸 우회해서 다시 들어온다.
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
    // 같은 문서, 같은 판정 — 카드 본문 소비자와 한 출처를 쓴다.
    expect(resolveAuthoredDescription(written)).toBe("지도 뷰 단일 컨테이너 변환 엔진");
  });

  it("respects the limit and returns an empty array when there is nothing to show", () => {
    expect(buildRecentActivityRows([], new Map(), new Map(), 4)).toEqual([]);
  });
});
