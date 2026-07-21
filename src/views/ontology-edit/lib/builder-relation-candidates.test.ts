import { describe, expect, it } from "vitest";
import {
  buildRelationCandidates,
  type RelationCandidateNode,
} from "./builder-relation-candidates";

const NODES: RelationCandidateNode[] = [
  { slug: "capabilities/agent-brief", title: "Agent Brief", kind: "capability" },
  { slug: "domains/auth", title: "Auth", kind: "domain" },
  { slug: "elements/mcp-server", title: "MCP Server", kind: "element" },
  { slug: "capabilities/token-issue", title: "Token Issue", kind: "capability" },
];

describe("buildRelationCandidates", () => {
  it("자기 자신은 후보에서 제외한다 (자기 참조 관계 불가)", () => {
    const result = buildRelationCandidates({
      sourceSlug: "domains/auth",
      existingTargets: [],
      nodes: NODES,
      query: "",
    });
    expect(result.map((n) => n.slug)).not.toContain("domains/auth");
  });

  it("이미 관계가 있는 대상은 제외한다 (중복 회피)", () => {
    const result = buildRelationCandidates({
      sourceSlug: "domains/auth",
      existingTargets: ["capabilities/token-issue"],
      nodes: NODES,
      query: "",
    });
    expect(result.map((n) => n.slug)).not.toContain("capabilities/token-issue");
  });

  it("query 는 title / slug 부분일치 (대소문자 무시)", () => {
    expect(
      buildRelationCandidates({
        sourceSlug: "x",
        existingTargets: [],
        nodes: NODES,
        query: "agent",
      }).map((n) => n.slug),
    ).toEqual(["capabilities/agent-brief"]);
    // slug 조각으로도 매치
    expect(
      buildRelationCandidates({
        sourceSlug: "x",
        existingTargets: [],
        nodes: NODES,
        query: "mcp-server",
      }).map((n) => n.slug),
    ).toEqual(["elements/mcp-server"]);
  });

  it("결과는 title 오름차순 정렬", () => {
    const result = buildRelationCandidates({
      sourceSlug: "x",
      existingTargets: [],
      nodes: NODES,
      query: "",
    });
    expect(result.map((n) => n.title)).toEqual([
      "Agent Brief",
      "Auth",
      "MCP Server",
      "Token Issue",
    ]);
  });

  it("limit 로 결과 개수를 제한한다 (팝오버 폭주 방지)", () => {
    const result = buildRelationCandidates({
      sourceSlug: "x",
      existingTargets: [],
      nodes: NODES,
      query: "",
      limit: 2,
    });
    expect(result).toHaveLength(2);
  });
});
