import { describe, expect, it } from "vitest";
import { buildAtlasFrontmatterMarkdown } from "./export-frontmatter";
import type { EphemeralNode } from "./use-ephemeral-nodes";
import type { EphemeralEdge } from "./use-ephemeral-edges";

function node(overrides: Partial<EphemeralNode> = {}): EphemeralNode {
  return {
    id: "n1",
    kind: "capability",
    kindLabel: "역량",
    title: "Token Issue",
    x: 0,
    y: 0,
    ...overrides,
  };
}

function edge(overrides: Partial<EphemeralEdge> = {}): EphemeralEdge {
  return {
    id: "e1",
    source: "capability.token-issue",
    target: "element.jwt",
    edgeType: "related_to",
    ...overrides,
  };
}

describe("buildAtlasFrontmatterMarkdown", () => {
  it("빈 입력 — 안내 문구만 노출, Nodes/Relations 섹션 없음", () => {
    const md = buildAtlasFrontmatterMarkdown({
      ephemeralNodes: [],
      ephemeralEdges: [],
    });
    expect(md).toContain("# Atlas export");
    expect(md).toContain("No ephemeral nodes or relations yet");
    expect(md).not.toContain("## Nodes");
    expect(md).not.toContain("## Relations");
  });

  it("노드 — kind.slug id + frontmatter(kind/title/status/version) + 본문", () => {
    const md = buildAtlasFrontmatterMarkdown({
      ephemeralNodes: [node({ kind: "capability", title: "Token Issue" })],
      ephemeralEdges: [],
    });
    expect(md).toContain("## Nodes");
    expect(md).toContain("id: capability.token-issue");
    expect(md).toContain("kind: capability");
    expect(md).toContain("title: Token Issue");
    expect(md).toContain("status: draft");
    expect(md).toContain("version: 1");
    // 본문 헤딩 + 작성 안내
    expect(md).toContain("## Token Issue");
    expect(md).toContain("(Add a 1-2 line summary or description here.)");
  });

  it("관계 — `source → target (edgeType)` 리스트", () => {
    const md = buildAtlasFrontmatterMarkdown({
      ephemeralNodes: [],
      ephemeralEdges: [edge()],
    });
    expect(md).toContain("## Relations");
    expect(md).toContain(
      "- capability.token-issue → element.jwt (related_to)",
    );
  });

  it("slug — 공백→대시, 특수문자 제거, 한글 보존, 빈 제목→node, 32자 cap", () => {
    expect(
      buildAtlasFrontmatterMarkdown({
        ephemeralNodes: [node({ kind: "domain", title: "User Auth! (v2)" })],
        ephemeralEdges: [],
      }),
    ).toContain("id: domain.user-auth-v2");
    // 한글 보존
    expect(
      buildAtlasFrontmatterMarkdown({
        ephemeralNodes: [node({ kind: "domain", title: "인증 도메인" })],
        ephemeralEdges: [],
      }),
    ).toContain("id: domain.인증-도메인");
    // 비어있는(특수문자만) 제목 → "node"
    expect(
      buildAtlasFrontmatterMarkdown({
        ephemeralNodes: [node({ kind: "element", title: "@#$%" })],
        ephemeralEdges: [],
      }),
    ).toContain("id: element.node");
  });

  it("YAML — 콜론 포함 제목은 따옴표로 escape", () => {
    const md = buildAtlasFrontmatterMarkdown({
      ephemeralNodes: [node({ title: "Auth: token flow" })],
      ephemeralEdges: [],
    });
    // 콜론은 안전 정규식에 안 걸려 quoted 형태로.
    expect(md).toContain('title: "Auth: token flow"');
  });
});
